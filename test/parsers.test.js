import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FORMATS } from '../src/constants.js';
import {
  estimateCompressedVram,
  estimateUncompressedVram,
  expectedLevelSize,
  expectedMipLevelCount,
  parseTexture
} from '../src/parsers.js';
import { createInvalidKtx, createKtxFixture, createPvrFixture } from '../src/fixtures.js';
import { calculatePsnr } from '../src/fallback.js';

describe('compressed texture size accounting', () => {
  it('computes S3TC BC1 and BC3 block sizes', () => {
    assert.equal(expectedLevelSize('DXT1_RGB', 64, 64), 64 * 64 / 2);
    assert.equal(expectedLevelSize('DXT5', 64, 64), 64 * 64);
    assert.equal(expectedLevelSize('DXT1_RGB', 66, 66), 17 * 17 * 8);
    assert.equal(expectedLevelSize('DXT5', 66, 66), 17 * 17 * 16);
  });

  it('computes ETC and ASTC block sizes', () => {
    assert.equal(expectedLevelSize('ETC1', 64, 64), 2048);
    assert.equal(expectedLevelSize('ETC2_RGBA', 66, 66), 17 * 17 * 16);
    assert.equal(expectedLevelSize('ASTC_4x4', 64, 64), 4096);
    assert.equal(expectedLevelSize('ASTC_6x6', 72, 72), 12 * 12 * 16);
    assert.equal(expectedLevelSize('ASTC_8x8', 64, 64), 8 * 8 * 16);
  });

  it('computes PVRTC minimum-dimension payload sizes', () => {
    assert.equal(expectedLevelSize('PVRTC_4_RGBA', 64, 64), 2048);
    assert.equal(expectedLevelSize('PVRTC_2_RGBA', 64, 64), 1024);
    assert.equal(expectedLevelSize('PVRTC_4_RGBA', 4, 4), 8 * 8 * 4 / 8);
    assert.equal(expectedLevelSize('PVRTC_2_RGBA', 4, 4), 16 * 8 * 2 / 8);
  });

  it('accounts for complete mip chains', () => {
    assert.equal(expectedMipLevelCount(64, 64), 7);
    assert.equal(estimateCompressedVram('DXT1_RGB', 64, 64), 2744);
    assert.equal(estimateUncompressedVram(64, 64, 7), 21844);
    assert.equal(estimateUncompressedVram(64, 64), 16384);
  });
});

describe('KTX1 and PVR v3 fixture round trips', () => {
  const cases = [
    ['DXT1_RGB', 64, 64, createKtxFixture],
    ['DXT5', 64, 64, createKtxFixture],
    ['ETC1', 64, 64, createKtxFixture],
    ['ETC2_RGB', 64, 64, createKtxFixture],
    ['ETC2_RGBA', 64, 64, createKtxFixture],
    ['PVRTC_4_RGBA', 64, 64, createKtxFixture],
    ['PVRTC_2_RGBA', 64, 64, createKtxFixture],
    ['ASTC_4x4', 64, 64, createKtxFixture],
    ['ASTC_6x6', 72, 72, createKtxFixture],
    ['ASTC_8x8', 64, 64, createKtxFixture],
    ['DXT1_RGB', 64, 64, createPvrFixture],
    ['ETC1', 64, 64, createPvrFixture],
    ['PVRTC_4_RGBA', 64, 64, createPvrFixture],
    ['ASTC_4x4', 64, 64, createPvrFixture]
  ];

  for (const [formatId, width, height, create] of cases) {
    it(`parses ${create === createKtxFixture ? 'KTX' : 'PVR'} ${formatId} ${width}x${height}`, () => {
      const fixture = create(FORMATS[formatId], width, height);
      const texture = parseTexture(fixture.buffer);
      assert.equal(texture.formatId, formatId);
      assert.equal(texture.width, width);
      assert.equal(texture.height, height);
      assert.equal(texture.mipComplete, true);
      assert.equal(texture.levels.length, expectedMipLevelCount(width, height));
      for (const level of texture.levels) {
        assert.equal(level.data.byteLength, expectedLevelSize(formatId, level.width, level.height));
      }
    });
  }
});

describe('decode failures', () => {
  it('rejects an unrecognized container with an actionable error code', () => {
    assert.throws(() => parseTexture(createInvalidKtx().buffer), (error) => {
      assert.equal(error.code, 'INVALID_CONTAINER');
      return true;
    });
  });

  it('rejects a truncated KTX after header', () => {
    const fixture = createKtxFixture(FORMATS.ETC1, 64, 64);
    const truncated = fixture.buffer.slice(0, 70);
    assert.throws(() => parseTexture(truncated), (error) => error.code === 'INVALID_CONTAINER');
  });
});

describe('quality metric', () => {
  it('returns infinity for identical pixels and finite value for a mismatch', () => {
    const expected = new Uint8Array([0, 0, 0, 255, 255, 255, 255, 255]);
    assert.equal(calculatePsnr(expected, expected.slice()), Infinity);
    const actual = new Uint8Array([10, 0, 0, 255, 245, 255, 255, 255]);
    assert.ok(calculatePsnr(actual, expected) > 20);
  });
});
