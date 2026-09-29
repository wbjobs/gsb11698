import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import { FORMATS } from '../src/constants.js';


function createFakeCanvas(gl) {
  return {
    getContext(type) {
      if (type === 'webgl2' && gl.version === 2) return gl;
      if (type === 'webgl' && gl.version === 1) return gl;
      return null;
    },
    addEventListener() {}
  };
}

function createGl({ version, extensions, formats }) {
  return {
    version,
    createVertexArray: version === 2 ? () => ({}) : undefined,
    COMPRESSED_TEXTURE_FORMATS: 0x86a0,
    RENDERER: 0x1f01,
    VENDOR: 0x1f00,
    VERSION: 0x1f02,
    SHADING_LANGUAGE_VERSION: 0x8b8c,
    MAX_TEXTURE_SIZE: 0x3373,
    getParameter(name) {
      if (name === 0x86a0) return formats;
      if (name === 0x1f01) return 'Fake GPU';
      if (name === 0x1f00) return 'Fake Vendor';
      if (name === 0x1f02) return `WebGL ${version}`;
      if (name === 0x8b8c) return 'GLSL ES';
      if (name === 0x3373) return 4096;
      return null;
    },
    getExtension(name) {
      if (name === 'WEBGL_debug_renderer_info') return { UNMASKED_RENDERER_WEBGL: 0x9245 };
      if (extensions.includes(name)) return { name };
      return null;
    }
  };
}

describe('WebGL support detection', () => {
  beforeEach(() => {
    global.document = { createElement: () => createFakeCanvas(global.__fakeGl) };
  });

  afterEach(() => {
    delete global.document;
    delete global.__fakeGl;
  });

  it('requires WebGL1 extension and compressed format enumeration', async () => {
    global.__fakeGl = createGl({
      version: 1,
      extensions: ['WEBGL_compressed_texture_s3tc', 'WEBGL_compressed_texture_etc1'],
      formats: [FORMATS.DXT1_RGB.internalFormat, FORMATS.ETC1.internalFormat]
    });
    const { detectWebGLSupport } = await import('../src/support.js');
    const support = detectWebGLSupport();
    assert.equal(support.context, 'WebGL1');
    assert.equal(support.formats.DXT1_RGB.supported, true);
    assert.equal(support.formats.ETC1.supported, true);
    assert.equal(support.formats.ASTC_4x4.supported, false);
  });

  it('detects core WebGL2 ASTC/ETC2 formats without WebGL1-only aliases', async () => {
    global.__fakeGl = createGl({
      version: 2,
      extensions: [],
      formats: [FORMATS.ASTC_4x4.internalFormat, FORMATS.ETC2_RGBA.internalFormat]
    });
    const { detectWebGLSupport } = await import('../src/support.js');
    const support = detectWebGLSupport(global.__fakeGl);
    assert.equal(support.context, 'WebGL2');
    assert.equal(support.formats.ASTC_4x4.supported, true);
    assert.equal(support.formats.ETC2_RGBA.supported, true);
    assert.equal(support.formats.DXT1_RGB.supported, false);
  });
});
