/**
 * MoneyCouncil IndexedDB Offline Storage Service.
 * Provides user-isolated offline caching, an outbox queue for offline transaction creation,
 * and security state persistence without relying on localStorage or HTTP caches.
 */

const DB_NAME = "moneycouncil_offline_db";
const DB_VERSION = 1;

export interface OfflineUserDataRecord {
  id: string; // `${userId}:${resource}`
  userId: string;
  resource: string;
  data: any;
  last_synced_at: string;
}

export interface OutboxItem {
  client_id: string;
  user_id: string;
  resource: "transaction";
  action: "create";
  payload: any;
  created_at: string;
  status: "pending" | "failed";
  error_message?: string;
  retry_count: number;
}

export interface SecuritySettingsRecord {
  userId: string;
  pin_hash: string | null;
  pin_salt: string | null;
  encrypt_offline: boolean;
  auto_lock_minutes: number;
}

let dbInstance: IDBDatabase | null = null;

export async function getDb(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      return reject(new Error("IndexedDB is not supported in this environment."));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // 1. User Data Store (Categories, Transactions, Budgets, Goals, Debts, Summary, Council History)
      if (!db.objectStoreNames.contains("user_data")) {
        const userDataStore = db.createObjectStore("user_data", { keyPath: "id" });
        userDataStore.createIndex("by_user", "userId", { unique: false });
        userDataStore.createIndex("by_user_resource", ["userId", "resource"], { unique: true });
      }

      // 2. Outbox Queue Store (Offline writes)
      if (!db.objectStoreNames.contains("outbox")) {
        const outboxStore = db.createObjectStore("outbox", { keyPath: "client_id" });
        outboxStore.createIndex("by_user", "user_id", { unique: false });
        outboxStore.createIndex("by_status", "status", { unique: false });
      }

      // 3. Security Settings Store (PIN Lock and Encryption)
      if (!db.objectStoreNames.contains("security")) {
        db.createObjectStore("security", { keyPath: "userId" });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onerror = () => {
      reject(request.error || new Error("Failed to open IndexedDB"));
    };
  });
}

/**
 * Saves cached data for a specific user and resource.
 * Handles storage quota limits gracefully without crashing.
 */
export async function saveUserData(userId: string, resource: string, data: any): Promise<void> {
  if (!userId) return;
  try {
    const db = await getDb();
    const tx = db.transaction("user_data", "readwrite");
    const store = tx.objectStore("user_data");

    const record: OfflineUserDataRecord = {
      id: `${userId}:${resource}`,
      userId,
      resource,
      data,
      last_synced_at: new Date().toISOString(),
    };

    store.put(record);

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => {
        // Handle QuotaExceededError gracefully
        if (tx.error && tx.error.name === "QuotaExceededError") {
          resolve();
        } else {
          reject(tx.error);
        }
      };
    });
  } catch (err) {
    // Gracefully ignore storage write failures
  }
}

/**
 * Retrieves cached data for a specific user and resource.
 */
export async function getUserData<T = any>(
  userId: string,
  resource: string
): Promise<{ data: T; last_synced_at: string } | null> {
  if (!userId) return null;
  try {
    const db = await getDb();
    const tx = db.transaction("user_data", "readonly");
    const store = tx.objectStore("user_data");
    const request = store.get(`${userId}:${resource}`);

    return new Promise((resolve) => {
      request.onsuccess = () => {
        const record = request.result as OfflineUserDataRecord | undefined;
        if (record && record.userId === userId) {
          resolve({ data: record.data, last_synced_at: record.last_synced_at });
        } else {
          resolve(null);
        }
      };
      request.onerror = () => resolve(null);
    });
  } catch (err) {
    return null;
  }
}

/**
 * Clears all cached data and pending outbox for a specific user upon logout or switch.
 */
export async function clearUserData(userId: string): Promise<void> {
  if (!userId) return;
  try {
    const db = await getDb();

    // 1. Clear user_data partition
    const dataTx = db.transaction("user_data", "readwrite");
    const dataStore = dataTx.objectStore("user_data");
    const userIndex = dataStore.index("by_user");
    const req = userIndex.openCursor(IDBKeyRange.only(userId));

    await new Promise<void>((resolve) => {
      req.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest).result as IDBCursorWithValue;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
      req.onerror = () => resolve();
    });

    // 2. Clear user's outbox items
    const outboxTx = db.transaction("outbox", "readwrite");
    const outboxStore = outboxTx.objectStore("outbox");
    const outboxUserIndex = outboxStore.index("by_user");
    const outboxReq = outboxUserIndex.openCursor(IDBKeyRange.only(userId));

    await new Promise<void>((resolve) => {
      outboxReq.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest).result as IDBCursorWithValue;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
      outboxReq.onerror = () => resolve();
    });
  } catch (err) {
    // Ignore clear failures
  }
}

/**
 * Clears all databases (for factory reset).
 */
export async function clearAllOfflineData(): Promise<void> {
  try {
    if (dbInstance) {
      dbInstance.close();
      dbInstance = null;
    }
    return new Promise((resolve) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  } catch (err) {
    // Ignore
  }
}

// -------------------------------------------------------------
// Outbox Queue Management (Offline Transaction Creation)
// -------------------------------------------------------------

export async function addToOutbox(item: OutboxItem): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("outbox", "readwrite");
  const store = tx.objectStore("outbox");
  store.put(item);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getOutbox(userId: string): Promise<OutboxItem[]> {
  if (!userId) return [];
  try {
    const db = await getDb();
    const tx = db.transaction("outbox", "readonly");
    const store = tx.objectStore("outbox");
    const index = store.index("by_user");
    const req = index.getAll(IDBKeyRange.only(userId));

    return new Promise((resolve) => {
      req.onsuccess = () => {
        const items = (req.result as OutboxItem[]) || [];
        // Sort oldest first (FIFO order)
        items.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        resolve(items);
      };
      req.onerror = () => resolve([]);
    });
  } catch (err) {
    return [];
  }
}

export async function updateOutboxItem(
  clientId: string,
  updates: Partial<OutboxItem>
): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("outbox", "readwrite");
  const store = tx.objectStore("outbox");
  const req = store.get(clientId);

  return new Promise((resolve, reject) => {
    req.onsuccess = () => {
      const item = req.result as OutboxItem;
      if (item) {
        Object.assign(item, updates);
        store.put(item);
      }
      resolve();
    };
    req.onerror = () => reject(req.error);
  });
}

export async function removeFromOutbox(clientId: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("outbox", "readwrite");
  const store = tx.objectStore("outbox");
  store.delete(clientId);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// -------------------------------------------------------------
// Security Settings & Local PIN Storage
// -------------------------------------------------------------

export async function getSecuritySettings(userId: string): Promise<SecuritySettingsRecord | null> {
  if (!userId) return null;
  try {
    const db = await getDb();
    const tx = db.transaction("security", "readonly");
    const store = tx.objectStore("security");
    const req = store.get(userId);

    return new Promise((resolve) => {
      req.onsuccess = () => resolve((req.result as SecuritySettingsRecord) || null);
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    return null;
  }
}

export async function saveSecuritySettings(
  userId: string,
  settings: SecuritySettingsRecord
): Promise<void> {
  if (!userId) return;
  const db = await getDb();
  const tx = db.transaction("security", "readwrite");
  const store = tx.objectStore("security");
  store.put(settings);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Requests persistent storage from browser after login.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.storage && navigator.storage.persist) {
    try {
      const isPersisted = await navigator.storage.persist();
      return isPersisted;
    } catch {
      return false;
    }
  }
  return false;
}
