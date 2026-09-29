import { ERROR_CODES, TextureError } from './constants.js';
import { cacheGet, cachePut } from './cache.js';
import { markRange } from './performance.js';

export function isLikelyCorsError(error) {
  if (!error) return false;
  const text = `${error.name || ''} ${error.message || ''}`.toLowerCase();
  return error instanceof TypeError
    || text.includes('failed to fetch')
    || text.includes('cors')
    || text.includes('cross-origin')
    || text.includes('load failed');
}

export function isSameOrigin(url) {
  try {
    return new URL(url, location.href).origin === location.origin;
  } catch {
    return false;
  }
}

export async function fetchTextureBuffer(source, options = {}) {
  const started = performance.now();
  const { useCache = true, cacheable = true, signal } = options;
  const cacheKey = typeof source === 'string' ? source : source.url;

  if (useCache && cacheKey) {
    try {
      const cached = await cacheGet(cacheKey);
      if (cached?.value) {
        return {
          buffer: cached.value,
          source: cacheKey,
          fromCache: true,
          networkMs: 0,
          totalMs: performance.now() - started,
          contentType: cached.metadata?.contentType || null
        };
      }
    } catch (error) {
      console.warn('IndexedDB 纹理缓存读取失败，将继续走网络。', error);
    }
  }

  const fetchStarted = performance.now();
  let response;
  try {
    response = await fetch(source, { mode: 'cors', credentials: 'omit', signal });
  } catch (error) {
    if (signal?.aborted) throw new TextureError(ERROR_CODES.ABORTED, '纹理加载已取消', { cause: error });
    const cors = isLikelyCorsError(error);
    throw new TextureError(
      cors ? ERROR_CODES.CORS_FAILED : ERROR_CODES.NETWORK_FAILED,
      cors
        ? '跨域纹理被浏览器拦截：资源服务器需要返回 Access-Control-Allow-Origin，或改用同源代理/本地文件。'
        : '网络请求失败，请检查地址、TLS、连接和服务状态。',
      { url: cacheKey, cause: error }
    );
  }

  if (!response.ok) {
    throw new TextureError(ERROR_CODES.NETWORK_FAILED, `纹理服务返回 HTTP ${response.status}`, {
      url: cacheKey,
      status: response.status
    });
  }
  if (response.type === 'opaque') {
    throw new TextureError(ERROR_CODES.CORS_FAILED, '收到 opaque 响应，无法读取纹理 ArrayBuffer。');
  }

  let buffer;
  try {
    buffer = await response.arrayBuffer();
  } catch (error) {
    throw new TextureError(ERROR_CODES.CORS_FAILED, '响应已接收但读取 ArrayBuffer 被拒绝，通常仍是 CORS 配置问题。', { cause: error });
  }
  markRange('texture-fetch', fetchStarted, performance.now());

  if (useCache && cacheable && cacheKey) {
    try {
      await cachePut(cacheKey, buffer, {
        contentType: response.headers.get('content-type'),
        byteLength: buffer.byteLength,
        sameOrigin: isSameOrigin(cacheKey)
      });
    } catch (error) {
      console.warn('纹理写入 IndexedDB 失败，但本次加载不受影响。', error);
    }
  }

  markRange('texture-network-total', started, performance.now());
  return {
    buffer,
    source: cacheKey,
    fromCache: false,
    networkMs: performance.now() - started,
    totalMs: performance.now() - started,
    contentType: response.headers.get('content-type')
  };
}

export async function readFileBuffer(file) {
  const started = performance.now();
  try {
    const buffer = await file.arrayBuffer();
    markRange('texture-local-read', started, performance.now());
    return {
      buffer,
      source: file.name,
      fromCache: false,
      networkMs: 0,
      totalMs: performance.now() - started,
      contentType: file.type || null,
      localFile: true
    };
  } catch (error) {
    throw new TextureError(ERROR_CODES.NETWORK_FAILED, '本地文件读取失败', { cause: error });
  }
}
