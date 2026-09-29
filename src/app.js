import { createPerformanceCollector } from './performance.js';
import { cacheClear, cacheStats } from './cache.js';
import { runBenchmark } from './benchmark.js';
import { ERROR_CODES } from './constants.js';
import { formatBytes, formatMs, formatPsnr } from './fallback.js';
import { fetchTextureBuffer, readFileBuffer } from './network.js';
import { expectedMipLevelCount } from './parsers.js';
import { compareRenderedTexture } from './quality.js';
import { TextureRenderer } from './renderer.js';
import { detectWebGLSupport } from './support.js';
import { TextureDecoderClient } from './workerClient.js';

const $ = (selector) => document.querySelector(selector);
const environment = $('#environment');
const supportGrid = $('#supportGrid');
const detectionSummary = $('#detectionSummary');
const message = $('#message');
const benchmarkBody = $('#benchmarkBody');
const textureMetrics = $('#textureMetrics');
const canvas = $('#renderCanvas');

let support;
let renderer;
let decoder;
let latestResult = null;
const performanceCollector = createPerformanceCollector();

function showMessage(kind, text, details) {
  message.className = `message ${kind}`;
  message.innerHTML = `<strong>${escapeHtml(text)}</strong>${details ? `<br><small>${escapeHtml(details)}</small>` : ''}`;
}

function clearMessage() {
  message.className = 'message hidden';
  message.textContent = '';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function metric(label, value) {
  return `<dt>${escapeHtml(label)}</dt><dd>${value}</dd>`;
}

function renderSupportCards() {
  const groups = new Map();
  for (const item of Object.values(support.formats)) {
    if (!groups.has(item.family)) groups.set(item.family, []);
    groups.get(item.family).push(item);
  }
  supportGrid.innerHTML = '';
  for (const [family, formats] of groups) {
    const card = document.createElement('div');
    card.className = 'support-card';
    const enabled = formats.filter((item) => item.supported).length;
    card.innerHTML = `
      <strong>${escapeHtml(family)}<span class="badge ${enabled ? 'ok' : 'no'}">${enabled}/${formats.length}</span></strong>
      <small>${formats.map((item) => `${escapeHtml(item.label)}: ${item.supported ? '✓' : '—'}`).join('<br>')}</small>
    `;
    supportGrid.appendChild(card);
  }
  detectionSummary.textContent = `${support.supportedFormatIds.length}/${Object.keys(support.formats).length} 个内部格式可上传`;
}

function renderBenchmarkRow(result) {
  const row = document.createElement('tr');
  row.className = result.fallback ? 'fallback' : result.ok ? '' : 'error-row';
  const warningStatuses = ['unsupported', 'fallback', ERROR_CODES.UNSUPPORTED_FORMAT, ERROR_CODES.MIPMAP_INCOMPLETE];
  const statusClass = result.ok ? 'ok' : warningStatuses.includes(result.status) ? 'warn' : 'error';
  const statusText = result.ok
    ? result.mode === 'compressed'
      ? '压缩格式加载'
      : '未压缩降级'
    : statusLabel(result.status);
  row.innerHTML = `
    <td>${escapeHtml(result.format.label)}<br><small>${escapeHtml(result.formatId)}</small></td>
    <td>${result.formatId === 'INVALID' ? '—' : (support.formats[result.formatId]?.supported ? '支持' : '不支持')}</td>
    <td><span class="status-dot ${statusClass}"></span>${statusText}</td>
    <td>${formatMs(result.networkMs)}</td>
    <td>${formatMs(result.parseMs)}</td>
    <td>${formatMs(result.uploadMs)}</td>
    <td>${formatMs(result.totalMs)}</td>
    <td>${formatBytes(result.transferBytes)}</td>
    <td>${formatBytes(result.estimatedVram)}</td>
    <td>${formatPsnr(result.psnr)}</td>
    <td>${escapeHtml(result.source)}${result.mipmapWarning ? `<br><small>${escapeHtml(result.mipmapWarning)}</small>` : ''}${result.error ? `<br><small>${escapeHtml(result.error.message || result.error.code)}</small>` : ''}</td>
  `;
  benchmarkBody.appendChild(row);
}

function statusLabel(status) {
  return {
    [ERROR_CODES.UNSUPPORTED_FORMAT]: '格式不支持，已/可降级',
    [ERROR_CODES.DECODE_FAILED]: '解码失败',
    [ERROR_CODES.INVALID_CONTAINER]: '容器损坏',
    [ERROR_CODES.CORS_FAILED]: 'CORS 被拦截',
    [ERROR_CODES.OUT_OF_MEMORY]: 'GPU 显存不足',
    [ERROR_CODES.GPU_UPLOAD_FAILED]: 'GPU 上传失败',
    [ERROR_CODES.MIPMAP_INCOMPLETE]: 'mipmap 不完整',
    [ERROR_CODES.FALLBACK_FAILED]: 'RGBA 降级也失败'
  }[status] || status;
}

async function handleTextureSource(source, kind, options = {}) {
  clearMessage();
  let fetchResult;
  const started = performance.now();
  try {
    fetchResult = kind === 'file'
      ? await readFileBuffer(source)
      : await fetchTextureBuffer(source, options);
    const workerStarted = performance.now();
    const decodedMessage = options.forceFallback
      ? await decoder.decode(fetchResult.buffer, { forceFallback: true })
      : await decoder.decode(fetchResult.buffer);
    const decoded = decodedMessage.texture;
    const loadOptions = options.forceFallback
      ? {
        forceFallback: true,
        fallbackReason: 'forced',
        fallbackImage: {
          width: decoded.width,
          height: decoded.height,
          pixels: decodedMessage.fallback.pixels,
          mipLevels: decodedMessage.fallback.mipLevels,
          levels: decodedMessage.fallback.levels
        }
      }
      : {};

    const loadResult = renderer.loadWithFallback(decoded, support, loadOptions);
    const quality = loadResult.usedCompressed ? compareRenderedTexture(renderer, loadResult.texture, decoded) : null;
    latestResult = {
      fetchResult,
      decoded,
      decodedMessage,
      loadResult,
      quality,
      totalMs: performance.now() - started,
      workerWaitMs: performance.now() - workerStarted
    };
    renderLatestMetrics();

    if (loadResult.usedCompressed) {
      showMessage('info', `${decoded.format.label} 已通过压缩路径上传。`, fetchResult.fromCache ? 'ArrayBuffer 来自 IndexedDB 缓存。' : null);
    } else {
      const reason = {
        forced: '用户强制',
        unsupported: '格式不支持',
        'upload-failed': 'GPU 上传失败',
        'out-of-memory': 'GPU 显存不足',
        benchmark: '基准对照',
        decode: '解码或上传失败'
      }[loadResult.fallbackReason] || loadResult.fallbackReason;
      showMessage('warn', `已降级到未压缩 RGBA：${reason}。`, loadResult.compressedError?.message || '降级数据为客户端 Canvas 生成的诊断纹理；生产环境可改为同源 RGBA PNG/WebP/KTX。');
    }
  } catch (error) {
    console.error(error);
    const hint = error.code === ERROR_CODES.CORS_FAILED
      ? '处理方式：资源服务增加 Access-Control-Allow-Origin；不要使用 no-cors；或通过同源代理/本地文件加载。'
      : error.code === ERROR_CODES.INVALID_CONTAINER
        ? '已阻止损坏数据上传 GPU，避免驱动级失败。'
        : '请检查容器格式、内部格式枚举、宽高、mipmap 层级和数据长度。';
    showMessage('error', `${statusLabel(error.code) || '加载失败'}：${error.message}`, hint);
    renderErrorMetrics(error, fetchResult, performance.now() - started);
  }
}

function renderLatestMetrics() {
  const { fetchResult, decoded, decodedMessage, loadResult, quality, totalMs } = latestResult;
  const rows = [
    metric('来源', `${escapeHtml(fetchResult.source)}${fetchResult.fromCache ? '（IndexedDB）' : ''}${fetchResult.localFile ? '（本地文件）' : ''}`),
    metric('容器/格式', `${escapeHtml(decoded.container)} · ${escapeHtml(decoded.format.label)}`),
    metric('尺寸', `${decoded.width} × ${decoded.height}，${decoded.levels.length} / ${expectedMipLevelCount(decoded.width, decoded.height)} mip`),
    metric('浏览器支持', support.formats[decoded.formatId]?.supported ? '支持压缩上传' : '不支持，已降级'),
    metric('网络/读取', `${formatMs(fetchResult.networkMs)} · ${fetchResult.fromCache ? '缓存命中' : formatBytes(fetchResult.buffer.byteLength)}`),
    metric('Worker 解析', formatMs(decodedMessage.timings.parseMs)),
    metric('GPU 上传', formatMs(loadResult.uploadMs)),
    metric('端到端', formatMs(totalMs)),
    metric('传输大小', formatBytes(fetchResult.buffer.byteLength)),
    metric('估算显存', loadResult.usedCompressed ? formatBytes(decoded.estimatedFullVram) : formatBytes(loadResult.estimatedVram)),
    metric('mipmap', loadResult.mipmapsEnabled ? '已启用' : '已禁用/单级'),
    metric('渲染质量', loadResult.usedCompressed ? formatPsnr(quality?.psnr) : '诊断降级图；未与真实未压缩原图比较')
  ];
  textureMetrics.innerHTML = rows.join('');
}

function renderErrorMetrics(error, fetchResult, totalMs) {
  textureMetrics.innerHTML = [
    metric('状态', statusLabel(error.code) || '失败'),
    metric('错误码', `<code>${escapeHtml(error.code)}</code>`),
    metric('消息', escapeHtml(error.message)),
    metric('下载大小', fetchResult ? formatBytes(fetchResult.buffer.byteLength) : '不可用'),
    metric('耗时', formatMs(totalMs)),
    metric('处理', '已停止 GPU 上传；界面保持上一张可用纹理。')
  ].join('');
}

async function main() {
  try {
    renderer = new TextureRenderer(canvas);
    support = detectWebGLSupport(renderer.gl);
    decoder = new TextureDecoderClient();
    environment.textContent = `${support.context} · ${support.renderer} · MAX_TEXTURE_SIZE=${support.maxTextureSize} · ${support.supportedFormatIds.length} 个压缩内部格式可用`;
    renderSupportCards();
    showMessage('info', '检测完成。可拖入 KTX1/PVR v3 文件，或运行内置合成夹具基准。');
  } catch (error) {
    showMessage('error', `WebGL 初始化失败：${error.message}`, '压缩纹理需要 WebGL；本页仍展示代码，但无法完成上传和渲染验证。');
    $('#runBenchmark').disabled = true;
    return;
  }

  $('#loadForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const url = $('#textureUrl').value.trim();
    if (!url) {
      showMessage('warn', '请输入纹理 URL，或拖入本地 KTX/PVR 文件。');
      return;
    }
    handleTextureSource(url, 'url', { useCache: $('#useCache').checked, forceFallback: $('#forceFallback').checked });
  });

  const fileInput = $('#fileInput');
  const dropZone = $('#dropZone');
  $('#chooseFile').addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') fileInput.click();
  });
  dropZone.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropZone.classList.add('drag');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag'));
  dropZone.addEventListener('drop', (event) => {
    event.preventDefault();
    dropZone.classList.remove('drag');
    const file = event.dataTransfer.files?.[0];
    if (file) handleTextureSource(file, 'file', { forceFallback: $('#forceFallback').checked });
  });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) handleTextureSource(file, 'file', { forceFallback: $('#forceFallback').checked });
  });

  $('#runBenchmark').addEventListener('click', async (event) => {
    event.currentTarget.disabled = true;
    benchmarkBody.innerHTML = '';
    showMessage('info', '基准运行中：每项解析后立即上传、读取并释放纹理，避免显存累积。');
    const started = performance.now();
    try {
      await runBenchmark({
        support,
        decoder,
        renderer,
        onResult: renderBenchmarkRow
      });
      const stats = await cacheStats();
      showMessage('info', `基准完成，总耗时 ${formatMs(performance.now() - started)}。`, `PerformanceObserver 已记录 ${performanceCollector.entries.length} 条性能条目；IndexedDB 当前缓存 ${stats.count} 个 URL 纹理。`);
    } catch (error) {
      console.error(error);
      showMessage('error', `基准失败：${error.message}`);
    } finally {
      event.currentTarget.disabled = false;
    }
  });

  $('#clearCache').addEventListener('click', async () => {
    try {
      await cacheClear();
      showMessage('info', 'IndexedDB 纹理缓存已清空。');
    } catch (error) {
      showMessage('error', `清空缓存失败：${error.message}`);
    }
  });
}

main();
