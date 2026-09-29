export function measure(label, callback) {
  performance.mark(`${ label }-start`);

  try {
    const value = callback();
    performance.mark(`${ label }-end`);
    performance.measure(label, `${ label }-start`, `${ label }-end`);
    return { value, duration: performance.getEntriesByName(label, 'measure').at(-1)?.duration ?? 0 };
  } catch (error) {
    performance.mark(`${ label }-end`);
    performance.measure(label, `${ label }-start`, `${ label }-end`);
    throw error;
  }
}

export async function measureAsync(label, callback) {
  performance.mark(`${ label }-start`);

  try {
    const value = await callback();
    performance.mark(`${ label }-end`);
    performance.measure(label, `${ label }-start`, `${ label }-end`);
    return { value, duration: performance.getEntriesByName(label, 'measure').at(-1)?.duration ?? 0 };
  } catch (error) {
    performance.mark(`${ label }-end`);
    performance.measure(label, `${ label }-start`, `${ label }-end`);
    throw error;
  }
}

export function psnr(reference, rendered) {
  if (
    reference.width !== rendered.width ||
    reference.height !== rendered.height ||
    reference.data.length !== rendered.data.length
  ) {
    throw new Error('PSNR 输入尺寸不一致');
  }

  let squaredError = 0;
  let sampledChannels = 0;

  for (let index = 0; index < reference.data.length; index += 4) {
    squaredError += (reference.data[index] - rendered.data[index]) ** 2;
    squaredError += (reference.data[index + 1] - rendered.data[index + 1]) ** 2;
    squaredError += (reference.data[index + 2] - rendered.data[index + 2]) ** 2;
    sampledChannels += 3;
  }

  const mse = squaredError / sampledChannels;
  if (mse === 0) {
    return Number.POSITIVE_INFINITY;
  }

  return 10 * Math.log10((255 * 255) / mse);
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) {
    return '不可用';
  }

  if (bytes < 1024) {
    return `${ Math.round(bytes) } B`;
  }

  if (bytes < 1024 * 1024) {
    return `${ (bytes / 1024).toFixed(2) } KiB`;
  }

  return `${ (bytes / (1024 * 1024)).toFixed(2) } MiB`;
}

export function formatMilliseconds(value) {
  if (!Number.isFinite(value)) {
    return 'N/A';
  }

  return `${ value.toFixed(2) } ms`;
}

export function formatPsnr(value) {
  if (value === Number.POSITIVE_INFINITY) {
    return '∞ dB（一致）';
  }

  if (!Number.isFinite(value)) {
    return 'N/A';
  }

  return `${ value.toFixed(2) } dB`;
}

export function formatRatio(value) {
  if (!Number.isFinite(value)) {
    return 'N/A';
  }

  return `${ (value * 100).toFixed(1) }%`;
}

export function isCrossOriginUrl(url) {
  try {
    const target = new URL(url, self.location.href);
    return target.origin !== self.location.origin;
  } catch {
    return false;
  }
}

export function getPerformanceSummary() {
  const memory = performance.memory
    ? {
        used: performance.memory.usedJSHeapSize,
        total: performance.memory.totalJSHeapSize,
        limit: performance.memory.jsHeapSizeLimit
      }
    : null;

  return {
    timeOrigin: performance.timeOrigin,
    memory,
    measureCount: performance.getEntriesByType('measure').length
  };
}
