const DB_NAME = 'compressed-texture-lab';
const STORE_NAME = 'texture-buffers';
const VERSION = 1;

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('当前环境不支持 IndexedDB'));
      return;
    }
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function withStore(mode, callback) {
  return openDatabase().then((db) => new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const request = callback(store);
    transaction.oncomplete = () => {
      db.close();
      resolve(request?.result);
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
    transaction.onabort = () => {
      db.close();
      reject(transaction.error || new Error('IndexedDB 事务被中止'));
    };
  }));
}

export async function cacheGet(key) {
  return withStore('readonly', (store) => store.get(key));
}

export async function cachePut(key, value, metadata = {}) {
  const record = {
    value,
    metadata: {
      ...metadata,
      cachedAt: new Date().toISOString()
    }
  };
  await withStore('readwrite', (store) => store.put(record, key));
}

export async function cacheDelete(key) {
  await withStore('readwrite', (store) => store.delete(key));
}

export async function cacheClear() {
  await withStore('readwrite', (store) => store.clear());
}

export async function cacheStats() {
  const keys = await withStore('readonly', (store) => store.getAllKeys());
  return { count: keys.length, keys };
}
