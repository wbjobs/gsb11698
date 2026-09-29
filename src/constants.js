export const GL = {
  COMPRESSED_RGB_S3TC_DXT1_EXT: 0x83f0,
  COMPRESSED_RGBA_S3TC_DXT1_EXT: 0x83f1,
  COMPRESSED_RGBA_S3TC_DXT3_EXT: 0x83f2,
  COMPRESSED_RGBA_S3TC_DXT5_EXT: 0x83f3,
  COMPRESSED_RGB_PVRTC_4BPPV1_IMG: 0x8c00,
  COMPRESSED_RGB_PVRTC_2BPPV1_IMG: 0x8c01,
  COMPRESSED_RGBA_PVRTC_4BPPV1_IMG: 0x8c02,
  COMPRESSED_RGBA_PVRTC_2BPPV1_IMG: 0x8c03,
  ETC1_RGB8_OES: 0x8d64,
  COMPRESSED_RGB8_ETC2: 0x9274,
  COMPRESSED_RGBA8_ETC2_EAC: 0x9278,
  COMPRESSED_RGBA_ASTC_4x4_KHR: 0x93b0,
  COMPRESSED_RGBA_ASTC_5x4_KHR: 0x93b1,
  COMPRESSED_RGBA_ASTC_5x5_KHR: 0x93b2,
  COMPRESSED_RGBA_ASTC_6x5_KHR: 0x93b3,
  COMPRESSED_RGBA_ASTC_6x6_KHR: 0x93b4,
  COMPRESSED_RGBA_ASTC_8x5_KHR: 0x93b5,
  COMPRESSED_RGBA_ASTC_8x6_KHR: 0x93b6,
  COMPRESSED_RGBA_ASTC_8x8_KHR: 0x93b7,
  COMPRESSED_RGBA_ASTC_10x5_KHR: 0x93b8,
  COMPRESSED_RGBA_ASTC_10x6_KHR: 0x93b9,
  COMPRESSED_RGBA_ASTC_10x10_KHR: 0x93ba,
  COMPRESSED_RGBA_ASTC_12x10_KHR: 0x93bb,
  COMPRESSED_RGBA_ASTC_12x12_KHR: 0x93bc,
  TEXTURE_2D: 0x0de1,
  TEXTURE_CUBE_MAP: 0x8513,
  RGBA: 0x1908,
  UNSIGNED_BYTE: 0x1401,
  TEXTURE_MAG_FILTER: 0x2800,
  TEXTURE_MIN_FILTER: 0x2801,
  TEXTURE_WRAP_S: 0x2802,
  TEXTURE_WRAP_T: 0x2803,
  TEXTURE_BASE_LEVEL: 0x813c,
  TEXTURE_MAX_LEVEL: 0x813d,
  TEXTURE_MAX_ANISOTROPY_EXT: 0x84fe,
  LINEAR: 0x2601,
  LINEAR_MIPMAP_LINEAR: 0x2703,
  CLAMP_TO_EDGE: 0x812f,
  REPEAT: 0x2901,
  UNPACK_FLIP_Y_WEBGL: 0x9240,
  NO_ERROR: 0,
  OUT_OF_MEMORY: 0x0505
};

export const CONTAINERS = {
  KTX1: 'ktx1',
  PVR3: 'pvr3'
};

export const ERROR_CODES = {
  WEBGL_UNAVAILABLE: 'WEBGL_UNAVAILABLE',
  UNSUPPORTED_FORMAT: 'UNSUPPORTED_FORMAT',
  INVALID_CONTAINER: 'INVALID_CONTAINER',
  DECODE_FAILED: 'DECODE_FAILED',
  CORS_FAILED: 'CORS_FAILED',
  NETWORK_FAILED: 'NETWORK_FAILED',
  OUT_OF_MEMORY: 'OUT_OF_MEMORY',
  GPU_UPLOAD_FAILED: 'GPU_UPLOAD_FAILED',
  MIPMAP_INCOMPLETE: 'MIPMAP_INCOMPLETE',
  FALLBACK_FAILED: 'FALLBACK_FAILED',
  CACHE_ERROR: 'CACHE_ERROR',
  ABORTED: 'ABORTED'
};

export class TextureError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'TextureError';
    this.code = code;
    this.details = details;
  }
}

export const FORMATS = {
  DXT1_RGB: {
    id: 'DXT1_RGB',
    family: 'S3TC',
    label: 'S3TC DXT1 RGB (BC1)',
    internalFormat: GL.COMPRESSED_RGB_S3TC_DXT1_EXT,
    extension: 'WEBGL_compressed_texture_s3tc',
    blockBytes: 8,
    blockWidth: 4,
    blockHeight: 4,
    alpha: false
  },
  DXT1_RGBA: {
    id: 'DXT1_RGBA',
    family: 'S3TC',
    label: 'S3TC DXT1 RGBA (BC1 alpha)',
    internalFormat: GL.COMPRESSED_RGBA_S3TC_DXT1_EXT,
    extension: 'WEBGL_compressed_texture_s3tc',
    blockBytes: 8,
    blockWidth: 4,
    blockHeight: 4,
    alpha: true
  },
  DXT3: {
    id: 'DXT3',
    family: 'S3TC',
    label: 'S3TC DXT3 (BC2)',
    internalFormat: GL.COMPRESSED_RGBA_S3TC_DXT3_EXT,
    extension: 'WEBGL_compressed_texture_s3tc',
    blockBytes: 16,
    blockWidth: 4,
    blockHeight: 4,
    alpha: true
  },
  DXT5: {
    id: 'DXT5',
    family: 'S3TC',
    label: 'S3TC DXT5 (BC3)',
    internalFormat: GL.COMPRESSED_RGBA_S3TC_DXT5_EXT,
    extension: 'WEBGL_compressed_texture_s3tc',
    blockBytes: 16,
    blockWidth: 4,
    blockHeight: 4,
    alpha: true
  },
  PVRTC_4_RGB: {
    id: 'PVRTC_4_RGB',
    family: 'PVRTC',
    label: 'PVRTC 4bpp RGB v1',
    internalFormat: GL.COMPRESSED_RGB_PVRTC_4BPPV1_IMG,
    extension: 'WEBGL_compressed_texture_pvrtc',
    blockBytes: null,
    bitsPerPixel: 4,
    powerOfTwo: true,
    alpha: false
  },
  PVRTC_2_RGB: {
    id: 'PVRTC_2_RGB',
    family: 'PVRTC',
    label: 'PVRTC 2bpp RGB v1',
    internalFormat: GL.COMPRESSED_RGB_PVRTC_2BPPV1_IMG,
    extension: 'WEBGL_compressed_texture_pvrtc',
    blockBytes: null,
    bitsPerPixel: 2,
    powerOfTwo: true,
    alpha: false
  },
  PVRTC_4_RGBA: {
    id: 'PVRTC_4_RGBA',
    family: 'PVRTC',
    label: 'PVRTC 4bpp RGBA v1',
    internalFormat: GL.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG,
    extension: 'WEBGL_compressed_texture_pvrtc',
    blockBytes: null,
    bitsPerPixel: 4,
    powerOfTwo: true,
    alpha: true
  },
  PVRTC_2_RGBA: {
    id: 'PVRTC_2_RGBA',
    family: 'PVRTC',
    label: 'PVRTC 2bpp RGBA v1',
    internalFormat: GL.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG,
    extension: 'WEBGL_compressed_texture_pvrtc',
    blockBytes: null,
    bitsPerPixel: 2,
    powerOfTwo: true,
    alpha: true
  },
  ETC1: {
    id: 'ETC1',
    family: 'ETC',
    label: 'ETC1 RGB8',
    internalFormat: GL.ETC1_RGB8_OES,
    extension: 'WEBGL_compressed_texture_etc1',
    blockBytes: 8,
    blockWidth: 4,
    blockHeight: 4,
    alpha: false
  },
  ETC2_RGB: {
    id: 'ETC2_RGB',
    family: 'ETC2',
    label: 'ETC2 RGB8',
    internalFormat: GL.COMPRESSED_RGB8_ETC2,
    extension: 'WEBGL_compressed_texture_etc',
    blockBytes: 8,
    blockWidth: 4,
    blockHeight: 4,
    alpha: false
  },
  ETC2_RGBA: {
    id: 'ETC2_RGBA',
    family: 'ETC2',
    label: 'ETC2 RGBA8 EAC',
    internalFormat: GL.COMPRESSED_RGBA8_ETC2_EAC,
    extension: 'WEBGL_compressed_texture_etc',
    blockBytes: 16,
    blockWidth: 4,
    blockHeight: 4,
    alpha: true
  }
};

const ASTC_BLOCKS = [
  ['4x4', 4, 4, GL.COMPRESSED_RGBA_ASTC_4x4_KHR],
  ['5x4', 5, 4, GL.COMPRESSED_RGBA_ASTC_5x4_KHR],
  ['5x5', 5, 5, GL.COMPRESSED_RGBA_ASTC_5x5_KHR],
  ['6x5', 6, 5, GL.COMPRESSED_RGBA_ASTC_6x5_KHR],
  ['6x6', 6, 6, GL.COMPRESSED_RGBA_ASTC_6x6_KHR],
  ['8x5', 8, 5, GL.COMPRESSED_RGBA_ASTC_8x5_KHR],
  ['8x6', 8, 6, GL.COMPRESSED_RGBA_ASTC_8x6_KHR],
  ['8x8', 8, 8, GL.COMPRESSED_RGBA_ASTC_8x8_KHR],
  ['10x5', 10, 5, GL.COMPRESSED_RGBA_ASTC_10x5_KHR],
  ['10x6', 10, 6, GL.COMPRESSED_RGBA_ASTC_10x6_KHR],
  ['10x10', 10, 10, GL.COMPRESSED_RGBA_ASTC_10x10_KHR],
  ['12x10', 12, 10, GL.COMPRESSED_RGBA_ASTC_12x10_KHR],
  ['12x12', 12, 12, GL.COMPRESSED_RGBA_ASTC_12x12_KHR]
];

for (const [name, blockWidth, blockHeight, internalFormat] of ASTC_BLOCKS) {
  FORMATS[`ASTC_${name}`] = {
    id: `ASTC_${name}`,
    family: 'ASTC',
    label: `ASTC ${name}`,
    internalFormat,
    extension: 'WEBGL_compressed_texture_astc',
    blockBytes: 16,
    blockWidth,
    blockHeight,
    alpha: true
  };
}

export const FORMAT_BY_GL = new Map(
  Object.values(FORMATS).map((format) => [format.internalFormat, format])
);

export function getFormatByInternalFormat(internalFormat) {
  return FORMAT_BY_GL.get(internalFormat) || null;
}
