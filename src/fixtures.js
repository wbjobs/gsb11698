import { GL } from './constants.js';
import { expectedLevelSize, expectedMipLevelCount } from './parsers.js';

const KTX_IDENTIFIER = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x31, 0x31, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];
const PVR_MAGIC = 0x03525650;
const PVR_HEADER_SIZE = 52;

const PVR_CODES = {
  DXT1_RGB: 7,
  DXT3: 9,
  DXT5: 11,
  PVRTC_2_RGB: 0,
  PVRTC_2_RGBA: 1,
  PVRTC_4_RGB: 2,
  PVRTC_4_RGBA: 3,
  ETC1: 6,
  ETC2_RGB: 22,
  ETC2_RGBA: 23,
  ASTC_4x4: 27,
  ASTC_6x6: 31,
  ASTC_8x8: 34
};

function writeAscii(buffer, offset, bytes) {
  const view = new Uint8Array(buffer);
  bytes.forEach((value, index) => { view[offset + index] = value; });
}

function createZeroFilledLevels(formatId, width, height) {
  const count = expectedMipLevelCount(width, height);
  const levels = [];
  for (let level = 0; level < count; level += 1) {
    const levelWidth = Math.max(1, Math.floor(width / 2 ** level));
    const levelHeight = Math.max(1, Math.floor(height / 2 ** level));
    levels.push({
      level,
      width: levelWidth,
      height: levelHeight,
      data: new Uint8Array(expectedLevelSize(formatId, levelWidth, levelHeight))
    });
  }
  return levels;
}

export function createKtxFixture(format, width, height) {
  const levels = createZeroFilledLevels(format.id, width, height);
  const dataBytes = levels.reduce((total, level) => total + 4 + level.data.byteLength, 0);
  const buffer = new ArrayBuffer(64 + dataBytes);
  const view = new DataView(buffer);
  writeAscii(buffer, 0, KTX_IDENTIFIER);
  view.setUint32(12, 0x04030201, true);
  view.setUint32(16, 1, true);
  view.setUint32(20, 1, true);
  view.setUint32(24, 0, true);
  view.setUint32(28, format.internalFormat, true);
  view.setUint32(32, format.alpha ? GL.RGBA || 0x1908 : 0x1907, true);
  view.setUint32(36, width, true);
  view.setUint32(40, height, true);
  view.setUint32(44, 0, true);
  view.setUint32(48, 0, true);
  view.setUint32(52, 1, true);
  view.setUint32(56, levels.length, true);
  view.setUint32(60, 0, true);

  let offset = 64;
  for (const level of levels) {
    view.setUint32(offset, level.data.byteLength, true);
    offset += 4;
    new Uint8Array(buffer, offset, level.data.byteLength).set(level.data);
    offset += level.data.byteLength;
  }
  return { buffer, name: `${format.id}-${width}x${height}.ktx`, formatId: format.id, width, height, container: 'ktx1' };
}

export function createPvrFixture(format, width, height) {
  const pixelFormat = PVR_CODES[format.id];
  if (pixelFormat === undefined) throw new Error(`${format.id} 没有 PVR 测试枚举`);
  const levels = createZeroFilledLevels(format.id, width, height);
  const dataBytes = levels.reduce((total, level) => total + level.data.byteLength + ((4 - (level.data.byteLength % 4)) % 4), 0);
  const buffer = new ArrayBuffer(PVR_HEADER_SIZE + dataBytes);
  const view = new DataView(buffer);
  view.setUint32(0, PVR_MAGIC, true);
  view.setUint32(4, 0, true);
  view.setUint32(8, 0, true);
  view.setUint32(12, 0, true);
  view.setUint32(16, pixelFormat, true);
  view.setUint32(20, 0, true);
  view.setUint32(24, height, true);
  view.setUint32(28, width, true);
  view.setUint32(32, 1, true);
  view.setUint32(36, 1, true);
  view.setUint32(40, 1, true);
  view.setUint32(44, levels.length, true);
  view.setUint32(48, 0, true);

  let offset = PVR_HEADER_SIZE;
  for (const level of levels) {
    new Uint8Array(buffer, offset, level.data.byteLength).set(level.data);
    offset += level.data.byteLength + ((4 - (level.data.byteLength % 4)) % 4);
  }
  return { buffer, name: `${format.id}-${width}x${height}.pvr`, formatId: format.id, width, height, container: 'pvr3' };
}

export function createInvalidKtx() {
  const buffer = new Uint8Array(96).fill(0xcd).buffer;
  return { buffer, name: 'invalid.ktx', formatId: null, width: 0, height: 0, container: null };
}

export const BENCHMARK_CASES = [
  { formatId: 'DXT1_RGB', width: 64, height: 64 },
  { formatId: 'DXT5', width: 64, height: 64 },
  { formatId: 'ETC1', width: 64, height: 64 },
  { formatId: 'ETC2_RGB', width: 64, height: 64 },
  { formatId: 'ETC2_RGBA', width: 64, height: 64 },
  { formatId: 'PVRTC_4_RGBA', width: 64, height: 64 },
  { formatId: 'PVRTC_2_RGBA', width: 64, height: 64 },
  { formatId: 'ASTC_4x4', width: 64, height: 64 },
  { formatId: 'ASTC_6x6', width: 72, height: 72 },
  { formatId: 'ASTC_8x8', width: 64, height: 64 }
];
