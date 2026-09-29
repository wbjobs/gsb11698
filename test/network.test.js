import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isLikelyCorsError } from '../src/network.js';
import { ERROR_CODES } from '../src/constants.js';
import { createFallbackPixels } from '../src/fallback.js';
import { parseTexture } from '../src/parsers.js';
import { createKtxFixture } from '../src/fixtures.js';
import { FORMATS } from '../src/constants.js';

describe('browser failure classification', () => {
  it('classifies fetch TypeError as CORS/network interception', () => {
    assert.equal(isLikelyCorsError(new TypeError('Failed to fetch')), true);
    assert.equal(isLikelyCorsError(new Error('HTTP 500')), false);
  });

  it('uses stable error codes for UI remediation', () => {
    for (const code of [
      ERROR_CODES.UNSUPPORTED_FORMAT,
      ERROR_CODES.INVALID_CONTAINER,
      ERROR_CODES.CORS_FAILED,
      ERROR_CODES.OUT_OF_MEMORY,
      ERROR_CODES.GPU_UPLOAD_FAILED,
      ERROR_CODES.FALLBACK_FAILED
    ]) {
      assert.match(code, /^[A-Z_]+$/);
    }
  });
});

describe('RGBA fallback generation', () => {
  it('creates a complete POT mip chain after valid compressed parsing', () => {
    const texture = parseTexture(createKtxFixture(FORMATS.ETC1, 64, 64).buffer);
    const fallback = createFallbackPixels(texture, 'unsupported');
    assert.equal(fallback.width, 64);
    assert.equal(fallback.height, 64);
    assert.equal(fallback.mipLevels, 7);
    assert.equal(fallback.levels.length, 7);
    assert.deepEqual(
      fallback.levels.map((level) => [level.width, level.height, level.data.byteLength]),
      [[64, 64, 16384], [32, 32, 4096], [16, 16, 1024], [8, 8, 256], [4, 4, 64], [2, 2, 16], [1, 1, 4]]
    );
  });

  it('creates ceil-log2 NPOT fallback levels for WebGL2', () => {
    const texture = parseTexture(createKtxFixture(FORMATS.ASTC_6x6, 72, 72).buffer);
    const fallback = createFallbackPixels(texture, 'out-of-memory');
    assert.equal(fallback.levels.length, 8);
    assert.equal(fallback.levels[0].width, 72);
    assert.equal(fallback.levels.at(-1).width, 1);
  });

  it('can build RGBA fallback without attempting GPU upload', () => {
    const texture = parseTexture(createKtxFixture(FORMATS.ASTC_4x4, 64, 64).buffer);
    const fallback = createFallbackPixels(texture, 'unsupported');
    assert.equal(fallback.diagnostic, true);
    assert.equal(fallback.pixels.byteLength, 64 * 64 * 4);
    assert.ok(fallback.levels[0].data.every((value, index) => index % 4 === 3 ? value === 255 : value >= 0));
  });
});
