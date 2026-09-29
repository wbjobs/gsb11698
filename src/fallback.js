import { ERROR_CODES, TextureError } from './constants.js';
import { expectedMipLevelCount, isPowerOfTwo } from './parsers.js';

export function fallbackCanUseMipmaps(width, height, isWebGL2 = false) {
  return isWebGL2 || (isPowerOfTwo(width) && isPowerOfTwo(height));
}

function hashBytes(bytes) {
  let hash = 2166136261;
  const sampleStep = Math.max(1, Math.floor(bytes.length / 1024));
  for (let index = 0; index < bytes.length; index += sampleStep) {
    hash ^= bytes[index];
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createFallbackPixels(texture, reason = 'unsupported') {
  if (!texture?.width || !texture?.height) {
    throw new TextureError(ERROR_CODES.FALLBACK_FAILED, '降级纹理缺少有效宽高');
  }
  const width = texture.width;
  const height = texture.height;
  const pixels = new Uint8Array(width * height * 4);
  const firstLevel = texture.levels?.[0]?.data;
  const hash = firstLevel ? hashBytes(firstLevel) : 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const checker = ((x >> 3) + (y >> 3)) % 2;
      const hashWave = ((hash ^ (x * 73) ^ (y * 197)) >>> 0) % 2;
      pixels[offset] = reason === 'decode' || reason === 'forced' ? 255 : 84 + checker * 60;
      pixels[offset + 1] = reason === 'decode' || reason === 'forced' ? 72 : 24 + hashWave * 36;
      pixels[offset + 2] = reason === 'decode' || reason === 'forced' ? 92 : 132 + checker * 45;
      pixels[offset + 3] = 255;
    }
  }

  const mipLevels = fallbackCanUseMipmaps(width, height, true) ? expectedMipLevelCount(width, height) : 1;
  return {
    width,
    height,
    pixels,
    mipLevels,
    diagnostic: true,
    reason,
    levels: buildRgbaMipLevels(pixels, width, height, mipLevels)
  };
}

function buildRgbaMipLevels(pixels, width, height, mipLevels) {
  const levels = [{ level: 0, width, height, data: pixels }];
  let source = pixels;
  let sourceWidth = width;
  let sourceHeight = height;

  for (let level = 1; level < mipLevels; level += 1) {
    const targetWidth = Math.max(1, Math.floor(sourceWidth / 2));
    const targetHeight = Math.max(1, Math.floor(sourceHeight / 2));
    const target = new Uint8Array(targetWidth * targetHeight * 4);
    for (let y = 0; y < targetHeight; y += 1) {
      for (let x = 0; x < targetWidth; x += 1) {
        const sx = Math.min(sourceWidth - 1, x * 2 + 1);
        const sy = Math.min(sourceHeight - 1, y * 2 + 1);
        const sourceOffset = (sy * sourceWidth + sx) * 4;
        const targetOffset = (y * targetWidth + x) * 4;
        target[targetOffset] = source[sourceOffset];
        target[targetOffset + 1] = source[sourceOffset + 1];
        target[targetOffset + 2] = source[sourceOffset + 2];
        target[targetOffset + 3] = source[sourceOffset + 3];
      }
    }
    levels.push({ level, width: targetWidth, height: targetHeight, data: target });
    source = target;
    sourceWidth = targetWidth;
    sourceHeight = targetHeight;
  }
  return levels;
}

export function createReferencePixels(width, height, color = { r: 0, g: 0, b: 0, a: 255 }) {
  const pixels = new Uint8Array(width * height * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels[offset] = color.r;
    pixels[offset + 1] = color.g;
    pixels[offset + 2] = color.b;
    pixels[offset + 3] = color.a;
  }
  return { width, height, pixels };
}

export function calculatePsnr(actual, expected) {
  if (!actual || !expected || actual.length !== expected.length) return null;
  let sumSquaredError = 0;
  let comparableChannels = 0;
  for (let index = 0; index < actual.length; index += 4) {
    for (let channel = 0; channel < 4; channel += 1) {
      const delta = actual[index + channel] - expected[index + channel];
      sumSquaredError += delta * delta;
      comparableChannels += 1;
    }
  }
  const mse = sumSquaredError / comparableChannels;
  if (mse === 0) return Infinity;
  return 10 * Math.log10((255 * 255) / mse);
}

export function formatPsnr(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '不可用';
  if (!Number.isFinite(value)) return '∞ dB';
  return `${value.toFixed(2)} dB`;
}

export function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return '不可用';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

export function formatMs(value) {
  return value === null || value === undefined ? '不可用' : `${value.toFixed(2)} ms`;
}
