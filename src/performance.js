export function createPerformanceCollector() {
  const entries = [];
  let observer = null;
  if (typeof PerformanceObserver !== 'undefined' && typeof performance !== 'undefined') {
    observer = new PerformanceObserver((list) => {
      entries.push(...list.getEntries());
    });
    try {
      observer.observe({ entryTypes: ['measure', 'resource', 'longtask'] });
    } catch {
      observer.observe({ type: 'measure', buffered: true });
    }
  }

  return {
    entries,
    disconnect() {
      observer?.disconnect();
    },
    getEntries(name) {
      return entries.filter((entry) => entry.name === name);
    },
    summarize(name) {
      const matches = entries.filter((entry) => entry.name === name);
      if (!matches.length) return null;
      const durations = matches.map((entry) => entry.duration);
      return {
        count: matches.length,
        total: durations.reduce((sum, value) => sum + value, 0),
        average: durations.reduce((sum, value) => sum + value, 0) / durations.length,
        min: Math.min(...durations),
        max: Math.max(...durations)
      };
    }
  };
}

export function measure(callback, name) {
  const started = performance.now();
  performance.mark(`${name}:start`);
  try {
    const result = callback();
    performance.mark(`${name}:end`);
    performance.measure(name, `${name}:start`, `${name}:end`);
    return { result, duration: performance.now() - started };
  } catch (error) {
    performance.mark(`${name}:error`);
    performance.measure(name, `${name}:start`, `${name}:error`);
    throw error;
  }
}

export async function measureAsync(callback, name) {
  const started = performance.now();
  performance.mark(`${name}:start`);
  try {
    const result = await callback();
    performance.mark(`${name}:end`);
    performance.measure(name, `${name}:start`, `${name}:end`);
    return { result, duration: performance.now() - started };
  } catch (error) {
    performance.mark(`${name}:error`);
    performance.measure(name, `${name}:start`, `${name}:error`);
    throw error;
  }
}

export function markRange(name, started, ended = performance.now()) {
  const startMark = `${name}:${started}:start`;
  const endMark = `${name}:${started}:end`;
  performance.mark(startMark, { startTime: started });
  performance.mark(endMark, { startTime: ended });
  performance.measure(name, startMark, endMark);
  return ended - started;
}
