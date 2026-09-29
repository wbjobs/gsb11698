import { createBuiltinTexture } from './fixtures.js';
import { getCachedTexture, putCachedTexture } from './idb-cache.js';
import { DecodeError, parseKtx } from './ktx.js';

function serializeError(error) {
  return {
    name: error?.name || error?.constructor?.name || 'Error',
    message: error?.message || String(error),
    stack: error?.stack || ''
  };
}

async function fetchWithTimeout(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      mode: 'cors',
      credentials: 'omit',
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

function describeCorsError(error, url) {
  const target = new URL(url, self.location.href);
  const described = new Error(
    `跨域纹理加载失败：${ target.host } 未返回允许当前来源的 CORS 响应头。请配置 Access-Control-Allow-Origin，或改用同源/代理纹理。`
  );
  described.name = error?.name === 'AbortError' ? 'TextureTimeout' : 'CrossOriginTextureError';
  described.cause = serializeError(error);
  return described;
}

async function loadBuiltin(formatId, useCache) {
  const cacheKey = `builtin:${ formatId }:v1`;
  const cacheStart = performance.now();
  const cached = useCache ? await getCachedTexture(cacheKey) : null;
  const cacheReadMs = performance.now() - cacheStart;

  if (cached?.buffer) {
    const parseStart = performance.now();
    const parsed = parseKtx(cached.buffer);
    return {
      source: {
        kind: 'builtin',
        cacheKey,
        name: `内置 ${ parsed.format.label } KTX`,
        formatId,
        origin: self.location.origin,
        crossOrigin: false
      },
      parsed,
      loadMs: cacheReadMs,
      parseMs: performance.now() - parseStart,
      cached: true,
      cacheReadMs,
      cacheWrite: null,
      transferables: parsed.levels.map((level) => level.data.buffer)
    };
  }

  const generateStart = performance.now();
  const fixture = createBuiltinTexture(formatId);
  const generateMs = performance.now() - generateStart;
  const parsed = parseKtx(fixture.buffer);

  let cacheWrite = null;
  if (useCache) {
    cacheWrite = await putCachedTexture({
      cacheKey,
      kind: 'builtin',
      formatId,
      name: fixture.name,
      buffer: fixture.buffer,
      storedAt: new Date().toISOString()
    });
  }

  return {
    source: {
      kind: 'builtin',
      cacheKey,
      name: fixture.name,
      formatId,
      origin: self.location.origin,
      crossOrigin: false
    },
    parsed,
    loadMs: generateMs + cacheReadMs,
    generateMs,
    cached: false,
    cacheReadMs,
    cacheWrite,
    transferables: parsed.levels.map((level) => level.data.buffer)
  };
}

async function loadRemoteTexture(url, useCache) {
  const cacheKey = `url:${ url }`;
  const cacheStart = performance.now();
  const cached = useCache ? await getCachedTexture(cacheKey) : null;
  const cacheReadMs = performance.now() - cacheStart;

  if (cached?.buffer) {
    const parseStart = performance.now();
    const parsed = parseKtx(cached.buffer);
    return {
      source: {
        kind: 'remote',
        cacheKey,
        url,
        name: cached.name || url.split('/').pop() || url,
        origin: new URL(url, self.location.href).origin,
        crossOrigin: new URL(url, self.location.href).origin !== self.location.origin
      },
      parsed,
      loadMs: cacheReadMs,
      parseMs: performance.now() - parseStart,
      cached: true,
      cacheReadMs,
      cacheWrite: null,
      transferables: parsed.levels.map((level) => level.data.buffer)
    };
  }

  const fetchStart = performance.now();
  let response;

  try {
    response = await fetchWithTimeout(url);
  } catch (error) {
    throw describeCorsError(error, url);
  }

  if (!response.ok) {
    const error = new Error(`纹理 HTTP ${ response.status } ${ response.statusText }`);
    error.name = response.status === 404 ? 'TextureNotFound' : 'TextureHttpError';
    throw error;
  }

  const fetchMs = performance.now() - fetchStart;
  const buffer = await response.arrayBuffer();
  let parsed;

  try {
    parsed = parseKtx(buffer);
  } catch (error) {
    if (error instanceof DecodeError) {
      throw error;
    }
    throw new DecodeError(`KTX 解码失败：${ error.message }`);
  }

  let cacheWrite = null;
  if (useCache) {
    cacheWrite = await putCachedTexture({
      cacheKey,
      kind: 'remote',
      url,
      name: url.split('/').pop() || url,
      contentType: response.headers.get('content-type'),
      buffer,
      fetchedAt: new Date().toISOString()
    });
  }

  return {
    source: {
      kind: 'remote',
      cacheKey,
      url,
      name: url.split('/').pop() || url,
      origin: new URL(url, self.location.href).origin,
      crossOrigin: new URL(url, self.location.href).origin !== self.location.origin
    },
    parsed,
    loadMs: fetchMs,
    fetchMs,
    downloadBytes: buffer.byteLength,
    cached: false,
    cacheReadMs,
    cacheWrite,
    transferables: parsed.levels.map((level) => level.data.buffer)
  };
}

function loadLocalFile(name, buffer) {
  try {
    const parseStart = performance.now();
    const parsed = parseKtx(buffer);
    return {
      source: {
        kind: 'file',
        name,
        origin: self.location.origin,
        crossOrigin: false
      },
      parsed,
      loadMs: performance.now() - parseStart,
      parseMs: performance.now() - parseStart,
      cached: false,
      transferables: parsed.levels.map((level) => level.data.buffer)
    };
  } catch (error) {
    if (error instanceof DecodeError) {
      throw error;
    }
    throw new DecodeError(`KTX 解码失败：${ error.message }`);
  }
}

self.onmessage = async (event) => {
  const { id, action } = event.data;

  try {
    let result;

    if (action === 'loadBuiltin') {
      result = await loadBuiltin(event.data.formatId, event.data.cache !== false);
    } else if (action === 'loadUrl') {
      result = await loadRemoteTexture(event.data.url, event.data.cache !== false);
    } else if (action === 'loadFile') {
      result = loadLocalFile(event.data.name, event.data.buffer);
    } else {
      throw new Error(`未知 Worker 操作：${ action }`);
    }

    const { transferables, parsed, ...sourceResult } = result;

    self.postMessage({
      id,
      ok: true,
      ...sourceResult,
      parsed: {
        ...parsed,
        levels: parsed.levels.map((level) => ({
          ...level,
          data: new Uint8Array(level.data.buffer)
        }))
      }
    }, transferables);
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: serializeError(error)
    });
  }
};
