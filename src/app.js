import {
  COMPRESSED_FORMATS,
  compressedTextureBytes,
  getFormat,
  uncompressedTextureBytes
} from './formats.js';
import { createFixtureReference } from './fixtures.js';
import { clearCachedTextures } from './idb-cache.js';
import {
  formatBytes,
  formatMilliseconds,
  formatPsnr,
  formatRatio,
  psnr
} from './metrics.js';
import { createFallbackImageData, fileToImageData, loadImageToImageData } from './fallback-image.js';
import { TextureRenderer } from './texture-renderer.js';

const dom = {
  environment: document.querySelector('#environment'),
  webglStatus: document.querySelector('#webgl-status'),
  gpuInfo: document.querySelector('#gpu-info'),
  formatSelect: document.querySelector('#format-select'),
  mipmapToggle: document.querySelector('#mipmap-toggle'),
  cacheToggle: document.querySelector('#cache-toggle'),
  oomToggle: document.querySelector('#oom-toggle'),
  runSelected: document.querySelector('#run-selected'),
  runAll: document.querySelector('#run-all'),
  clearCache: document.querySelector('#clear-cache'),
  loadCorrupt: document.querySelector('#load-corrupt'),
  simulateCors: document.querySelector('#simulate-cors'),
  textureUrl: document.querySelector('#texture-url'),
  loadUrl: document.querySelector('#load-url'),
  textureFile: document.querySelector('#texture-file'),
  fallbackFile: document.querySelector('#fallback-file'),
  supportSummary: document.querySelector('#support-summary'),
  supportTable: document.querySelector('#support-table'),
  metricsTable: document.querySelector('#metrics-table'),
  previewCaption: document.querySelector('#preview-caption'),
  compressedCanvas: document.querySelector('#compressed-canvas'),
  fallbackCanvas: document.querySelector('#fallback-canvas'),
  referenceCanvas: document.querySelector('#reference-canvas'),
  compressedCaption: document.querySelector('#compressed-caption'),
  fallbackCaption: document.querySelector('#fallback-caption'),
  referenceCaption: document.querySelector('#reference-caption'),
  eventLog: document.querySelector('#event-log')
};

const state = {
  renderer: null,
  worker: null,
  nextWorkerId: 1,
  pendingWorkers: new Map(),
  tests: [],
  observerEvents: 0,
  busy: false,
  customFallbackImage: null
};

function log(message, level = 'info') {
  const event = document.createElement('div');
  event.className = `event ${ level }`;
  const time = new Date().toLocaleTimeString();
  event.textContent = `[${ time }] ${ message }`;
  dom.eventLog.prepend(event);

  while (dom.eventLog.children.length > 30) {
    dom.eventLog.lastElementChild.remove();
  }
}

function createWorker() {
  if (state.worker) {
    return state.worker;
  }

  const worker = new Worker(new URL('./texture-worker.js', import.meta.url), {
    type: 'module'
  });
  worker.onmessage = (event) => {
    const resolver = state.pendingWorkers.get(event.data.id);
    if (!resolver) {
      return;
    }

    state.pendingWorkers.delete(event.data.id);
    if (event.data.ok) {
      resolver.resolve(event.data);
    } else {
      resolver.reject(event.data.error);
    }
  };

  worker.onerror = (event) => {
    log(`Web Worker 错误：${ event.message }`, 'error');
  };

  state.worker = worker;
  return worker;
}

function postWorker(message, transferables = []) {
  const id = state.nextWorkerId++;
  const worker = createWorker();

  return new Promise((resolve, reject) => {
    state.pendingWorkers.set(id, { resolve, reject });
    worker.postMessage({ id, ...message }, transferables);
  });
}

function setupPerformanceObserver() {
  if (!('PerformanceObserver' in window)) {
    log('当前浏览器不支持 PerformanceObserver，仍使用 performance.now() 统计耗时', 'warning');
    return;
  }

  try {
    const observer = new PerformanceObserver((list) => {
      state.observerEvents += list.getEntries().length;
    });
    observer.observe({ entryTypes: ['measure'] });
  } catch (error) {
    log(`PerformanceObserver 启动失败：${ error.message }`, 'warning');
  }
}

function drawImageData(canvas, image) {
  const context = canvas.getContext('2d');
  canvas.width = image.width;
  canvas.height = image.height;
  context.imageSmoothingEnabled = false;
  context.putImageData(image, 0, 0);
}

function drawUnavailable(canvas, caption) {
  const context = canvas.getContext('2d');
  canvas.width = 256;
  canvas.height = 256;
  context.fillStyle = '#0f172a';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#94a3b8';
  context.font = '16px system-ui, sans-serif';
  context.textAlign = 'center';
  context.fillText(caption, 128, 128);
}

function statusTag(status) {
  const classes = {
    compressed: 'ok',
    fallback: 'warn',
    failed: 'bad',
    skipped: 'neutral'
  };
  const labels = {
    compressed: '压缩路径',
    fallback: '已降级',
    failed: '失败',
    skipped: '跳过'
  };

  return `<span class="tag ${ classes[status] || 'neutral' }">${ labels[status] || status }</span>`;
}

function cacheTag(result) {
  if (!result.source?.cacheKey) {
    return '<span class="tag neutral">未缓存</span>';
  }

  if (result.cached) {
    return '<span class="tag ok">IDB 命中</span>';
  }

  if (result.cacheWrite?.ok) {
    return '<span class="tag neutral">IDB 写入</span>';
  }

  if (result.cacheWrite) {
    return `<span class="tag warn" title="${ result.cacheWrite.message }">缓存失败</span>`;
  }

  return '<span class="tag neutral">缓存关闭</span>';
}

function renderSupportTable() {
  const detected = state.renderer.detected;
  const supportedCount = detected.filter((format) => format.supported).length;

  dom.supportSummary.textContent = `${ supportedCount }/${ detected.length } 项通过真实上传探针`;
  dom.supportSummary.className = `pill ${ supportedCount ? 'ok' : 'warn' }`;

  dom.supportTable.innerHTML = detected.map((format) => `
    <tr>
      <td><strong>${ format.label }</strong><br><code>${ format.id }</code></td>
      <td><code>${ format.extension }</code></td>
      <td>${ format.extensionSupported
        ? `<span class="tag ok">${ format.coreInWebGL2 && state.renderer.isWebGL2 && !state.renderer.extensions.get(format.extension) ? 'WebGL2 核心' : '存在' }</span>`
        : '<span class="tag bad">缺失</span>' }</td>
      <td>${ format.uploadProbeSupported ? '<span class="tag ok">通过</span>' : '<span class="tag bad">拒绝</span>' }</td>
      <td>${ format.pvrtc ? `${ format.bytesPerPixel } bpp` : `${ format.blockWidth }×${ format.blockHeight } / ${ format.blockBytes } B` }</td>
      <td>${ formatBytes(compressedTextureBytes(format, 16, 16, false)) }</td>
    </tr>
  `).join('');
}

function initializeFormatSelect() {
  dom.formatSelect.innerHTML = COMPRESSED_FORMATS.map((format) => (
    `<option value="${ format.id }">${ format.label }</option>`
  )).join('');
}

function initializeRenderer() {
  try {
    state.renderer = new TextureRenderer(document.createElement('canvas'));
    const info = state.renderer.getGpuInfo();
    const supported = state.renderer.detected.filter((format) => format.supported).length;

    dom.webglStatus.textContent = `WebGL 可用，${ supported }/${ state.renderer.detected.length } 个压缩格式可上传`;
    document.querySelector('.status-dot').className = `status-dot ${ supported ? '' : 'warn' }`;
    dom.gpuInfo.textContent = `${ info.renderer } · ${ info.version } · MAX_TEXTURE_SIZE=${ info.maxTextureSize }`;
    renderSupportTable();
    log('WebGL 扩展与最小压缩纹理上传探针检测完成');
  } catch (error) {
    dom.webglStatus.textContent = 'WebGL 不可用，仅演示 Canvas 2D 降级';
    document.querySelector('.status-dot').className = 'status-dot bad';
    dom.gpuInfo.textContent = error.message;
    log(error.message, 'error');

    dom.supportTable.innerHTML = `
      <tr><td colspan="6" class="empty">${ error.message }</td></tr>
    `;
  }
}

setupPerformanceObserver();
initializeFormatSelect();
initializeRenderer();

function setBusy(value, label = '测试中…') {
  state.busy = value;
  document.querySelectorAll('button').forEach((button) => {
    button.disabled = value;
  });

  if (value) {
    dom.runSelected.textContent = label;
  } else {
    dom.runSelected.textContent = '加载所选格式';
  }
}

function rebuildParsedFormat(result) {
  return {
    ...result.parsed,
    format: getFormat(result.parsed.format.id)
  };
}

function resolveReferenceImage(parsed, options = {}) {
  if (options.referenceImage) {
    return {
      image: options.referenceImage,
      source: '用户提供的未压缩对照图'
    };
  }

  if ((parsed.format.id === 'dxt1' && options.builtinReference) || options.forceBuiltinReference) {
    return {
      image: createFixtureReference(parsed.format),
      source: '内置参考图'
    };
  }

  return {
    image: null,
    source: '未提供参考图（PSNR 不可计算）'
  };
}

async function resolveFallbackImage(error, parsed, dimensions, options) {
  if (options.referenceImage) {
    return {
      image: options.referenceImage,
      reason: '使用用户未压缩对照图',
      referenceSource: '用户未压缩对照图'
    };
  }

  if (options.fallbackUrl) {
    try {
      const image = await loadImageToImageData(options.fallbackUrl, { crossOrigin: 'anonymous' });
      return {
        image,
        reason: `远程未压缩图片成功（${ error.reason }）`,
        referenceSource: '远程未压缩图片'
      };
    } catch (fallbackError) {
      log(`未压缩远程图片也无法加载：${ fallbackError.message }`, 'warning');
    }
  }

  if (parsed?.format) {
    return {
      image: createFallbackImageData(
        dimensions?.width || parsed.width,
        dimensions?.height || parsed.height,
        error.reason,
        parsed.format.label
      ),
      reason: error.reason,
      referenceSource: 'Canvas 占位图'
    };
  }

  return {
    image: createFallbackImageData(dimensions?.width || 16, dimensions?.height || 16, error.reason),
    reason: error.reason,
    referenceSource: 'Canvas 占位图'
  };
}

function classifyTextureError(error, parsed) {
  const name = error?.name || 'Error';
  const message = error?.message || String(error);

  if (name === 'UnsupportedFormat') {
    return {
      reason: `格式不支持：${ parsed?.format?.label || message }`,
      userMessage: '当前浏览器/GPU 不支持该压缩格式，已自动使用未压缩纹理。',
      kind: 'unsupported'
    };
  }

  if (name === 'DecodeError') {
    return {
      reason: `解码失败：${ message }`,
      userMessage: 'KTX 容器或压缩数据校验失败，已使用 Canvas 占位降级。',
      kind: 'decode'
    };
  }

  if (name === 'CrossOriginTextureError') {
    return {
      reason: message,
      userMessage: '跨域纹理未通过 CORS 授权，已使用未压缩占位纹理。',
      kind: 'cors'
    };
  }

  if (name === 'GpuOutOfMemory' || name === 'OutOfMemoryError') {
    return {
      reason: 'GPU 显存不足',
      userMessage: '压缩纹理上传触发显存不足，已释放对象并降级。',
      kind: 'oom'
    };
  }

  if (name === 'WebGLContextLost') {
    return {
      reason: 'WebGL 上下文丢失',
      userMessage: 'GPU 上下文丢失，已切换到 Canvas 2D 路径。',
      kind: 'context'
    };
  }

  if (name === 'SecurityError') {
    return {
      reason: '跨域图片数据受污染',
      userMessage: '纹理或图片没有 CORS 授权，无法读取像素，已使用占位纹理。',
      kind: 'cors'
    };
  }

  return {
    reason: message,
    userMessage: '压缩纹理加载失败，已使用未压缩纹理。',
    kind: name
  };
}

function renderPreview(test) {
  dom.previewCaption.textContent = test.title;

  if (test.compressedImage) {
    drawImageData(dom.compressedCanvas, test.compressedImage);
    dom.compressedCaption.textContent = `压缩路径：${ test.formatLabel } · PSNR ${ formatPsnr(test.compressedPsnr) }`;
  } else {
    drawUnavailable(dom.compressedCanvas, '压缩路径不可用');
    dom.compressedCaption.textContent = test.fallbackReason || '压缩路径不可用';
  }

  drawImageData(dom.fallbackCanvas, test.fallbackImage);
  if (test.referenceImage) {
    drawImageData(dom.referenceCanvas, test.referenceImage);
  } else {
    drawUnavailable(dom.referenceCanvas, '未提供参考图');
  }
  dom.fallbackCaption.textContent = `未压缩 RGBA：${ test.fallbackReferenceSource } · PSNR ${ formatPsnr(test.fallbackPsnr) }`;
  dom.referenceCaption.textContent = `参考图：${ test.referenceSource }`;
}

function addMetricRow(test) {
  state.tests.unshift(test);
  state.tests = state.tests.slice(0, 30);

  const warningText = test.warnings.length ? `<br><span class="neutral">${ test.warnings.join('<br>') }</span>` : '';
  const row = document.createElement('tr');
  row.innerHTML = `
    <td><strong>${ test.title }</strong><br><code>${ test.dimensions }</code>${ warningText }</td>
    <td>${ statusTag(test.status) }<br><small>${ test.fallbackReason || test.referenceSource }</small></td>
    <td>${ formatMilliseconds(test.timings.acquireMs) }</td>
    <td>${ formatMilliseconds(test.timings.parseMs) }</td>
    <td>${ formatMilliseconds(test.timings.uploadMs) }</td>
    <td><strong>${ formatMilliseconds(test.timings.totalMs) }</strong></td>
    <td>${ test.compressedBytes ? formatBytes(test.compressedBytes) : 'N/A' }</td>
    <td>${ formatBytes(test.fallbackBytes) }</td>
    <td>${ test.saving ? formatRatio(test.saving) : 'N/A' }</td>
    <td>${ test.compressedPsnr == null ? 'N/A（降级）' : formatPsnr(test.compressedPsnr) }</td>
    <td>${ cacheTag(test) }</td>
  `;

  if (state.metricsTable.querySelector('.empty')) {
    state.metricsTable.replaceChildren();
  }

  state.metricsTable.prepend(row);
  renderPreview(test);
}

async function runCompressedPath({
  result,
  parsed,
  reference,
  useMipmaps,
  dimensions,
  forceOutOfMemory = false
}) {
  const warnings = [];
  let handle = null;
  let compressedImage = null;
  let compressedPsnr = null;
  let uploadMs = 0;

  try {
    handle = state.renderer.uploadCompressed(parsed, {
      mipmaps: useMipmaps,
      forceOutOfMemory
    });
    uploadMs = handle.uploadMs;
    warnings.push(...handle.warnings);

    const rendered = state.renderer.renderTextureToImageData(handle, dimensions.width, dimensions.height);
    compressedImage = rendered.image;

    if (
      reference.image &&
      reference.image.width === compressedImage.width &&
      reference.image.height === compressedImage.height
    ) {
      compressedPsnr = psnr(reference.image, compressedImage);
    } else {
      warnings.push('参考图与压缩纹理尺寸不同，已跳过 PSNR');
    }

    return {
      status: 'compressed',
      handle,
      compressedImage,
      compressedPsnr,
      uploadMs,
      warnings,
      fallbackReason: ''
    };
  } catch (error) {
    if (handle) {
      state.renderer.deleteTexture(handle);
    }
    throw error;
  }
}

async function runFallbackPath({
  errorInfo,
  parsed,
  dimensions,
  reference,
  useMipmaps,
  options
}) {
  const fallback = await resolveFallbackImage(
    { reason: errorInfo.userMessage },
    parsed,
    dimensions,
    options
  );

  let handle = null;
  let fallbackImage = fallback.image;
  let uploadMs = 0;
  const warnings = [];

  if (state.renderer && !state.renderer.contextLost) {
    try {
      handle = state.renderer.uploadUncompressed(fallback.image, { mipmaps: useMipmaps });
      uploadMs = handle.uploadMs;
      warnings.push(...handle.warnings);
      const rendered = state.renderer.renderTextureToImageData(
        handle,
        fallback.image.width,
        fallback.image.height
      );
      fallbackImage = rendered.image;
    } catch (fallbackError) {
      if (handle) {
        state.renderer.deleteTexture(handle);
      }
      warnings.push(`WebGL 未压缩上传也失败：${ fallbackError.message }；Canvas 2D 直接显示`);
    }
  }

  if (handle) {
    state.renderer.deleteTexture(handle);
  }

  return {
    status: 'fallback',
    fallbackImage,
    fallbackReferenceImage: fallback.image,
    fallbackReferenceSource: fallback.referenceSource,
    fallbackReason: errorInfo.kind ? errorInfo.reason : '',
    fallbackUploadMs: uploadMs,
    warnings
  };
}

async function runTextureTest(workerPromise, metadata, options = {}) {
  const totalStart = performance.now();
  const measureName = `texture-test-${ state.nextWorkerId }-${ Date.now() }`;
  performance.mark(`${ measureName }-start`);
  const useMipmaps = Boolean(options.mipmaps);
  const useFallbackForOom = Boolean(options.injectOom);
  let result = null;
  let parsed = null;
  let acquireMs = 0;
  let parseMs = 0;
  let loadError = null;
  let dimensions = options.dimensions || { width: 16, height: 16 };

  const acquireStart = performance.now();
  try {
    result = await workerPromise;
    acquireMs = performance.now() - acquireStart;
    parsed = rebuildParsedFormat(result);
    parseMs = result.parseMs ?? 0;
    dimensions = { width: parsed.width, height: parsed.height };
  } catch (error) {
    acquireMs = performance.now() - acquireStart;
    loadError = error;
  }

  const format = parsed?.format || (metadata.formatId ? getFormat(metadata.formatId) : null);
  const reference = parsed
    ? resolveReferenceImage(parsed, options)
    : {
        image: null,
        source: '未提供参考图（解码失败）'
      };

  let compressedOutcome = null;
  let fallbackOutcome = null;
  let errorInfo = loadError ? classifyTextureError(loadError, parsed) : null;
  const warnings = [];

  if (parsed && state.renderer) {
    if (!state.renderer.availableCompressedFormats.has(parsed.format.id)) {
      errorInfo = {
        reason: `格式不支持：${ parsed.format.label }`,
        userMessage: '扩展缺失或上传探针拒绝，已自动使用未压缩纹理。',
        kind: 'unsupported'
      };
      log(`${ parsed.format.label } 不支持，触发降级`, 'warning');
    } else {
      try {
        compressedOutcome = await runCompressedPath({
          result,
          parsed,
          reference,
          useMipmaps,
          dimensions,
          forceOutOfMemory: useFallbackForOom
        });
      } catch (error) {
        errorInfo = classifyTextureError(error, parsed);
        log(errorInfo.userMessage, 'error');
      }
    }
  } else if (parsed && !state.renderer) {
    errorInfo = {
      reason: 'WebGL 不可用',
      userMessage: '当前页面没有可用 WebGL，使用 Canvas 2D 占位降级。',
      kind: 'webgl'
    };
  }

  const fallbackContext = errorInfo || {
    reason: '',
    userMessage: '同步生成未压缩 RGBA 对照路径'
  };

  fallbackOutcome = await runFallbackPath({
    errorInfo: fallbackContext,
    parsed,
    dimensions,
    reference,
    useMipmaps,
    options: {
      ...options,
      referenceImage: reference.image || options.referenceImage
    }
  });

  if (compressedOutcome?.handle) {
    state.renderer.deleteTexture(compressedOutcome.handle);
  }

  const mipCount = compressedOutcome
    ? compressedOutcome.handle.mipCount
    : useMipmaps
      ? 1 + Math.floor(Math.log2(Math.max(dimensions.width, dimensions.height)))
      : 1;
  const compressedBytes = format && compressedOutcome
    ? compressedTextureBytes(format, dimensions.width, dimensions.height, mipCount > 1)
    : null;
  const fallbackImage = fallbackOutcome?.fallbackImage || reference.image || createFallbackImageData(
    dimensions.width,
    dimensions.height,
    errorInfo?.userMessage || '未压缩纹理'
  );
  const fallbackReferenceImage = fallbackOutcome?.fallbackReferenceImage || fallbackImage;
  const fallbackBytes = uncompressedTextureBytes(
    fallbackReferenceImage.width,
    fallbackReferenceImage.height,
    fallbackOutcome ? mipCount > 1 : false
  );
  const fallbackPsnr = reference.image &&
    fallbackReferenceImage === reference.image &&
    fallbackImage.width === reference.image.width &&
    fallbackImage.height === reference.image.height
    ? psnr(reference.image, fallbackImage)
    : null;

  const test = {
    title: metadata.title || format?.label || '未命名纹理',
    formatLabel: format?.label || '未压缩',
    dimensions: `${ dimensions.width }×${ dimensions.height } · mip ${ mipCount }`,
    status: compressedOutcome ? 'compressed' : 'fallback',
    source: result?.source || metadata.source || {},
    cached: Boolean(result?.cached),
    cacheWrite: result?.cacheWrite,
    timings: {
      acquireMs: result?.loadMs ?? acquireMs,
      parseMs,
      uploadMs: compressedOutcome?.uploadMs ?? fallbackOutcome?.fallbackUploadMs ?? 0,
      totalMs: performance.now() - totalStart
    },
    compressedBytes,
    fallbackBytes,
    saving: compressedBytes == null ? null : 1 - compressedBytes / fallbackBytes,
    compressedImage: compressedOutcome?.compressedImage || null,
    compressedPsnr: compressedOutcome?.compressedPsnr ?? null,
    fallbackImage,
    fallbackReferenceImage,
    fallbackReferenceSource: fallbackOutcome?.fallbackReferenceSource || reference.source,
    referenceImage: reference.image,
    referenceSource: reference.source,
    fallbackReason: fallbackOutcome?.fallbackReason || '',
    warnings: [...(compressedOutcome?.warnings || []), ...(fallbackOutcome?.warnings || [])]
  };

  addMetricRow(test);

  performance.mark(`${ measureName }-end`);
  performance.measure(measureName, `${ measureName }-start`, `${ measureName }-end`);

  if (errorInfo) {
    log(errorInfo.userMessage, 'error');
  } else {
    log(`${ test.title } 加载完成：${ formatBytes(compressedBytes) } / 降级 ${ formatBytes(fallbackBytes) }，PSNR ${ formatPsnr(test.compressedPsnr) }`, 'success');
  }

  return test;
}

function commonOptions() {
  return {
    mipmaps: dom.mipmapToggle.checked,
    injectOom: dom.oomToggle.checked,
    cache: dom.cacheToggle.checked
  };
}

async function loadSelectedFormat() {
  if (state.busy) {
    return;
  }

  const options = commonOptions();
  const formatId = dom.formatSelect.value;
  const format = getFormat(formatId);

  setBusy(true, `正在测试 ${ format.label }…`);

  try {
    await runTextureTest(
      postWorker({
        action: 'loadBuiltin',
        formatId,
        cache: options.cache
      }),
      {
        title: format.label,
        formatId,
        source: { kind: 'builtin', name: `内置 ${ format.label }` }
      },
      {
        ...options,
        builtinReference: true
      }
    );
  } finally {
    setBusy(false);
  }
}

async function runAllFormats() {
  if (state.busy) {
    return;
  }

  const options = commonOptions();
  setBusy(true, '正在顺序对比全部格式…');
  log('开始顺序测试；每个纹理读回后立即删除 GPU 对象，避免峰值显存叠加');

  try {
    for (const format of COMPRESSED_FORMATS) {
      await runTextureTest(
        postWorker({
          action: 'loadBuiltin',
          formatId: format.id,
          cache: options.cache
        }),
        {
          title: format.label,
          formatId: format.id,
          source: { kind: 'builtin', name: `内置 ${ format.label }` }
        },
        {
          ...options,
          builtinReference: true,
          injectOom: false
        }
      );
    }
    log(`全部格式测试完成，PerformanceObserver 已记录 ${ state.observerEvents } 条 measure`);
  } finally {
    setBusy(false);
  }
}

async function loadRemoteUrl() {
  if (state.busy) {
    return;
  }

  const url = dom.textureUrl.value.trim();
  if (!url) {
    log('请输入远程 KTX URL', 'warning');
    return;
  }

  const options = commonOptions();
  setBusy(true, '正在加载远程 KTX…');

  try {
    await runTextureTest(
      postWorker({
        action: 'loadUrl',
        url,
        cache: options.cache
      }),
      {
        title: `远程 ${ new URL(url, location.href).pathname.split('/').pop() || url }`,
        source: { kind: 'remote', url }
      },
      {
        ...options,
        referenceImage: state.customFallbackImage
      }
    );
  } finally {
    setBusy(false);
  }
}

async function loadLocalKtxFile() {
  const file = dom.textureFile.files?.[0];
  if (!file || state.busy) {
    return;
  }

  const options = commonOptions();
  const fallbackFile = dom.fallbackFile.files?.[0];
  setBusy(true, `正在解析 ${ file.name }…`);

  try {
    const [buffer, referenceImage] = await Promise.all([
      file.arrayBuffer(),
      fallbackFile ? fileToImageData(fallbackFile) : Promise.resolve(null)
    ]);

    await runTextureTest(
      postWorker({
        action: 'loadFile',
        name: file.name,
        buffer
      }, [buffer]),
      {
        title: `本地 ${ file.name }`,
        source: { kind: 'file', name: file.name }
      },
      {
        ...options,
        referenceImage
      }
    );
  } catch (error) {
    log(`本地文件读取失败：${ error.message }`, 'error');
  } finally {
    setBusy(false);
  }
}

async function runCorruptDemo() {
  if (state.busy) {
    return;
  }

  setBusy(true, '正在演示解码失败…');

  try {
    const decodeFailure = Promise.reject({
        name: 'DecodeError',
        message: 'KTX 标识符不匹配或压缩数据长度不足'
      });
    decodeFailure.catch(() => {});

    await runTextureTest(
      decodeFailure,
      { title: '损坏 KTX 解码失败演示', source: { kind: 'demo' } },
      {
        ...commonOptions(),
        dimensions: { width: 64, height: 64 }
      }
    );
  } finally {
    setBusy(false);
  }
}

async function simulateCorsFailure() {
  if (state.busy) {
    return;
  }

  const url = 'https://nonexistent-cors.invalid/texture.ktx';
  dom.textureUrl.value = url;
  setBusy(true, '正在演示跨域失败…');

  try {
    await runTextureTest(
      postWorker({
        action: 'loadUrl',
        url,
        cache: false
      }),
      {
        title: '跨域纹理 CORS 失败演示',
        source: { kind: 'remote', url, crossOrigin: true }
      },
      {
        ...commonOptions(),
        cache: false,
        dimensions: { width: 64, height: 64 }
      }
    );
  } finally {
    setBusy(false);
  }
}

async function clearTextureCache() {
  const result = await clearCachedTextures();
  if (result.ok) {
    log('IndexedDB 纹理缓存已清空', 'success');
  } else {
    log(`IndexedDB 缓存清空失败：${ result.message }`, 'error');
  }
}

dom.runSelected.addEventListener('click', loadSelectedFormat);
dom.runAll.addEventListener('click', runAllFormats);
dom.loadUrl.addEventListener('click', loadRemoteUrl);
dom.textureFile.addEventListener('change', loadLocalKtxFile);
dom.loadCorrupt.addEventListener('click', runCorruptDemo);
dom.simulateCors.addEventListener('click', simulateCorsFailure);
dom.clearCache.addEventListener('click', clearTextureCache);

dom.fallbackFile.addEventListener('change', async () => {
  const file = dom.fallbackFile.files?.[0];
  if (!file) {
    state.customFallbackImage = null;
    return;
  }

  try {
    state.customFallbackImage = await fileToImageData(file);
    log(`未压缩对照图已载入：${ file.name }`, 'success');
  } catch (error) {
    state.customFallbackImage = null;
    log(`未压缩对照图解码失败：${ error.message }`, 'error');
  }
});
