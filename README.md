# 压缩纹理加载、检测与降级实验室

零依赖静态 Web 应用，用 WebGL、Canvas、Web Worker、PerformanceObserver 和 IndexedDB 验证 ETC、ETC2、ASTC、S3TC、PVRTC 压缩纹理。

## 运行

```bash
npm run start
```

然后打开 `http://127.0.0.1:8080/`。不要直接双击 HTML：ES Module Worker、IndexedDB 和跨域处理需要 HTTP 源。

检查：

```bash
npm run syntax
npm test
```

## 功能覆盖

- 格式检测：枚举 WebGL 扩展，并用最小合法纹理执行真实 `compressedTexImage2D` 上传探针；扩展存在但驱动拒绝时会判为不支持。
- 格式范围：S3TC DXT1/DXT5、ETC1、ETC2 RGB/RGBA、PVRTC 2/4bpp、ASTC 4×4、6×6、8×8。
- KTX v1：Worker 解析标识符、endianness、内部格式、尺寸、face/depth/array 限制、key/value 数据、mip 链、4 字节对齐和每层数据长度。
- 加载链路：Worker 中执行内置生成、远程 `fetch(cors)`、本地文件 ArrayBuffer 传输与 KTX 解析。
- IndexedDB：内置样例和远程纹理按 key 缓存，记录命中/写入/配额失败，可在页面清空。
- 指标量化：获取/生成、解析、GPU 上传、总耗时；压缩纹理与 RGBA 未压缩纹理的 mip 链理论显存、节省比例；FBO 读回后计算 RGB PSNR。
- 渲染质量：离屏 FBO 将压缩纹理渲染并读回，与参考图比较；预览同时显示压缩路径、未压缩路径和参考图。
- mipmap：内置非 PVRTC 样例包含完整 KTX mip 链；PVRTC v1 样例使用单层方形 POT；未压缩 RGBA 路径使用 `generateMipmap`，NPOT 自动关闭 mip 并提示。
- 降级：格式不支持、WebGL 不可用、驱动错误、显存不足、解码失败、跨域 CORS 失败时，释放 GPU 对象并回退到 Canvas/ImageData 生成的未压缩 RGBA 路径。
- 跨域：远程纹理强制 `mode: 'cors'`、`credentials: 'omit'`；失败信息明确提示配置 `Access-Control-Allow-Origin` 或使用同源/代理。

## 页面操作

- “加载所选格式”：测试下拉框中的单个内置格式。
- “顺序对比全部格式”：顺序加载、渲染、读回和删除纹理，避免多个 GPU 纹理同时驻留造成峰值叠加。
- “远程 KTX URL”：输入同源或带 CORS 的远程 `.ktx`。
- “本地 KTX 文件”：加载本地 KTX v1；可同时选择 PNG/JPEG/WebP 作为未压缩参考与降级图。
- “故障注入：模拟 GPU 显存不足”：跳过压缩上传并执行未压缩降级，用于验证 OOM UX。
- “解码失败演示 / 跨域失败演示”：直接验证错误提示和降级路径。

## 指标说明

- 显存为根据格式块大小、层级尺寸和 mip 链计算的 GPU 上传驻留估算，浏览器通常不向网页暴露精确驱动占用。
- DXT1 内置 16×16 样例是确定性棋盘压缩数据并提供参考图，因此 PSNR 可严格比较。
- ETC/ASTC/PVRTC 零块样例主要用于格式探测、KTX 解析、加载耗时和显存估算；没有外部编码器时不在浏览器中实现对应格式的 CPU 解码器。
- 远程真实纹理如需 PSNR，请同时提供同源或 CORS 授权的未压缩参考图；没有参考图时页面明确标记 PSNR 不可计算。

## 错误处理矩阵

| 场景 | 处理 |
| --- | --- |
| 扩展缺失或上传探针失败 | 标记不支持，不执行正式上传，直接未压缩降级 |
| KTX 魔数/尺寸/层级错误 | Worker 返回 `DecodeError`，页面提示并降级 |
| GPU `OUT_OF_MEMORY` | 捕获 GL 错误、删除纹理对象，记录 OOM 并降级 |
| WebGL 上下文不可用 | 显示能力检测错误，Canvas 2D 路径继续可用 |
| CORS 失败 | 不读取受污染像素，给出跨域头/代理修复建议并降级 |
| NPOT mipmap | WebGL1 下改为 clamp + linear，显示明确 warning |
| IndexedDB 配额或隐私模式失败 | 不阻断纹理加载，只标记缓存失败 |
