import { calculatePsnr } from './fallback.js';

export function referenceColorForFormat(format) {
  if (format?.family === 'ASTC' || format?.alpha) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }
  return { r: 0, g: 0, b: 0, a: 255 };
}

export function drawReferenceCanvas(canvas, width, height, color) {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(width, height);
  for (let offset = 0; offset < image.data.length; offset += 4) {
    image.data[offset] = color.r;
    image.data[offset + 1] = color.g;
    image.data[offset + 2] = color.b;
    image.data[offset + 3] = color.a;
  }
  ctx.putImageData(image, 0, 0);
  return ctx.getImageData(0, 0, width, height).data;
}

export function compareRenderedTexture(renderer, texture, decoded, canvas = document.createElement('canvas')) {
  renderer.render(texture);
  const actual = renderer.readPixels();
  const color = referenceColorForFormat(decoded.format);
  const expected = drawReferenceCanvas(canvas, renderer.canvas.width, renderer.canvas.height, color);
  return {
    psnr: calculatePsnr(actual, expected),
    color,
    sampleCount: actual.length / 4
  };
}

export function compareFallbackPixels(pixels, expectedColor = { r: 255, g: 72, b: 92, a: 255 }) {
  const expected = new Uint8Array(pixels.length);
  for (let offset = 0; offset < expected.length; offset += 4) {
    expected[offset] = expectedColor.r;
    expected[offset + 1] = expectedColor.g;
    expected[offset + 2] = expectedColor.b;
    expected[offset + 3] = expectedColor.a;
  }
  return calculatePsnr(pixels, expected);
}
