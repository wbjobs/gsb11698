import { createFallbackPixels } from './fallback.js';
import { estimateCompressedVram, parseTexture } from './parsers.js';

function serializeError(error) {
  return {
    name: error.name || 'Error',
    message: error.message || String(error),
    code: error.code || 'DECODE_FAILED',
    details: error.details || {},
    stack: error.stack
  };
}

function serializeTexture(texture, levelCopies) {
  return {
    container: texture.container,
    formatId: texture.formatId,
    format: texture.format,
    glInternalFormat: texture.glInternalFormat,
    width: texture.width,
    height: texture.height,
    littleEndian: texture.littleEndian,
    colorSpace: texture.colorSpace,
    flags: texture.flags,
    mipComplete: texture.mipComplete,
    compressedBytes: texture.compressedBytes,
    estimatedCompressedVram: estimateCompressedVram(texture.formatId, texture.width, texture.height, texture.levels.length),
    estimatedFullVram: estimateCompressedVram(texture.formatId, texture.width, texture.height),
    levels: texture.levels.map((level, index) => ({
      level: level.level,
      width: level.width,
      height: level.height,
      byteLength: level.data.byteLength,
      data: levelCopies[index]
    }))
  };
}

self.onmessage = (event) => {
  const { id, buffer, forceFallback = false } = event.data || {};
  const started = performance.now();
  try {
    const texture = parseTexture(buffer);
    const parseMs = performance.now() - started;
    const levelCopies = texture.levels.map((level) => level.data.slice());

    if (forceFallback) {
      const fallbackStarted = performance.now();
      const fallback = createFallbackPixels(texture, 'forced');
      const fallbackMs = performance.now() - fallbackStarted;
      self.postMessage({
        id,
        ok: true,
        texture: serializeTexture(texture, levelCopies),
        fallback,
        timings: { parseMs, fallbackMs, totalWorkerMs: performance.now() - started }
      }, [...levelCopies.map((data) => data.buffer), ...fallback.levels.map((level) => level.data.buffer)]);
      return;
    }

    self.postMessage({
      id,
      ok: true,
      texture: serializeTexture(texture, levelCopies),
      timings: { parseMs, totalWorkerMs: performance.now() - started }
    }, levelCopies.map((data) => data.buffer));
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: serializeError(error),
      timings: { totalWorkerMs: performance.now() - started }
    });
  }
};
