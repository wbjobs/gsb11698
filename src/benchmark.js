import { FORMATS, ERROR_CODES } from './constants.js';
import { BENCHMARK_CASES, createKtxFixture, createInvalidKtx } from './fixtures.js';
import { createFallbackPixels } from './fallback.js';
import { estimateUncompressedVram } from './parsers.js';
import { compareRenderedTexture } from './quality.js';
import { markRange } from './performance.js';

export async function runBenchmark({ support, decoder, renderer, onResult }) {
  const results = [];
  const originalSize = { width: renderer.canvas.width, height: renderer.canvas.height };

  for (const item of BENCHMARK_CASES) {
    const format = FORMATS[item.formatId];
    const fixture = createKtxFixture(format, item.width, item.height);
    const caseStarted = performance.now();
    let message;
    let decoded;
    let workerTimings = { parseMs: 0, totalWorkerMs: 0 };

    try {
      message = await decoder.decode(fixture.buffer);
      decoded = message.texture;
      workerTimings = message.timings;
    } catch (error) {
      const result = {
        formatId: item.formatId,
        format,
        mode: 'compressed',
        ok: false,
        status: error.code || ERROR_CODES.DECODE_FAILED,
        error,
        networkMs: 0,
        parseMs: 0,
        uploadMs: 0,
        totalMs: performance.now() - caseStarted,
        transferBytes: fixture.buffer.byteLength,
        estimatedVram: 0,
        psnr: null,
        source: '内存夹具',
        fallback: false
      };
      results.push(result);
      onResult?.(result);
      continue;
    }

    renderer.resize(decoded.width, decoded.height);
    let renderResult;
    let compressedError = null;
    try {
      renderResult = renderer.loadWithFallback(decoded, support);
    } catch (error) {
      compressedError = error;
      renderResult = {
        usedCompressed: false,
        fallbackReason: 'fallback-failed',
        uploadMs: 0,
        compressedError: { code: error.code, message: error.message }
      };
    }

    const psnr = renderResult.texture
      ? compareRenderedTexture(renderer, renderResult.texture, decoded).psnr
      : null;
    const compressedResult = {
      formatId: item.formatId,
      format,
      mode: 'compressed',
      ok: renderResult.usedCompressed,
      status: renderResult.usedCompressed ? 'loaded' : renderResult.compressedError?.code || 'fallback',
      error: renderResult.usedCompressed ? null : renderResult.compressedError,
      networkMs: 0,
      parseMs: workerTimings.parseMs,
      uploadMs: renderResult.uploadMs || 0,
      totalMs: performance.now() - caseStarted,
      transferBytes: fixture.buffer.byteLength,
      estimatedVram: decoded.estimatedFullVram,
      mipmapsEnabled: renderResult.mipmapsEnabled,
      mipmapWarning: renderResult.mipmapWarning || null,
      psnr: renderResult.usedCompressed ? psnr : null,
      source: fixture.name,
      fallback: false
    };
    results.push(compressedResult);
    markRange('texture-worker-decode', caseStarted, caseStarted + workerTimings.parseMs);
    markRange('texture-gpu-upload', caseStarted + workerTimings.parseMs, caseStarted + workerTimings.parseMs + compressedResult.uploadMs);
    markRange('texture-total-load', caseStarted, performance.now());
    onResult?.(compressedResult);

    const fallbackStarted = performance.now();
    renderer.resize(decoded.width, decoded.height);
    const fallbackImage = createFallbackPixels(decoded, 'benchmark');
    let fallbackRender = null;
    let fallbackError = null;
    try {
      fallbackRender = renderer.loadWithFallback(decoded, support, {
        forceFallback: true,
        fallbackReason: 'benchmark',
        fallbackImage
      });
    } catch (error) {
      fallbackError = error;
    }
    const fallbackPsnr = fallbackRender?.texture
      ? compareRenderedTexture(renderer, fallbackRender.texture, decoded).psnr
      : null;
    const fallbackResult = {
      formatId: item.formatId,
      format,
      mode: 'rgba-fallback',
      ok: Boolean(fallbackRender),
      status: fallbackRender ? 'fallback' : fallbackError.code,
      error: fallbackError || compressedError,
      networkMs: 0,
      parseMs: workerTimings.parseMs,
      uploadMs: fallbackRender?.uploadMs || 0,
      totalMs: performance.now() - fallbackStarted,
      transferBytes: decoded.width * decoded.height * 4,
      estimatedVram: estimateUncompressedVram(decoded.width, decoded.height, fallbackRender.mipmapsEnabled ? fallbackImage.mipLevels : 1),
      mipmapsEnabled: fallbackRender?.mipmapsEnabled || false,
      psnr: fallbackPsnr,
      source: '客户端生成 RGBA（外部同源 RGBA 也可）',
      fallback: true
    };
    results.push(fallbackResult);
    markRange('texture-fallback-upload', fallbackStarted, performance.now());
    onResult?.(fallbackResult);
  }

  const invalid = createInvalidKtx();
  const invalidStarted = performance.now();
  let invalidError = null;
  try {
    await decoder.decode(invalid.buffer);
  } catch (error) {
    invalidError = error;
  }
  const invalidResult = {
    formatId: 'INVALID',
    format: { label: '损坏 KTX 解码失败用例', family: '故障注入' },
    mode: 'compressed',
    ok: false,
    status: invalidError?.code || 'unexpected-success',
    error: invalidError,
    networkMs: 0,
    parseMs: 0,
    uploadMs: 0,
    totalMs: performance.now() - invalidStarted,
    transferBytes: invalid.buffer.byteLength,
    estimatedVram: 0,
    psnr: null,
    source: invalid.name,
    fallback: false
  };
  results.push(invalidResult);
  onResult?.(invalidResult);

  renderer.resize(originalSize.width, originalSize.height);
  return results;
}
