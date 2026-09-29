import {
  COMPRESSED_FORMATS,
  compressedLevelBytes,
  isPowerOfTwo
} from './formats.js';

const VERTEX_SHADER = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = vec2((a_position.x + 1.0) * 0.5, (1.0 - a_position.y) * 0.5);
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_texture;
void main() {
  gl_FragColor = texture2D(u_texture, v_uv);
}
`;

const EXTENSION_ALIASES = {
  WEBGL_compressed_texture_s3tc: [
    'WEBGL_compressed_texture_s3tc',
    'WEBKIT_WEBGL_compressed_texture_s3tc',
    'MOZ_WEBGL_compressed_texture_s3tc'
  ],
  WEBGL_compressed_texture_pvrtc: [
    'WEBGL_compressed_texture_pvrtc',
    'WEBKIT_WEBGL_compressed_texture_pvrtc'
  ],
  WEBGL_compressed_texture_etc1: [
    'WEBGL_compressed_texture_etc1',
    'WEBKIT_WEBGL_compressed_texture_etc1'
  ],
  WEBGL_compressed_texture_etc: [
    'WEBGL_compressed_texture_etc'
  ],
  WEBGL_compressed_texture_astc: [
    'WEBGL_compressed_texture_astc'
  ]
};

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`着色器编译失败：${ message }`);
  }

  return shader;
}

function createProgram(gl, vertexSource, fragmentSource) {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`着色器链接失败：${ message }`);
  }

  return program;
}

export class TextureRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: false
    }) || canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: false
    }) || canvas.getContext('experimental-webgl', {
      alpha: false,
      antialias: false
    });

    if (!gl) {
      throw new Error('浏览器不支持 WebGL，将仅使用 Canvas 2D 降级');
    }

    this.gl = gl;
    this.isWebGL2 = gl.getParameter(gl.VERSION).includes('WebGL 2.0');
    this.extensions = new Map();
    this.availableCompressedFormats = new Set();
    this.contextLost = false;

    gl.canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.contextLost = true;
      this.contextLossReason = 'WebGL 上下文丢失';
    });

    gl.canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      this.contextLossReason = '';
      this.availableCompressedFormats.clear();
      this.extensions.clear();
    });

    this.program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
    gl.useProgram(this.program);

    const positionLocation = gl.getAttribLocation(this.program, 'a_position');
    this.textureLocation = gl.getUniformLocation(this.program, 'u_texture');
    this.positionBuffer = gl.createBuffer();

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    this.readFramebuffer = gl.createFramebuffer();
    this.readTexture = gl.createTexture();
    this.detected = this.detectFormats();
  }

  getExtension(name) {
    if (this.extensions.has(name)) {
      return this.extensions.get(name);
    }

    const aliases = EXTENSION_ALIASES[name] || [name];
    let extension = null;

    for (const alias of aliases) {
      extension = this.gl.getExtension(alias);
      if (extension) {
        break;
      }
    }

    this.extensions.set(name, extension);
    return extension;
  }

  getGpuInfo() {
    const debugInfo = this.getExtension('WEBGL_debug_renderer_info');
    return {
      renderer: debugInfo
        ? this.gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
        : this.gl.getParameter(this.gl.RENDERER),
      vendor: debugInfo
        ? this.gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
        : this.gl.getParameter(this.gl.VENDOR),
      version: this.gl.getParameter(this.gl.VERSION),
      shadingLanguageVersion: this.gl.getParameter(this.gl.SHADING_LANGUAGE_VERSION),
      maxTextureSize: this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE)
    };
  }

  canProbeTexture(format, width, height) {
    if (this.contextLost) {
      return false;
    }

    const needsExtension = !(this.isWebGL2 && format.coreInWebGL2);
    if (needsExtension && format.extension && !this.getExtension(format.extension)) {
      return false;
    }

    const gl = this.gl;
    const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    return width <= maxTextureSize && height <= maxTextureSize;
  }

  probeFormat(format) {
    const needsExtension = !(this.isWebGL2 && format.coreInWebGL2);
    if (needsExtension && format.extension && !this.getExtension(format.extension)) {
      return false;
    }

    if (!this.canProbeTexture(format, 4, 4)) {
      return false;
    }

    const gl = this.gl;
    const texture = gl.createTexture();
    let supported = false;

    try {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      while (gl.getError() !== gl.NO_ERROR) {
        // 清掉历史错误，确保探针结果只由本次 compressedTexImage2D 决定。
      }

      const probeWidth = format.pvrtc ? 16 : 4;
      const probeHeight = format.pvrtc ? 16 : 4;
      const bytes = compressedLevelBytes(format, probeWidth, probeHeight);

      gl.compressedTexImage2D(
        gl.TEXTURE_2D,
        0,
        format.internalFormat,
        probeWidth,
        probeHeight,
        0,
        new Uint8Array(bytes)
      );

      supported = gl.getError() === gl.NO_ERROR;
    } catch {
      supported = false;
    } finally {
      gl.deleteTexture(texture);
    }

    return supported;
  }

  detectFormats() {
    return this.constructor.supportedFormats().map((format) => {
      const needsExtension = !(this.isWebGL2 && format.coreInWebGL2);
      const extension = format.extension ? this.getExtension(format.extension) : null;
      const extensionSupported = !needsExtension || Boolean(extension);
      const uploadProbeSupported = this.probeFormat(format);

      if (uploadProbeSupported) {
        this.availableCompressedFormats.add(format.id);
      }

      return {
        ...format,
        extensionSupported,
        uploadProbeSupported,
        supported: uploadProbeSupported
      };
    });
  }

  static supportedFormats() {
    return COMPRESSED_FORMATS;
  }

  ensureReady() {
    if (this.contextLost) {
      const error = new Error(this.contextLossReason || 'WebGL 上下文丢失');
      error.name = 'WebGLContextLost';
      throw error;
    }
  }

  clearGlErrors() {
    while (this.gl.getError() !== this.gl.NO_ERROR) {
      // 丢弃历史错误。
    }
  }

  checkGlError(stage) {
    const gl = this.gl;
    const code = gl.getError();

    if (code === gl.NO_ERROR) {
      return;
    }

    const names = {
      [gl.INVALID_ENUM]: 'INVALID_ENUM（格式或参数不支持）',
      [gl.INVALID_VALUE]: 'INVALID_VALUE（尺寸、边界或数据长度无效）',
      [gl.INVALID_OPERATION]: 'INVALID_OPERATION（纹理状态或驱动拒绝上传）',
      [gl.OUT_OF_MEMORY]: 'OUT_OF_MEMORY（GPU 显存不足）'
    };

    const error = new Error(`${ stage }失败：${ names[code] || `GL 错误 0x${ code.toString(16) }` }`);
    error.name = code === gl.OUT_OF_MEMORY ? 'GpuOutOfMemory' : 'GLTextureError';
    error.glErrorCode = code;
    throw error;
  }

  configureTexture(texture, width, height, hasMipmaps) {
    const gl = this.gl;
    const pot = isPowerOfTwo(width) && isPowerOfTwo(height);
    const useMipmaps = hasMipmaps && (this.isWebGL2 || pot);

    gl.bindTexture(gl.TEXTURE_2D, texture);

    if (useMipmaps) {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    } else {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    return {
      useMipmaps,
      warning: hasMipmaps && !pot && !this.isWebGL2
        ? '非 2 的幂纹理不能在 WebGL1 中生成 mipmap，已改为 CLAMP/LINEAR'
        : ''
    };
  }

  uploadCompressed(parsed, options = {}) {
    this.ensureReady();

    const gl = this.gl;
    const { format, width, height, levels } = parsed;
    const requestedMipmaps = Boolean(options.mipmaps);
    const levelsToUpload = requestedMipmaps ? levels : [levels[0]];
    const hasProvidedMipChain = levelsToUpload.length > 1;

    if (!this.availableCompressedFormats.has(format.id)) {
      const error = new Error(`${ format.label } 未通过当前浏览器上传探针检测`);
      error.name = 'UnsupportedFormat';
      throw error;
    }

    if (width > gl.getParameter(gl.MAX_TEXTURE_SIZE) || height > gl.getParameter(gl.MAX_TEXTURE_SIZE)) {
      const error = new Error(`纹理尺寸超过 MAX_TEXTURE_SIZE=${ gl.getParameter(gl.MAX_TEXTURE_SIZE) }`);
      error.name = 'TextureTooLarge';
      throw error;
    }

    const texture = gl.createTexture();
    const start = performance.now();

    try {
      if (options.forceOutOfMemory) {
        const error = new Error('压缩纹理上传失败：OUT_OF_MEMORY（故障注入）');
        error.name = 'GpuOutOfMemory';
        error.glErrorCode = gl.OUT_OF_MEMORY;
        throw error;
      }

      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      this.clearGlErrors();

      for (const levelData of levelsToUpload) {
        gl.compressedTexImage2D(
          gl.TEXTURE_2D,
          levelData.level,
          format.internalFormat,
          levelData.width,
          levelData.height,
          0,
          levelData.data
        );
        this.checkGlError(`压缩纹理 mip ${ levelData.level } 上传`);
      }

      const configuration = this.configureTexture(
        texture,
        width,
        height,
        requestedMipmaps || hasProvidedMipChain
      );
      gl.finish();

      return {
        texture,
        width,
        height,
        mipCount: levelsToUpload.length,
        hasMipmaps: configuration.useMipmaps,
        uploadMs: performance.now() - start,
        warnings: configuration.warning ? [configuration.warning] : []
      };
    } catch (error) {
      gl.deleteTexture(texture);
      throw error;
    }
  }

  uploadUncompressed(image, options = {}) {
    this.ensureReady();

    const gl = this.gl;
    const texture = gl.createTexture();
    const start = performance.now();

    try {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      this.clearGlErrors();
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        image
      );
      this.checkGlError('未压缩纹理上传');

      const pot = isPowerOfTwo(image.width) && isPowerOfTwo(image.height);
      const canGenerateMipmap = this.isWebGL2 || pot;
      let warning = '';

      if (options.mipmaps && canGenerateMipmap) {
        gl.generateMipmap(gl.TEXTURE_2D);
        this.checkGlError('mipmap 生成');
      } else if (options.mipmaps && !canGenerateMipmap) {
        warning = '非 2 的幂图片不能在 WebGL1 自动生成 mipmap，已使用基础层';
      }

      const configuration = this.configureTexture(
        texture,
        image.width,
        image.height,
        Boolean(options.mipmaps && canGenerateMipmap)
      );
      gl.finish();

      return {
        texture,
        width: image.width,
        height: image.height,
        mipCount: options.mipmaps && canGenerateMipmap
          ? 1 + Math.floor(Math.log2(Math.max(image.width, image.height)))
          : 1,
        hasMipmaps: configuration.useMipmaps,
        uploadMs: performance.now() - start,
        warnings: warning ? [warning] : []
      };
    } catch (error) {
      gl.deleteTexture(texture);
      throw error;
    }
  }

  ensureReadTarget(width, height) {
    const gl = this.gl;

    if (this.readTargetWidth !== width || this.readTargetHeight !== height) {
      gl.bindTexture(gl.TEXTURE_2D, this.readTexture);
      this.clearGlErrors();
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        width,
        height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null
      );
      this.checkGlError('离屏渲染目标分配');

      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      gl.bindFramebuffer(gl.FRAMEBUFFER, this.readFramebuffer);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        this.readTexture,
        0
      );

      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        const error = new Error('离屏 Framebuffer 不完整');
        error.name = 'FramebufferError';
        throw error;
      }

      this.readTargetWidth = width;
      this.readTargetHeight = height;
    }
  }

  renderTextureToImageData(handle, width = handle.width, height = handle.height) {
    this.ensureReady();

    const gl = this.gl;
    const start = performance.now();

    this.ensureReadTarget(width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.readFramebuffer);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, handle.texture);
    gl.uniform1i(this.textureLocation, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    this.checkGlError('纹理离屏渲染');

    const bottomUpPixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, bottomUpPixels);
    this.checkGlError('纹理像素读回');

    const pixels = new Uint8ClampedArray(width * height * 4);
    const rowBytes = width * 4;
    for (let y = 0; y < height; y += 1) {
      const sourceOffset = (height - 1 - y) * rowBytes;
      const targetOffset = y * rowBytes;
      pixels.set(
        bottomUpPixels.subarray(sourceOffset, sourceOffset + rowBytes),
        targetOffset
      );
    }

    const image = new ImageData(
      new Uint8ClampedArray(pixels),
      width,
      height
    );

    return {
      image,
      renderMs: performance.now() - start
    };
  }

  deleteTexture(handle) {
    if (handle?.texture) {
      this.gl.deleteTexture(handle.texture);
    }
  }

  dispose() {
    const gl = this.gl;
    gl.deleteBuffer(this.positionBuffer);
    gl.deleteTexture(this.readTexture);
    gl.deleteFramebuffer(this.readFramebuffer);
    gl.deleteProgram(this.program);
    const extension = gl.getExtension('WEBGL_lose_context');
    extension?.loseContext();
  }
}
