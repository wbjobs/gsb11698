const DATABASE_NAME = 'compressed-texture-lab';
const DATABASE_VERSION = 1;
const STORE_NAME = 'textures';

let databasePromise;

function openDatabase() {
  if (databasePromise) {
    return databasePromise;
  }

  databasePromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in self)) {
      reject(new Error('当前环境不支持 IndexedDB'));
      return;
    }

    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'cacheKey' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB 打开失败'));
  });

  return databasePromise;
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB 操作失败'));
  });
}

export async function getCachedTexture(cacheKey) {
  try {
    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, 'readonly');
    return await requestToPromise(transaction.objectStore(STORE_NAME).get(cacheKey));
  } catch {
    return null;
  }
}

export async function putCachedTexture(entry) {
  try {
    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    await requestToPromise(transaction.objectStore(STORE_NAME).put(entry));
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: error?.name || 'UnknownError',
      message: error?.message || 'IndexedDB 写入失败'
    };
  }
}

export async function deleteCachedTexture(cacheKey) {
  try {
    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    await requestToPromise(transaction.objectStore(STORE_NAME).delete(cacheKey));
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error?.message || 'IndexedDB 删除失败' };
  }
}

export async function clearCachedTextures() {
  try {
    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    await requestToPromise(transaction.objectStore(STORE_NAME).clear());
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error?.message || 'IndexedDB 清空失败' };
  }
}
