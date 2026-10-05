import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useAuth } from "./AuthContext";
import {
  saveUserData,
  getUserData,
  addToOutbox,
  getOutbox,
  removeFromOutbox,
  updateOutboxItem,
  OutboxItem,
  requestPersistentStorage,
} from "../services/db";
import {
  syncUserOutbox,
  generateUUID,
  subscribeSyncStatus,
  SyncState,
} from "../services/offlineSync";
import { apiClient } from "../api/client";

interface SyncContextType {
  isOnline: boolean;
  syncStatus: SyncState;
  lastSyncedAt: Date | null;
  outboxItems: OutboxItem[];
  triggerSync: () => Promise<void>;
  createOfflineTransaction: (payload: any) => Promise<any>;
  retryOutboxItem: (clientId: string) => Promise<void>;
  discardOutboxItem: (clientId: string) => Promise<void>;
  loadCachedOrFetch: <T>(
    resource: string,
    fetcher: () => Promise<T>,
    onCached?: (data: T) => void
  ) => Promise<T | null>;
}

const SyncContext = createContext<SyncContextType | null>(null);

export const SyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const userId = user?.id || "";

  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [syncStatus, setSyncStatus] = useState<SyncState>(isOnline ? "idle" : "offline");
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [outboxItems, setOutboxItems] = useState<OutboxItem[]>([]);

  const refreshOutbox = useCallback(async () => {
    if (!userId) {
      setOutboxItems([]);
      return;
    }
    const items = await getOutbox(userId);
    setOutboxItems(items);
  }, [userId]);

  const triggerSync = useCallback(async () => {
    if (!userId || !navigator.onLine) return;
    setSyncStatus("syncing");
    await syncUserOutbox(userId);
    setLastSyncedAt(new Date());
    await refreshOutbox();
    setSyncStatus(navigator.onLine ? "idle" : "offline");
  }, [userId, refreshOutbox]);

  // Network online/offline event listeners
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setSyncStatus("idle");
      triggerSync();
    };

    const handleOffline = () => {
      setIsOnline(false);
      setSyncStatus("offline");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const unsubscribe = subscribeSyncStatus((status) => {
      setSyncStatus(status);
    });

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      unsubscribe();
    };
  }, [triggerSync]);

  // When user logs in, request persistent storage and sync outbox
  useEffect(() => {
    if (userId) {
      requestPersistentStorage();
      refreshOutbox();
      if (navigator.onLine) {
        triggerSync();
      }
    }
  }, [userId, refreshOutbox, triggerSync]);

  /**
   * Stale-While-Revalidate Data Fetcher
   * Returns cached data immediately if available, then updates from network in background.
   */
  const loadCachedOrFetch = useCallback(
    async <T,>(
      resource: string,
      fetcher: () => Promise<T>,
      onCached?: (data: T) => void
    ): Promise<T | null> => {
      let cachedData: T | null = null;

      // 1. Return cached data immediately if found in IndexedDB
      if (userId) {
        try {
          const cached = await getUserData<T>(userId, resource);
          if (cached && cached.data !== null && cached.data !== undefined) {
            cachedData = cached.data;
            if (cached.last_synced_at) {
              setLastSyncedAt(new Date(cached.last_synced_at));
            }
            if (onCached) {
              onCached(cached.data);
            }
          }
        } catch {
          // Gracefully continue
        }
      }

      // 2. Fetch fresh data from network in background (if online)
      if (typeof navigator !== "undefined" && navigator.onLine) {
        try {
          const freshData = await fetcher();
          if (userId && freshData !== null && freshData !== undefined) {
            await saveUserData(userId, resource, freshData);
            setLastSyncedAt(new Date());
          }
          return freshData;
        } catch (err) {
          // If network fails and we had cached data, return that
          if (cachedData !== null) {
            return cachedData;
          }
          throw err;
        }
      }

      return cachedData;
    },
    [userId]
  );

  /**
   * Creates a transaction: if online, posts directly with client_id;
   * if offline or network failure, stores in outbox and updates optimistic cache.
   */
  const createOfflineTransaction = useCallback(
    async (payload: any): Promise<any> => {
      const clientId = payload.client_id || generateUUID();
      const itemWithClientId = { ...payload, client_id: clientId };

      if (navigator.onLine) {
        try {
          const res = await apiClient<any>("/api/v1/transactions", {
            method: "POST",
            body: JSON.stringify(itemWithClientId),
          });

          // Update local cached transactions
          if (userId) {
            const cached = await getUserData<any>(userId, "transactions");
            if (cached && cached.data) {
              const list = Array.isArray(cached.data) ? cached.data : cached.data.items || [];
              list.unshift(res);
              if (Array.isArray(cached.data)) {
                await saveUserData(userId, "transactions", list);
              } else {
                await saveUserData(userId, "transactions", {
                  ...cached.data,
                  items: list,
                  total_count: (cached.data.total_count || 0) + 1,
                });
              }
            }
          }

          return res;
        } catch (err: any) {
          // If network error occurred, fall through to offline queueing
          if (!err.message || !err.message.includes("400")) {
            // Queue to outbox
          } else {
            throw err;
          }
        }
      }

      // OFFLINE QUEUEING
      const optimisticTx = {
        id: clientId,
        client_id: clientId,
        user_id: userId,
        category_id: payload.category_id || null,
        amount: payload.amount,
        type: payload.type,
        date: payload.date,
        description: payload.description,
        is_recurring: payload.is_recurring || false,
        tags: payload.tags || [],
        created_at: new Date().toISOString(),
        is_pending_sync: true,
      };

      const outboxItem: OutboxItem = {
        client_id: clientId,
        user_id: userId,
        resource: "transaction",
        action: "create",
        payload: itemWithClientId,
        created_at: new Date().toISOString(),
        status: "pending",
        retry_count: 0,
      };

      await addToOutbox(outboxItem);
      await refreshOutbox();

      // Optimistically insert into local cache
      if (userId) {
        const cached = await getUserData<any>(userId, "transactions");
        if (cached && cached.data) {
          const list = Array.isArray(cached.data) ? cached.data : cached.data.items || [];
          list.unshift(optimisticTx);
          if (Array.isArray(cached.data)) {
            await saveUserData(userId, "transactions", list);
          } else {
            await saveUserData(userId, "transactions", {
              ...cached.data,
              items: list,
              total_count: (cached.data.total_count || 0) + 1,
            });
          }
        }
      }

      return optimisticTx;
    },
    [userId, refreshOutbox]
  );

  const retryOutboxItem = useCallback(
    async (clientId: string) => {
      await updateOutboxItem(clientId, { status: "pending", retry_count: 0 });
      await refreshOutbox();
      await triggerSync();
    },
    [refreshOutbox, triggerSync]
  );

  const discardOutboxItem = useCallback(
    async (clientId: string) => {
      await removeFromOutbox(clientId);
      await refreshOutbox();
    },
    [refreshOutbox]
  );

  return (
    <SyncContext.Provider
      value={{
        isOnline,
        syncStatus,
        lastSyncedAt,
        outboxItems,
        triggerSync,
        createOfflineTransaction,
        retryOutboxItem,
        discardOutboxItem,
        loadCachedOrFetch,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
};

export const useSync = () => {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error("useSync must be used within a SyncProvider");
  }
  return context;
};
