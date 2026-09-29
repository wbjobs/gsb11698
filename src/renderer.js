import { ERROR_CODES, GL, TextureError } from './constants.js';
import { estimateUncompressedVram, isPowerOfTwo } from './parsers.js';
import { createFallbackPixels, fallbackCanUseMipmaps } from './fallback.js';

const VERTEX_SHADER = `
attribute vec2 a_position;
attribute vec2 a_uv;
varying vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_texture;
void main() {
  gl_FragColor = texture2D(u_texture, v_uv);
}`;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new TextureError(ERROR_CODES.GPU_UPLOAD_FAILED, `Shader 编译失败：${message}`);
  }
  return shader;
}

export class TextureRenderer {
  constructor(canvas, providedContext = null) {
    this.canvas = canvas;
    const gl = providedContext || canvas.getContext('webgl2', {
      antialias: false,
      preserveDrawingBuffer: true,
      failIfMajorPerformanceCaveat: false
    }) || canvas.getContext('webgl', {
      antialias: false,
      preserveDrawingBuffer: true,
      failIfMajorPerformanceCaveat: false
    });
    if (!gl) throw new TextureError(ERROR_CODES.WEBGL_UNAVAILABLE, '无法创建渲染用 WebGL 上下文');
    this.gl = gl;
    this.isWebGL2 = typeof gl.createVertexArray === 'function';
    this.contextLost = false;
    this.textures = [];
    this.initProgram();
    this.initGeometry();
    gl.disable(gl.BLEND);
    canvas.addEventListener('webglcontextlost', this.handleContextLost);
  }

  handleContextLost = (event) => {
    event.preventDefault();
    this.contextLost = true;
  };

  initProgram() {
    const gl = this.gl;
    const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    this.program = gl.createProgram();
    gl.attachShader(this.program, vertex);
    gl.attachShader(this.program, fragment);
    gl.linkProgram(this.program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      throw new TextureError(ERROR_CODES.GPU_UPLOAD_FAILED, `Shader 链接失败：${gl.getProgramInfoLog(this.program)}`);
    }
    this.locations = {
      position: gl.getAttribLocation(this.program, 'a_position'),
      uv: gl.getAttribLocation(this.program, 'a_uv'),
      texture: gl.getUniformLocation(this.program, 'u_texture')
    };
  }

  initGeometry() {
    const gl = this.gl;
    this.positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.uvBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  }

  ensureContext() {
    if (this.contextLost) {
      throw new TextureError(ERROR_CODES.OUT_OF_MEMORY, 'WebGL 上下文已丢失，通常由 GPU 显存压力或驱动重置导致。');
    }
  }

  checkGpuError(operation) {
    const error = this.gl.getError();
    if (error !== GL.NO_ERROR) {
      const code = error === GL.OUT_OF_MEMORY ? ERROR_CODES.OUT_OF_MEMORY : ERROR_CODES.GPU_UPLOAD_FAILED;
      throw new TextureError(code, `${operation} 失败，WebGL 错误码 0x${error.toString(16)}`, { glError: error });
    }
  }

  releaseTextures() {
    for (const texture of this.textures) this.gl.deleteTexture(texture);
    this.textures.length = 0;
  }

  uploadCompressed(decoded, support) {
    this.ensureContext();
    const gl = this.gl;
    const format = support.formats[decoded.formatId];
    if (!format?.supported) {
      throw new TextureError(ERROR_CODES.UNSUPPORTED_FORMAT, `当前浏览器不支持 ${decoded.format?.label || decoded.formatId}`);
    }
    if (decoded.width > support.maxTextureSize || decoded.height > support.maxTextureSize) {
      throw new TextureError(ERROR_CODES.GPU_UPLOAD_FAILED, `纹理尺寸超过 MAX_TEXTURE_SIZE=${support.maxTextureSize}`);
    }
    if (decoded.format.powerOfTwo && (!isPowerOfTwo(decoded.width) || !isPowerOfTwo(decoded.height))) {
      throw new TextureError(ERROR_CODES.UNSUPPORTED_FORMAT, 'PVRTC 仅允许 2 的幂尺寸');
    }

    this.ensureExtension(format);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const canMip = decoded.mipComplete && fallbackCanUseMipmaps(decoded.width, decoded.height, this.isWebGL2);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, canMip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, canMip ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, canMip ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    if (canMip) {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_BASE_LEVEL, 0);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, decoded.levels.length - 1);
    }

    const started = performance.now();
    decoded.levels.forEach((level) => {
      gl.compressedTexImage2D(
        gl.TEXTURE_2D,
        level.level,
        format.internalFormat,
        level.width,
        level.height,
        0,
        level.data
      );
    });
    this.checkGpuError('压缩纹理上传');

    if (!decoded.mipComplete) {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }

    this.textures.push(texture);
    return {
      texture,
      uploadMs: performance.now() - started,
      mipmapsEnabled: canMip,
      mipmapWarning: decoded.mipComplete ? null : '容器未包含完整 mipmap 链，已禁用 mip 过滤而不是自动生成压缩 mip。'
    };
  }

  uploadUncompressed(image, options = {}) {
    this.ensureContext();
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, Boolean(options.flipY));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const canMip = image.mipLevels > 1 && fallbackCanUseMipmaps(image.width, image.height, this.isWebGL2);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, canMip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, canMip ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, canMip ? gl.REPEAT : gl.CLAMP_TO_EDGE);

    const started = performance.now();
    if (image.levels?.length && (!canMip || image.levels.length === image.mipLevels)) {
      image.levels.forEach((level) => {
        if (!canMip && level.level !== 0) return;
        gl.texImage2D(gl.TEXTURE_2D, level.level, gl.RGBA, level.width, level.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, level.data);
      });
      if (canMip) {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_BASE_LEVEL, 0);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, image.levels.length - 1);
      }
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, image.width, image.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, image.pixels);
    }
    this.checkGpuError('未压缩纹理上传');
    this.textures.push(texture);
    return {
      texture,
      uploadMs: performance.now() - started,
      mipmapsEnabled: canMip,
      estimatedVram: estimateUncompressedVram(image.width, image.height, canMip ? image.mipLevels : 1)
    };
  }

  ensureExtension(format) {
    const aliases = this.extensionAliases(format.extension);
    const found = aliases.map((name) => this.gl.getExtension(name)).find(Boolean);
    if (!found) {
      throw new TextureError(ERROR_CODES.UNSUPPORTED_FORMAT, `上传时无法启用扩展 ${format.extension}`);
    }
  }

  extensionAliases(name) {
    if (name === 'WEBGL_compressed_texture_s3tc') {
      return [name, 'WEBKIT_WEBGL_compressed_texture_s3tc', 'MOZ_WEBGL_compressed_texture_s3tc'];
    }
    if (name === 'WEBGL_compressed_texture_pvrtc') return [name, 'WEBKIT_WEBGL_compressed_texture_pvrtc'];
    if (name === 'WEBGL_compressed_texture_etc1') return [name, 'WEBKIT_WEBGL_compressed_texture_etc1'];
    return [name];
  }

  resize(width, height) {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  render(texture) {
    this.ensureContext();
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(this.locations.texture, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(this.locations.position);
    gl.vertexAttribPointer(this.locations.position, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
    gl.disable(gl.BLEND);
    gl.enableVertexAttribArray(this.locations.uv);
    gl.vertexAttribPointer(this.locations.uv, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this.checkGpuError('纹理绘制');
    gl.finish();
  }

  readPixels() {
    const gl = this.gl;
    const pixels = new Uint8Array(this.canvas.width * this.canvas.height * 4);
    gl.readPixels(0, 0, this.canvas.width, this.canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    this.checkGpuError('读取渲染像素');
    return pixels;
  }

  loadWithFallback(decoded, support, options = {}) {
    let fallbackReason = null;
    let usedCompressed = false;
    let compressedError = null;
    let upload;
    const fallbackImage = options.fallbackImage || createFallbackPixels(decoded, options.fallbackReason || 'unsupported');

    this.releaseTextures();
    try {
      if (!options.forceFallback) {
        upload = this.uploadCompressed(decoded, support);
        usedCompressed = true;
      } else {
        fallbackReason = options.fallbackReason || 'forced';
      }
    } catch (error) {
      compressedError = {
        code: error.code,
        message: error.message,
        details: error.details
      };
      fallbackReason = error.code === ERROR_CODES.OUT_OF_MEMORY ? 'out-of-memory' : error.code === ERROR_CODES.UNSUPPORTED_FORMAT ? 'unsupported' : error.code === ERROR_CODES.GPU_UPLOAD_FAILED ? 'upload-failed' : 'decode';
      try {
        this.releaseTextures();
      } catch {
        // 旧 texture 在 context lost 时已经无效。
      }
    }

    if (!usedCompressed) {
      const image = fallbackImage;
      try {
        upload = this.uploadUncompressed(image);
        this.render(upload.texture);
        return {
          usedCompressed: false,
          fallbackReason,
          compressedError,
          image,
          ...upload
        };
      } catch (fallbackError) {
        throw new TextureError(
          ERROR_CODES.FALLBACK_FAILED,
          `压缩纹理失败后 RGBA 降级也失败：${fallbackError.message}`,
          { compressedError, fallbackError: { code: fallbackError.code, message: fallbackError.message } }
        );
      }
    }

    this.render(upload.texture);
    return {
      usedCompressed: true,
      fallbackReason: null,
      compressedError: null,
      ...upload
    };
  }

  dispose() {
    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
    this.releaseTextures();
    const lose = this.gl.getExtension('WEBGL_lose_context');
    lose?.loseContext();
  }
}
