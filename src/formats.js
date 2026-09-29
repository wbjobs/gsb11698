export const GL = {
  COMPRESSED_RGB_S3TC_DXT1_EXT: 0x83f0,
  COMPRESSED_RGBA_S3TC_DXT1_EXT: 0x83f1,
  COMPRESSED_RGBA_S3TC_DXT3_EXT: 0x83f2,
  COMPRESSED_RGBA_S3TC_DXT5_EXT: 0x83f3,
  COMPRESSED_RGB_PVRTC_4BPPV1_IMG: 0x8c00,
  COMPRESSED_RGB_PVRTC_2BPPV1_IMG: 0x8c01,
  COMPRESSED_RGBA_PVRTC_4BPPV1_IMG: 0x8c02,
  COMPRESSED_RGBA_PVRTC_2BPPV1_IMG: 0x8c03,
  COMPRESSED_RGB_ETC1_WEBGL: 0x8d64,
  COMPRESSED_RGB8_ETC2: 0x9274,
  COMPRESSED_SRGB8_ETC2: 0x9275,
  COMPRESSED_RGBA8_ETC2_EAC: 0x9278,
  COMPRESSED_RGBA_ASTC_4x4_KHR: 0x93b0,
  COMPRESSED_RGBA_ASTC_5x4_KHR: 0x93b1,
  COMPRESSED_RGBA_ASTC_5x5_KHR: 0x93b2,
  COMPRESSED_RGBA_ASTC_6x5_KHR: 0x93b3,
  COMPRESSED_RGBA_ASTC_6x6_KHR: 0x93b4,
  COMPRESSED_RGBA_ASTC_8x6_KHR: 0x93b5,
  COMPRESSED_RGBA_ASTC_8x8_KHR: 0x93b6,
  COMPRESSED_RGBA_ASTC_10x6_KHR: 0x93b7,
  COMPRESSED_RGBA_ASTC_10x8_KHR: 0x93b8,
  COMPRESSED_RGBA_ASTC_10x10_KHR: 0x93b9,
  COMPRESSED_RGBA_ASTC_12x10_KHR: 0x93ba,
  COMPRESSED_RGBA_ASTC_12x12_KHR: 0x93bb,
  COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR: 0x93d0
};

export const COMPRESSED_FORMATS = [
  {
    id: 'dxt1',
    label: 'S3TC DXT1 / BC1 (RGB)',
    family: 'S3TC',
    internalFormat: GL.COMPRESSED_RGB_S3TC_DXT1_EXT,
    extension: 'WEBGL_compressed_texture_s3tc',
    blockWidth: 4,
    blockHeight: 4,
    blockBytes: 8,
    bytesPerPixel: 0.5,
    color: true
  },
  {
    id: 'dxt5',
    label: 'S3TC DXT5 / BC3 (RGBA)',
    family: 'S3TC',
    internalFormat: GL.COMPRESSED_RGBA_S3TC_DXT5_EXT,
    extension: 'WEBGL_compressed_texture_s3tc',
    blockWidth: 4,
    blockHeight: 4,
    blockBytes: 16,
    bytesPerPixel: 1,
    color: true,
    alpha: true
  },
  {
    id: 'etc1',
    label: 'ETC1 (RGB)',
    family: 'ETC',
    internalFormat: GL.COMPRESSED_RGB_ETC1_WEBGL,
    extension: 'WEBGL_compressed_texture_etc1',
    blockWidth: 4,
    blockHeight: 4,
    blockBytes: 8,
    bytesPerPixel: 0.5,
    color: true
  },
  {
    id: 'etc2-rgb',
    label: 'ETC2 RGB8',
    family: 'ETC',
    internalFormat: GL.COMPRESSED_RGB8_ETC2,
    extension: 'WEBGL_compressed_texture_etc',
    coreInWebGL2: true,
    blockWidth: 4,
    blockHeight: 4,
    blockBytes: 8,
    bytesPerPixel: 0.5,
    color: true
  },
  {
    id: 'etc2-rgba',
    label: 'ETC2 RGBA8 EAC',
    family: 'ETC',
    internalFormat: GL.COMPRESSED_RGBA8_ETC2_EAC,
    extension: 'WEBGL_compressed_texture_etc',
    coreInWebGL2: true,
    blockWidth: 4,
    blockHeight: 4,
    blockBytes: 16,
    bytesPerPixel: 1,
    color: true,
    alpha: true
  },
  {
    id: 'pvrtc-4bpp',
    label: 'PVRTC 4bpp RGBA',
    family: 'PVRTC',
    internalFormat: GL.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG,
    extension: 'WEBGL_compressed_texture_pvrtc',
    blockWidth: 4,
    blockHeight: 4,
    bytesPerPixel: 0.5,
    color: true,
    alpha: true,
    pvrtc: true
  },
  {
    id: 'pvrtc-2bpp',
    label: 'PVRTC 2bpp RGBA',
    family: 'PVRTC',
    internalFormat: GL.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG,
    extension: 'WEBGL_compressed_texture_pvrtc',
    blockWidth: 8,
    blockHeight: 4,
    bytesPerPixel: 0.25,
    color: true,
    alpha: true,
    pvrtc: true
  },
  {
    id: 'astc-4x4',
    label: 'ASTC 4×4 (RGBA)',
    family: 'ASTC',
    internalFormat: GL.COMPRESSED_RGBA_ASTC_4x4_KHR,
    extension: 'WEBGL_compressed_texture_astc',
    blockWidth: 4,
    blockHeight: 4,
    blockBytes: 16,
    bytesPerPixel: 1,
    color: true,
    alpha: true
  },
  {
    id: 'astc-6x6',
    label: 'ASTC 6×6 (RGBA)',
    family: 'ASTC',
    internalFormat: GL.COMPRESSED_RGBA_ASTC_6x6_KHR,
    extension: 'WEBGL_compressed_texture_astc',
    blockWidth: 6,
    blockHeight: 6,
    blockBytes: 16,
    bytesPerPixel: 16 / 36,
    color: true,
    alpha: true
  },
  {
    id: 'astc-8x8',
    label: 'ASTC 8×8 (RGBA)',
    family: 'ASTC',
    internalFormat: GL.COMPRESSED_RGBA_ASTC_8x8_KHR,
    extension: 'WEBGL_compressed_texture_astc',
    blockWidth: 8,
    blockHeight: 8,
    blockBytes: 16,
    bytesPerPixel: 0.25,
    color: true,
    alpha: true
  }
];

export const FORMAT_BY_INTERNAL_FORMAT = new Map(
  COMPRESSED_FORMATS.map((format) => [format.internalFormat, format])
);

export function getFormat(id) {
  return COMPRESSED_FORMATS.find((format) => format.id === id);
}

export function isPowerOfTwo(value) {
  return value > 0 && (value & (value - 1)) === 0;
}

export function mipLevelCount(width, height) {
  return 1 + Math.floor(Math.log2(Math.max(width, height)));
}

export function mipDimensions(width, height, level) {
  return {
    width: Math.max(1, width >> level),
    height: Math.max(1, height >> level)
  };
}

export function compressedLevelBytes(format, width, height) {
  if (format.pvrtc) {
    const linearBytes = Math.ceil(width / format.blockWidth) *
      Math.ceil(height / format.blockHeight) * 8;
    return Math.max(32, linearBytes);
  }

  const blocksX = Math.ceil(width / format.blockWidth);
  const blocksY = Math.ceil(height / format.blockHeight);
  return blocksX * blocksY * format.blockBytes;
}

export function compressedTextureBytes(format, width, height, mipmaps) {
  const levels = mipmaps ? mipLevelCount(width, height) : 1;
  let total = 0;

  for (let level = 0; level < levels; level += 1) {
    const dimensions = mipDimensions(width, height, level);
    total += compressedLevelBytes(format, dimensions.width, dimensions.height);
  }

  return total;
}

export function uncompressedTextureBytes(width, height, mipmaps, alpha = true) {
  const levels = mipmaps ? mipLevelCount(width, height) : 1;
  let total = 0;

  for (let level = 0; level < levels; level += 1) {
    const dimensions = mipDimensions(width, height, level);
    total += dimensions.width * dimensions.height * (alpha ? 4 : 3);
  }

  return total;
}
