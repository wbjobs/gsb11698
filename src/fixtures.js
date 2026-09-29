import {
  compressedLevelBytes,
  getFormat,
  mipLevelCount,
  mipDimensions
} from './formats.js';
import { buildKtx } from './ktx.js';

export const FIXTURE_SIZE = 16;

function createDxt1Block(rgb565) {
  const block = new Uint8Array(8);
  new DataView(block.buffer).setUint16(0, rgb565, true);
  return block;
}

function createCheckerDxt1Levels() {
  return Array.from({ length: mipLevelCount(FIXTURE_SIZE, FIXTURE_SIZE) }, (_, level) => {
    const { width, height } = mipDimensions(FIXTURE_SIZE, FIXTURE_SIZE, level);
    const byteLength = compressedLevelBytes(getFormat('dxt1'), width, height);
    const blocksX = Math.max(1, Math.ceil(width / 4));
    const blocksY = Math.max(1, Math.ceil(height / 4));
    const data = new Uint8Array(byteLength);

    for (let blockY = 0; blockY < blocksY; blockY += 1) {
      for (let blockX = 0; blockX < blocksX; blockX += 1) {
        const block = createDxt1Block((blockX + blockY) % 2 === 0 ? 0xffff : 0x0000);
        data.set(block, (blockY * blocksX + blockX) * 8);
      }
    }

    return data;
  });
}

function createZeroLevels(format) {
  if (format.pvrtc) {
    return [new Uint8Array(compressedLevelBytes(format, FIXTURE_SIZE, FIXTURE_SIZE))];
  }

  return Array.from({ length: mipLevelCount(FIXTURE_SIZE, FIXTURE_SIZE) }, (_, level) => {
    const { width, height } = mipDimensions(FIXTURE_SIZE, FIXTURE_SIZE, level);
    return new Uint8Array(compressedLevelBytes(format, width, height));
  });
}

export function createFixtureReference(format) {
  const image = new ImageData(
    new Uint8ClampedArray(FIXTURE_SIZE * FIXTURE_SIZE * 4),
    FIXTURE_SIZE,
    FIXTURE_SIZE
  );

  for (let y = 0; y < FIXTURE_SIZE; y += 1) {
    for (let x = 0; x < FIXTURE_SIZE; x += 1) {
      const offset = (y * FIXTURE_SIZE + x) * 4;

      if (format.id === 'dxt1') {
        const light = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0;
        image.data[offset] = light ? 255 : 0;
        image.data[offset + 1] = light ? 255 : 0;
        image.data[offset + 2] = light ? 255 : 0;
        image.data[offset + 3] = 255;
      } else {
        image.data[offset + 3] = format.alpha ? 0 : 255;
      }
    }
  }

  return image;
}

export function createBuiltinTexture(formatId) {
  const format = getFormat(formatId);
  const levels = format.id === 'dxt1'
    ? createCheckerDxt1Levels()
    : createZeroLevels(format);

  const buffer = buildKtx({
    format,
    width: FIXTURE_SIZE,
    height: FIXTURE_SIZE,
    levels,
    keyValue: {
      KTXwriter: 'compressed-texture-lab/fixture',
      DemoPattern: format.id === 'dxt1' ? 'dxt1-checker' : 'zero-block'
    }
  });

  return {
    kind: 'builtin',
    name: `内置 ${format.label} KTX`,
    formatId: format.id,
    width: FIXTURE_SIZE,
    height: FIXTURE_SIZE,
    buffer,
    reference: createFixtureReference(format),
    generatedAt: new Date().toISOString()
  };
}
