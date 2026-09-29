import assert from 'node:assert/strict';
import { test } from 'node:test';

globalThis.ImageData = class ImageData {
  constructor(data, width, height) {
    this.data = data;
    this.width = width;
    this.height = height;
  }
};

import { createBuiltinTexture } from '../src/fixtures.js';
import { parseKtx, DecodeError } from '../src/ktx.js';
import {
  compressedTextureBytes,
  getFormat,
  uncompressedTextureBytes
} from '../src/formats.js';
import { psnr } from '../src/metrics.js';

test('DXT1 fixture round-trips through KTX parser with mip chain', () => {
  const fixture = createBuiltinTexture('dxt1');
  const parsed = parseKtx(fixture.buffer);

  assert.equal(parsed.container, 'KTX1');
  assert.equal(parsed.format.id, 'dxt1');
  assert.equal(parsed.width, 16);
  assert.equal(parsed.height, 16);
  assert.equal(parsed.mipmapCount, 5);
  assert.equal(parsed.levels[0].data.byteLength, 128);
  assert.equal(parsed.levels.at(-1).data.byteLength, 8);
  assert.equal(parsed.keyValue.DemoPattern, 'dxt1-checker');
});

test('zero-block ASTC and PVRTC fixtures validate expected byte counts', () => {
  const astc = parseKtx(createBuiltinTexture('astc-4x4').buffer);
  assert.equal(astc.levels[0].data.byteLength, 256);
  assert.equal(compressedTextureBytes(astc.format, 16, 16, true), 368);

  const pvrtc = parseKtx(createBuiltinTexture('pvrtc-4bpp').buffer);
  assert.equal(pvrtc.mipmapCount, 1);
  assert.equal(pvrtc.levels[0].data.byteLength, 128);
});

test('compressed and uncompressed memory estimates are quantifiable', () => {
  const dxt1 = getFormat('dxt1');
  const compressed = compressedTextureBytes(dxt1, 16, 16, true);
  const rgba = uncompressedTextureBytes(16, 16, true);

  assert.equal(compressed, 184);
  assert.equal(rgba, 1364);
  assert.ok(compressed < rgba / 7);
});

test('invalid KTX produces a decode error', () => {
  assert.throws(() => parseKtx(new ArrayBuffer(64)), DecodeError);
  assert.throws(() => parseKtx(new Uint8Array([1, 2, 3]).buffer), DecodeError);
});

test('PSNR is infinite for identical images and finite for differences', () => {
  const reference = {
    width: 1,
    height: 1,
    data: new Uint8ClampedArray([10, 20, 30, 255])
  };
  const identical = {
    width: 1,
    height: 1,
    data: new Uint8ClampedArray([10, 20, 30, 255])
  };
  const different = {
    width: 1,
    height: 1,
    data: new Uint8ClampedArray([20, 20, 30, 255])
  };

  assert.equal(psnr(reference, identical), Number.POSITIVE_INFINITY);
  assert.ok(psnr(reference, different) > 25);
});
