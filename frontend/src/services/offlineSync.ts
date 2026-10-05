/**
 * MoneyCouncil Offline Synchronization Engine.
 * Manages outbox queue processing, background replay, network state monitoring,
 * and optimistic cache reconciliation for offline-created transactions.
 */
import { apiClient } from "../api/client";
import {
  getOutbox,
  removeFromOutbox,
  updateOutboxItem,
  getUserData,
  saveUserData,
} from "./db";

export type SyncState = "online" | "offline" | "syncing" | "idle";

type SyncListener = (state: SyncState, outboxCount: number) => void;
const syncListeners: Set<SyncListener> = new Set();

let isSyncing = false;
let lastSyncedTime: Date | null = null;

export function generateUUID(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function subscribeSyncStatus(listener: SyncListener): () => void {
  syncListeners.add(listener);
  return () => syncListeners.delete(listener);
}

function notifySyncListeners(state: SyncState, outboxCount: number) {
  syncListeners.forEach((l) => l(state, outboxCount));
}

export function getLastSyncedTime(): Date | null {
  return lastSyncedTime;
}

/**
 * Replays all pending outbox items for the current user in order.
 */
export async function syncUserOutbox(userId: string): Promise<{
  syncedCount: number;
  failedCount: number;
  sessionExpired: boolean;
}> {
  if (!userId || isSyncing || !navigator.onLine) {
    return { syncedCount: 0, failedCount: 0, sessionExpired: false };
  }

  isSyncing = true;
  let syncedCount = 0;
  let failedCount = 0;
  let sessionExpired = false;

  try {
    const items = await getOutbox(userId);
    notifySyncListeners("syncing", items.length);

    for (const item of items) {
      if (item.status === "failed" && item.retry_count >= 5) {
        failedCount++;
        continue;
      }

      try {
        if (item.resource === "transaction" && item.action === "create") {
          const payload = {
            ...item.payload,
            client_id: item.client_id,
          };

          const serverRecord = await apiClient<any>("/api/v1/transactions", {
            method: "POST",
            body: JSON.stringify(payload),
          });

          // Successfully processed / confirmed by server
          await removeFromOutbox(item.client_id);
          syncedCount++;

          // Reconcile optimistic local cache
          await reconcileLocalTransaction(userId, item.client_id, serverRecord);
        }
      } catch (err: any) {
        const statusMsg = err.message || "";
        if (statusMsg.includes("401") || statusMsg.includes("403") || statusMsg.includes("Not authenticated")) {
          sessionExpired = true;
          break; // Stop sync until user authenticates again
        } else {
          failedCount++;
          await updateOutboxItem(item.client_id, {
            status: "failed",
            error_message: statusMsg,
            retry_count: (item.retry_count || 0) + 1,
          });
        }
      }
    }

    const remaining = await getOutbox(userId);
    lastSyncedTime = new Date();
    notifySyncListeners(navigator.onLine ? "idle" : "offline", remaining.length);
  } finally {
    isSyncing = false;
  }

  return { syncedCount, failedCount, sessionExpired };
}

/**
 * Replaces optimistic offline transaction in local cache with the confirmed server record.
 */
async function reconcileLocalTransaction(userId: string, clientId: string, serverRecord: any) {
  try {
    const cached = await getUserData<any>(userId, "transactions");
    if (cached && cached.data) {
      let list = Array.isArray(cached.data) ? cached.data : cached.data.items || [];
      // Replace matching client_id item or append if missing
      const idx = list.findIndex((tx: any) => tx.client_id === clientId || tx.id === clientId);
      if (idx >= 0) {
        list[idx] = serverRecord;
      } else {
        list.unshift(serverRecord);
      }

      if (Array.isArray(cached.data)) {
        await saveUserData(userId, "transactions", list);
      } else {
        await saveUserData(userId, "transactions", {
          ...cached.data,
          items: list,
          total_count: (cached.data.total_count || 0) + (idx >= 0 ? 0 : 1),
        });
      }
    }
  } catch {
    // Ignore cache reconciliation error
  }
}
