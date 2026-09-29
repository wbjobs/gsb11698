import { ERROR_CODES, TextureError } from './constants.js';

let nextId = 1;

export class TextureDecoderClient {
  constructor(workerUrl = new URL('./textureWorker.js', import.meta.url)) {
    this.workerUrl = workerUrl;
    this.pending = new Map();
    this.createWorker();
  }

  createWorker() {
    this.worker = new Worker(this.workerUrl, { type: 'module' });
    this.worker.onmessage = (event) => this.handleMessage(event.data);
    this.worker.onerror = (event) => {
      const error = new TextureError(ERROR_CODES.DECODE_FAILED, event.message || '纹理 Worker 崩溃');
      this.rejectAll(error);
      this.worker.terminate();
      this.createWorker();
    };
  }

  handleMessage(message) {
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (message.ok) pending.resolve(message);
    else pending.reject(new TextureError(message.error.code, message.error.message, message.error.details));
  }

  rejectAll(error) {
    for (const { reject } of this.pending.values()) reject(error);
    this.pending.clear();
  }

  decode(buffer, options = {}) {
    const id = nextId++;
    const workerBuffer = buffer.slice(0);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, buffer: workerBuffer, forceFallback: Boolean(options.forceFallback) }, [workerBuffer]);
    });
  }

  dispose() {
    this.rejectAll(new TextureError(ERROR_CODES.ABORTED, '纹理 Worker 已关闭'));
    this.worker.terminate();
  }
}
