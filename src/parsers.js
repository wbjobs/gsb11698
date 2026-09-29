import { CONTAINERS, ERROR_CODES, FORMATS, TextureError, getFormatByInternalFormat } from './constants.js';

const KTX_IDENTIFIER = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x31, 0x31, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];
const PVR_MAGIC = 0x03525650;
const PVR_HEADER_SIZE = 52;

const PVR_FORMATS = new Map([
  [0, 'PVRTC_2_RGB'],
  [1, 'PVRTC_2_RGBA'],
  [2, 'PVRTC_4_RGB'],
  [3, 'PVRTC_4_RGBA'],
  [6, 'ETC1'],
  [22, 'ETC2_RGB'],
  [23, 'ETC2_RGBA'],
  [7, 'DXT1_RGB'],
  [9, 'DXT3'],
  [11, 'DXT5']
]);

const PVR_ASTC_FORMATS = new Map([
  [27, [4, 4]], [28, [5, 4]], [29, [5, 5]], [30, [6, 5]], [31, [6, 6]],
  [32, [8, 5]], [33, [8, 6]], [34, [8, 8]], [35, [10, 5]], [36, [10, 6]],
  [37, [10, 10]], [38, [12, 10]], [39, [12, 12]]
]);

function assert(condition, code, message, details) {
  if (!condition) throw new TextureError(code, message, details);
}

function readUint32(view, offset, littleEndian = true) {
  assert(offset + 4 <= view.byteLength, ERROR_CODES.INVALID_CONTAINER, '文件在读取 uint32 前结束', { offset });
  return view.getUint32(offset, littleEndian);
}

export function detectContainer(buffer) {
  assert(buffer && buffer.byteLength >= 12, ERROR_CODES.INVALID_CONTAINER, '文件太小，无法识别纹理容器');
  const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 12));
  if (KTX_IDENTIFIER.every((value, index) => bytes[index] === value)) return CONTAINERS.KTX1;
  if (buffer.byteLength >= 4) {
    const view = new DataView(buffer);
    if (view.getUint32(0, true) === PVR_MAGIC || view.getUint32(0, false) === PVR_MAGIC) {
      return CONTAINERS.PVR3;
    }
  }
  throw new TextureError(ERROR_CODES.INVALID_CONTAINER, '仅支持 KTX1 或 PVR v3 容器');
}

export function parseTexture(buffer) {
  const container = detectContainer(buffer);
  return container === CONTAINERS.KTX1 ? parseKtx1(buffer) : parsePvr3(buffer);
}

export function parseKtx1(buffer) {
  assert(buffer.byteLength >= 64, ERROR_CODES.INVALID_CONTAINER, 'KTX1 文件头至少需要 64 字节');
  const view = new DataView(buffer);
  const endianness = readUint32(view, 12);
  const littleEndian = endianness === 0x04030201;
  assert(littleEndian || endianness === 0x01020304, ERROR_CODES.INVALID_CONTAINER, 'KTX1 字节序无效', { endianness });

  const glType = readUint32(view, 16, littleEndian);
  const glInternalFormat = readUint32(view, 28, littleEndian);
  const width = readUint32(view, 36, littleEndian);
  const height = readUint32(view, 40, littleEndian);
  const depth = readUint32(view, 44, littleEndian);
  const arrayElements = readUint32(view, 48, littleEndian);
  const faces = readUint32(view, 52, littleEndian);
  const mipLevels = Math.max(1, readUint32(view, 56, littleEndian));
  const keyValueBytes = readUint32(view, 60, littleEndian);

  const format = getFormatByInternalFormat(glInternalFormat);
  assert(glType === 1, ERROR_CODES.INVALID_CONTAINER, '当前示例仅加载压缩 KTX1；未压缩 KTX 应使用普通图片路径');
  assert(format, ERROR_CODES.UNSUPPORTED_FORMAT, `未登记的 KTX 压缩内部格式 0x${glInternalFormat.toString(16)}`, { glInternalFormat });
  assert(depth === 0 && arrayElements === 0 && faces === 1, ERROR_CODES.INVALID_CONTAINER, '仅支持普通 2D 单层面纹理；3D、数组和立方体贴图未启用', { depth, arrayElements, faces });
  assert(width > 0 && height > 0, ERROR_CODES.INVALID_CONTAINER, 'KTX 纹理宽高必须大于 0', { width, height });

  let offset = 64 + keyValueBytes;
  const levels = [];
  for (let level = 0; level < mipLevels; level += 1) {
    const imageSize = readUint32(view, offset, littleEndian);
    offset += 4;
    assert(imageSize > 0, ERROR_CODES.INVALID_CONTAINER, `KTX 第 ${level} 层数据为空`);
    assert(offset + imageSize <= buffer.byteLength, ERROR_CODES.INVALID_CONTAINER, `KTX 第 ${level} 层数据越界`, { level, imageSize });
    levels.push({
      level,
      width: Math.max(1, width >> level),
      height: Math.max(1, height >> level),
      data: new Uint8Array(buffer, offset, imageSize)
    });
    offset += imageSize + (3 - ((imageSize + 3) % 4));
  }

  return normalizeTexture({
    container: CONTAINERS.KTX1,
    formatId: format.id,
    glInternalFormat,
    width,
    height,
    levels,
    littleEndian
  });
}

function resolvePvrFormat(pixelFormatLow, pixelFormatHigh) {
  assert(pixelFormatHigh === 0, ERROR_CODES.UNSUPPORTED_FORMAT, '不支持 PVR 预混/自定义像素格式', { pixelFormatHigh });
  if (PVR_FORMATS.has(pixelFormatLow)) return PVR_FORMATS.get(pixelFormatLow);
  if (PVR_ASTC_FORMATS.has(pixelFormatLow)) {
    const block = PVR_ASTC_FORMATS.get(pixelFormatLow);
    return `ASTC_${block[0]}x${block[1]}`;
  }
  throw new TextureError(ERROR_CODES.UNSUPPORTED_FORMAT, `未登记的 PVR pixelFormat 0x${pixelFormatLow.toString(16)}`, { pixelFormatLow });
}

export function parsePvr3(buffer) {
  assert(buffer.byteLength >= PVR_HEADER_SIZE, ERROR_CODES.INVALID_CONTAINER, 'PVR v3 文件头至少需要 52 字节');
  const view = new DataView(buffer);
  const littleEndian = view.getUint32(0, true) === PVR_MAGIC;
  assert(littleEndian || view.getUint32(0, false) === PVR_MAGIC, ERROR_CODES.INVALID_CONTAINER, 'PVR magic 无效');

  const flags = readUint32(view, 8, littleEndian);
  const pixelFormatHigh = readUint32(view, 12, littleEndian);
  const pixelFormatLow = readUint32(view, 16, littleEndian);
  const colorSpace = readUint32(view, 20, littleEndian);
  const height = readUint32(view, 24, littleEndian);
  const width = readUint32(view, 28, littleEndian);
  const depth = readUint32(view, 32, littleEndian);
  const faces = readUint32(view, 40, littleEndian);
  const mipCount = readUint32(view, 44, littleEndian);
  const metadataSize = readUint32(view, 48, littleEndian);
  resolvePvrFormat(pixelFormatLow, pixelFormatHigh);

  assert(depth === 1 && faces === 1, ERROR_CODES.INVALID_CONTAINER, '仅支持普通 2D 单面 PVR 纹理', { depth, faces });
  assert(width > 0 && height > 0, ERROR_CODES.INVALID_CONTAINER, 'PVR 纹理宽高必须大于 0', { width, height });

  const levelCount = Math.max(1, mipCount);
  let offset = PVR_HEADER_SIZE + metadataSize;
  const levels = [];
  for (let index = 0; index < levelCount; index += 1) {
    const levelWidth = Math.max(1, width >> index);
    const levelHeight = Math.max(1, height >> index);
    const imageSize = expectedLevelSize(resolvePvrFormat(pixelFormatLow, pixelFormatHigh), levelWidth, levelHeight);
    assert(offset + imageSize <= buffer.byteLength, ERROR_CODES.INVALID_CONTAINER, `PVR 第 ${index} 层数据越界`, { index, imageSize });
    levels.push({
      level: index,
      width: levelWidth,
      height: levelHeight,
      data: new Uint8Array(buffer, offset, imageSize)
    });
    offset += imageSize + ((4 - (imageSize % 4)) % 4);
  }

  return normalizeTexture({
    container: CONTAINERS.PVR3,
    formatId: resolvePvrFormat(pixelFormatLow, pixelFormatHigh),
    glInternalFormat: null,
    width,
    height,
    levels,
    littleEndian,
    colorSpace,
    flags
  });
}

function normalizeTexture(texture) {
  const format = getFormatById(texture.formatId);
  const expectedLevels = expectedMipLevelCount(texture.width, texture.height);
  for (const level of texture.levels) {
    const expected = expectedLevelSize(texture.formatId, level.width, level.height);
    assert(level.data.byteLength === expected, ERROR_CODES.INVALID_CONTAINER, `第 ${level.level} 层大小应为 ${expected}，实际为 ${level.data.byteLength}`, {
      level: level.level,
      expected,
      actual: level.data.byteLength
    });
  }
  return {
    ...texture,
    format,
    mipComplete: texture.levels.length === expectedLevels,
    compressedBytes: texture.levels.reduce((total, level) => total + level.data.byteLength, 0)
  };
}

export function getFormatById(formatId) {
  return FORMATS[formatId] || null;
}

export function isPowerOfTwo(value) {
  return value > 0 && (value & (value - 1)) === 0;
}

export function expectedMipLevelCount(width, height) {
  return Math.ceil(Math.log2(Math.max(width, height))) + 1;
}

export function expectedLevelSize(formatId, width, height) {
  const format = getFormatById(formatId);
  if (!format) throw new TextureError(ERROR_CODES.UNSUPPORTED_FORMAT, `无法计算未知格式 ${formatId} 的大小`);
  if (format.family === 'PVRTC') {
    const minWidth = format.bitsPerPixel === 2 ? 16 : 8;
    const safeWidth = Math.max(minWidth, width);
    const safeHeight = Math.max(8, height);
    return Math.max(1, Math.floor((safeWidth * safeHeight * format.bitsPerPixel) / 8));
  }
  const blocksX = Math.ceil(width / format.blockWidth);
  const blocksY = Math.ceil(height / format.blockHeight);
  return blocksX * blocksY * format.blockBytes;
}

export function estimateCompressedVram(formatId, width, height, levels = expectedMipLevelCount(width, height)) {
  let total = 0;
  for (let level = 0; level < levels; level += 1) {
    const levelWidth = Math.max(1, Math.floor(width / 2 ** level));
    const levelHeight = Math.max(1, Math.floor(height / 2 ** level));
    total += expectedLevelSize(formatId, levelWidth, levelHeight);
  }
  return total;
}

export function estimateUncompressedVram(width, height, mipLevels = 1) {
  let total = 0;
  for (let level = 0; level < mipLevels; level += 1) {
    total += Math.max(1, width >> level) * Math.max(1, height >> level) * 4;
  }
  return total;
}
