import {
  FORMAT_BY_INTERNAL_FORMAT,
  compressedLevelBytes,
  isPowerOfTwo,
  mipDimensions
} from './formats.js';

const KTX_IDENTIFIER = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x31, 0x31, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];

export class DecodeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DecodeError';
  }
}

function identifierMatches(bytes) {
  return KTX_IDENTIFIER.every((value, index) => bytes[index] === value);
}

function assert(condition, message) {
  if (!condition) {
    throw new DecodeError(message);
  }
}

function readNullTerminatedAscii(view, start, end) {
  let value = '';

  for (let offset = start; offset < end; offset += 1) {
    const code = view.getUint8(offset);
    if (code === 0) {
      break;
    }
    value += String.fromCharCode(code);
  }

  return value;
}

export function parseKtx(buffer) {
  assert(buffer.byteLength >= 64, '文件小于 KTX 64 字节文件头');

  const bytes = new Uint8Array(buffer);
  assert(identifierMatches(bytes), '不是有效的 KTX v1 文件');

  const view = new DataView(buffer);
  const endianness = view.getUint32(12, true);
  const littleEndian = endianness === 0x04030201;

  assert(
    littleEndian || endianness === 0x01020304,
    `无法识别的 KTX endianness：0x${endianness.toString(16)}`
  );

  const glType = view.getUint32(16, littleEndian);
  const glTypeSize = view.getUint32(20, littleEndian);
  const glFormat = view.getUint32(24, littleEndian);
  const glInternalFormat = view.getUint32(28, littleEndian);
  const glBaseInternalFormat = view.getUint32(32, littleEndian);
  const pixelWidth = view.getUint32(36, littleEndian);
  const pixelHeight = view.getUint32(40, littleEndian);
  const pixelDepth = view.getUint32(44, littleEndian);
  const arrayElementCount = view.getUint32(48, littleEndian);
  const numberOfFaces = view.getUint32(52, littleEndian);
  const numberOfMipmapLevels = view.getUint32(56, littleEndian);
  const bytesOfKeyValueData = view.getUint32(60, littleEndian);

  assert(glType === 0 && glTypeSize === 1, '演示程序仅加载压缩 KTX（glType 必须为 0）');
  assert(glFormat === 0, '压缩 KTX 的 glFormat 必须为 0');
  assert(pixelWidth > 0, 'KTX 宽度无效');
  assert(pixelHeight > 0, 'KTX 高度无效');
  assert(pixelDepth === 0, '暂不支持 3D 压缩纹理');
  assert(arrayElementCount === 0, '暂不支持纹理数组');
  assert(numberOfFaces === 1, '暂不支持立方体纹理');
  assert(numberOfMipmapLevels < 32, 'mipmap 层数无效');
  const effectiveMipmapLevels = numberOfMipmapLevels === 0
    ? mipLevelCount(pixelWidth, pixelHeight)
    : numberOfMipmapLevels;

  const format = FORMAT_BY_INTERNAL_FORMAT.get(glInternalFormat);
  assert(format, `未知或未纳入检测范围的内部格式：0x${glInternalFormat.toString(16)}`);

  if (format.pvrtc) {
    assert(pixelWidth === pixelHeight, 'PVRTC v1 要求方形纹理');
    assert(isPowerOfTwo(pixelWidth), 'PVRTC v1 要求 2 的幂尺寸');
    assert(effectiveMipmapLevels === 1, '该 PVRTC 演示样例不使用 KTX mipmap 链');
  }

  let offset = 64 + bytesOfKeyValueData;
  assert(offset <= buffer.byteLength, 'KTX key/value 数据长度越界');

  const keyValueDataStart = 64;
  const keyValueDataEnd = offset;
  const keyValue = {};
  let keyValueOffset = keyValueDataStart;

  while (keyValueOffset + 4 <= keyValueDataEnd) {
    const pairLength = view.getUint32(keyValueOffset, littleEndian);
    const pairStart = keyValueOffset + 4;
    const pairEnd = pairStart + pairLength;

    assert(pairEnd <= keyValueDataEnd, 'KTX key/value 条目越界');

    let keyEnd = pairStart;
    while (keyEnd < pairEnd && view.getUint8(keyEnd) !== 0) {
      keyEnd += 1;
    }

    const key = readNullTerminatedAscii(view, pairStart, keyEnd);
    const valueStart = keyEnd + 1;
    keyValue[key] = readNullTerminatedAscii(view, valueStart, pairEnd);
    keyValueOffset = Math.ceil(pairEnd / 4) * 4;
  }

  const levels = [];

  for (let index = 0; index < effectiveMipmapLevels; index += 1) {
    assert(offset + 4 <= buffer.byteLength, 'mipmap imageSize 越界');

    const imageSize = view.getUint32(offset, littleEndian);
    const dataStart = offset + 4;
    const dataEnd = dataStart + imageSize;

    assert(dataEnd <= buffer.byteLength, `mipmap ${index} 数据越界`);

    const dimensions = mipDimensions(pixelWidth, pixelHeight, index);
    const expectedBytes = compressedLevelBytes(
      format,
      dimensions.width,
      dimensions.height
    );

    assert(
      imageSize >= expectedBytes,
      `mipmap ${index} 数据不足：需要 ${expectedBytes} 字节，实际 ${imageSize} 字节`
    );

    levels.push({
      level: index,
      width: dimensions.width,
      height: dimensions.height,
      imageSize,
      data: bytes.slice(dataStart, dataEnd)
    });

    offset = Math.ceil(dataEnd / 4) * 4;
  }

  return {
    container: 'KTX1',
    format,
    width: pixelWidth,
    height: pixelHeight,
    mipmapCount: effectiveMipmapLevels,
    baseInternalFormat: glBaseInternalFormat,
    keyValue,
    levels
  };
}

function stringBytes(value) {
  return value.split('').map((character) => character.charCodeAt(0));
}

export function buildKtx({ format, width, height, levels, keyValue = {} }) {
  const header = new ArrayBuffer(64);
  const headerBytes = new Uint8Array(header);
  headerBytes.set(KTX_IDENTIFIER);

  const headerView = new DataView(header);
  headerView.setUint32(12, 0x04030201, true);
  headerView.setUint32(20, 1, true);
  headerView.setUint32(28, format.internalFormat, true);
  headerView.setUint32(32, format.alpha ? 6408 : 6407, true);
  headerView.setUint32(36, width, true);
  headerView.setUint32(40, height, true);
  headerView.setUint32(44, 0, true);
  headerView.setUint32(48, 0, true);
  headerView.setUint32(52, 1, true);
  headerView.setUint32(56, levels.length, true);

  const entries = [];
  for (const [key, value] of Object.entries(keyValue)) {
    const keyBytes = [...stringBytes(key), 0];
    const valueBytes = [...stringBytes(value), 0];
    const pair = [...keyBytes, ...valueBytes];
    entries.push(new Uint8Array(pair));
  }

  let metadataLength = 0;
  for (const entry of entries) {
    metadataLength += 4 + Math.ceil(entry.byteLength / 4) * 4;
  }
  headerView.setUint32(60, metadataLength, true);

  const parts = [new Uint8Array(header)];

  for (const entry of entries) {
    const length = new ArrayBuffer(4);
    new DataView(length).setUint32(0, entry.byteLength, true);
    parts.push(new Uint8Array(length));
    parts.push(entry);

    const padding = (4 - (entry.byteLength % 4)) % 4;
    if (padding) {
      parts.push(new Uint8Array(padding));
    }
  }

  for (const level of levels) {
    const size = new ArrayBuffer(4);
    new DataView(size).setUint32(0, level.byteLength, true);
    parts.push(new Uint8Array(size));
    parts.push(level);

    const padding = (4 - (level.byteLength % 4)) % 4;
    if (padding) {
      parts.push(new Uint8Array(padding));
    }
  }

  const totalBytes = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const output = new Uint8Array(totalBytes);
  let outputOffset = 0;

  for (const part of parts) {
    output.set(part, outputOffset);
    outputOffset += part.byteLength;
  }

  return output.buffer;
}
