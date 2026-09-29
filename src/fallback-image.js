export function loadImageToImageData(url, { crossOrigin = 'anonymous' } = {}) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    if (crossOrigin) {
      image.crossOrigin = crossOrigin;
    }

    image.onload = async () => {
      try {
        if ('createImageBitmap' in self && 'OffscreenCanvas' in self) {
          const bitmap = await createImageBitmap(image);
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
          const context = canvas.getContext('2d');
          if (!context) {
            throw new Error('无法创建 Canvas 2D 上下文');
          }
          context.drawImage(bitmap, 0, 0);
          resolve(context.getImageData(0, 0, bitmap.width, bitmap.height));
          return;
        }

        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('无法创建 Canvas 2D 上下文');
        }
        context.drawImage(image, 0, 0);
        resolve(context.getImageData(0, 0, canvas.width, canvas.height));
      } catch (error) {
        if (error.name === 'SecurityError') {
          const securityError = new Error('跨域图片未授权：图片服务器需要返回 Access-Control-Allow-Origin');
          securityError.name = 'CrossOriginTextureError';
          reject(securityError);
          return;
        }
        reject(error);
      }
    };

    image.onerror = () => {
      const error = new Error(`图片加载失败：${ url }`);
      error.name = 'ImageDecodeError';
      reject(error);
    };

    image.src = url;
  });
}

export function fileToImageData(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);

    loadImageToImageData(url, { crossOrigin: null })
      .then((imageData) => {
        URL.revokeObjectURL(url);
        resolve(imageData);
      })
      .catch((error) => {
        URL.revokeObjectURL(url);
        reject(error);
      });
  });
}

function createCanvas(width, height) {
  if ('OffscreenCanvas' in self) {
    return new OffscreenCanvas(width, height);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function createFallbackImageData(width, height, reason, title = '未压缩降级') {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');

  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#f97316');
  gradient.addColorStop(1, '#0ea5e9');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  context.strokeStyle = 'rgba(255,255,255,0.45)';
  context.lineWidth = Math.max(1, width / 128);

  for (let offset = -height; offset < width; offset += Math.max(8, width / 8)) {
    context.beginPath();
    context.moveTo(offset, 0);
    context.lineTo(offset + height, height);
    context.stroke();
  }

  context.fillStyle = 'rgba(0,0,0,0.48)';
  context.fillRect(width * 0.06, height * 0.08, width * 0.88, height * 0.28);
  context.fillStyle = '#ffffff';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = `${ Math.max(10, Math.floor(height * 0.09)) }px system-ui, sans-serif`;
  context.fillText(title, width / 2, height * 0.17);
  context.font = `${ Math.max(8, Math.floor(height * 0.055)) }px system-ui, sans-serif`;
  context.fillText(reason.slice(0, 28), width / 2, height * 0.28);

  return context.getImageData(0, 0, width, height);
}
