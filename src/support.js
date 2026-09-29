import { FORMATS, TextureError, ERROR_CODES } from './constants.js';

function createProbe(canvas, version) {
  const gl = canvas.getContext(version === 2 ? 'webgl2' : 'webgl', {
    failIfMajorPerformanceCaveat: false
  });
  if (!gl) return null;
  const isWebGL2 = typeof gl.createVertexArray === 'function';
  const extensionNames = isWebGL2
    ? new Set([
      'WEBGL_compressed_texture_s3tc',
      'WEBGL_compressed_texture_s3tc_srgb',
      'WEBGL_compressed_texture_pvrtc',
      'WEBGL_compressed_texture_astc',
      'WEBGL_compressed_texture_etc',
      'WEBGL_compressed_texture_etc1'
    ])
    : new Set([
      'WEBGL_compressed_texture_s3tc',
      'WEBKIT_WEBGL_compressed_texture_s3tc',
      'MOZ_WEBGL_compressed_texture_s3tc',
      'WEBGL_compressed_texture_pvrtc',
      'WEBKIT_WEBGL_compressed_texture_pvrtc',
      'WEBGL_compressed_texture_astc',
      'WEBGL_compressed_texture_etc',
      'WEBGL_compressed_texture_etc1',
      'WEBKIT_WEBGL_compressed_texture_etc1'
    ]);

  const extensions = new Map();
  for (const name of extensionNames) {
    const ext = gl.getExtension(name);
    if (ext) extensions.set(name, ext);
  }
  return { gl, isWebGL2, extensions };
}

export function detectWebGLSupport(existingContext = null) {
  if (typeof document === 'undefined') {
    throw new TextureError(ERROR_CODES.WEBGL_UNAVAILABLE, '格式检测需要浏览器 Canvas/WebGL 环境');
  }
  const probe = existingContext
    ? probeFromContext(existingContext)
    : createProbe(document.createElement('canvas'), 2) || createProbe(document.createElement('canvas'), 1);
  if (!probe) {
    throw new TextureError(ERROR_CODES.WEBGL_UNAVAILABLE, '浏览器未提供可用的 WebGL 上下文');
  }
  const { gl, isWebGL2, extensions } = probe;
  const compressed = gl.getParameter(gl.COMPRESSED_TEXTURE_FORMATS) || [];
  const numericFormats = new Set(compressed.map((value) => value >>> 0));
  const debugExtension = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = debugExtension
    ? gl.getParameter(debugExtension.UNMASKED_RENDERER_WEBGL)
    : gl.getParameter(gl.RENDERER);

  const formats = {};
  for (const format of Object.values(FORMATS)) {
    const extensionEnabled = isWebGL2
      ? numericFormats.has(format.internalFormat >>> 0) || hasAnyExtension(extensions, [format.extension])
      : hasAnyExtension(extensions, extensionAliases(format.extension));
    const listed = numericFormats.has(format.internalFormat >>> 0);
    formats[format.id] = {
      ...format,
      supported: Boolean(extensionEnabled && listed),
      extensionEnabled: Boolean(extensionEnabled),
      listed,
      context: isWebGL2 ? 'WebGL2' : 'WebGL1'
    };
  }

  return {
    context: isWebGL2 ? 'WebGL2' : 'WebGL1',
    renderer,
    vendor: gl.getParameter(gl.VENDOR),
    version: gl.getParameter(gl.VERSION),
    shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    supportedFormatIds: Object.values(formats).filter((item) => item.supported).map((item) => item.id),
    formats,
    gl: probe.gl
  };
}

function probeFromContext(gl) {
  const isWebGL2 = typeof gl.createVertexArray === 'function';
  const extensionNames = isWebGL2
    ? ['WEBGL_compressed_texture_s3tc', 'WEBGL_compressed_texture_pvrtc', 'WEBGL_compressed_texture_astc', 'WEBGL_compressed_texture_etc', 'WEBGL_compressed_texture_etc1']
    : ['WEBGL_compressed_texture_s3tc', 'WEBKIT_WEBGL_compressed_texture_s3tc', 'MOZ_WEBGL_compressed_texture_s3tc', 'WEBGL_compressed_texture_pvrtc', 'WEBKIT_WEBGL_compressed_texture_pvrtc', 'WEBGL_compressed_texture_astc', 'WEBGL_compressed_texture_etc', 'WEBGL_compressed_texture_etc1', 'WEBKIT_WEBGL_compressed_texture_etc1'];
  const extensions = new Map();
  for (const name of extensionNames) {
    const ext = gl.getExtension(name);
    if (ext) extensions.set(name, ext);
  }
  return { gl, isWebGL2, extensions };
}

function hasAnyExtension(extensions, names) {
  return names.some((name) => extensions.has(name));
}

function extensionAliases(canonicalName) {
  if (canonicalName === 'WEBGL_compressed_texture_s3tc') {
    return ['WEBGL_compressed_texture_s3tc', 'WEBKIT_WEBGL_compressed_texture_s3tc', 'MOZ_WEBGL_compressed_texture_s3tc'];
  }
  if (canonicalName === 'WEBGL_compressed_texture_pvrtc') {
    return ['WEBGL_compressed_texture_pvrtc', 'WEBKIT_WEBGL_compressed_texture_pvrtc'];
  }
  if (canonicalName === 'WEBGL_compressed_texture_etc1') {
    return ['WEBGL_compressed_texture_etc1', 'WEBKIT_WEBGL_compressed_texture_etc1'];
  }
  return [canonicalName];
}

export function choosePreferredFormat(candidates, support) {
  return candidates
    .map((id) => support.formats[id])
    .find((format) => format && format.supported) || null;
}

export function isFormatSupported(formatId, support) {
  return Boolean(support.formats[formatId]?.supported);
}

export function assertUploadConstraints(texture) {
  const { format, width, height } = texture;
  if (format.powerOfTwo && (!(width > 0 && (width & (width - 1)) === 0) || !(height > 0 && (height & (height - 1)) === 0))) {
    throw new TextureError(ERROR_CODES.UNSUPPORTED_FORMAT, `${format.label} 需要 2 的幂尺寸，当前为 ${width}x${height}`);
  }
  return true;
}
