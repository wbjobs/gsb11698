# 压缩纹理兼容性实验室

一个零构建、零运行时依赖的 WebGL 示例，用于加载和对比 ETC1/ETC2、ASTC、S3TC/BC、PVRTC 压缩纹理，并在格式不支持、容器损坏、GPU 上传失败、显存压力或跨域读取失败时降级到未压缩 RGBA。

## 运行

```bash
npm start
# 打开 http://127.0.0.1:5173
```

开发机也可以用任意静态文件服务器运行；不要直接双击 `index.html`，因为 ES Module Worker 需要 HTTP(S) 来源。

## 覆盖能力

- 格式：S3TC DXT1/DXT3/DXT5、ETC1、ETC2 RGB/RGBA、PVRTC 2/4 bpp RGB/RGBA、14 种 ASTC block footprint。
- 容器：普通 2D、单面、KTX1 与 PVR v3；拒绝 3D、数组纹理和立方体贴图。
- 检测：同时检查 WebGL1/WebGL2 上下文、压缩扩展、`COMPRESSED_TEXTURE_FORMATS` 返回值和 `MAX_TEXTURE_SIZE`。
- 加载：主线程 `fetch`/File API，Web Worker 解析二进制，压缩层数据用 transferable 回传。
- 缓存：CORS 成功读取的 URL ArrayBuffer 存入 IndexedDB；本地文件和内存夹具不写缓存。
- 指标：PerformanceObserver/Performance marks 记录网络、解析、GPU 上传、降级和端到端耗时；按块尺寸和 mip 链估算 GPU 显存；WebGL 回读 Canvas 像素计算 PSNR。
- 渲染：压缩纹理优先 `compressedTexImage2D`；不支持或失败时上传客户端生成的 RGBA 诊断纹理。生产环境可将该诊断纹理替换为同源 PNG/WebP 或未压缩 KTX。
- mipmap：压缩格式只使用容器内已有 mip；mip 不完整时禁用 mip 过滤并提示，避免误称自动生成了压缩 mip。RGBA 降级会显式构造 mip 层；WebGL1 NPOT 自动限制为单级 CLAMP/LINEAR。
- OOM/驱动重置：检查 `OUT_OF_MEMORY` 和 `webglcontextlost`；压缩失败后尝试 RGBA，若仍失败给出 `FALLBACK_FAILED`。
- 跨域：使用 CORS 模式读取 ArrayBuffer；浏览器拦截、opaque 响应或 `arrayBuffer()` 读取失败时给出 CORS 修复提示。

## 页面使用

1. 打开后查看顶部支持矩阵。
2. 输入允许 CORS 的 `.ktx` 或 `.pvr` URL，或直接拖入本地文件。
3. 可勾选“强制使用未压缩 RGBA 降级”查看对照路径。
4. 点击“运行对照测试”使用内存合成夹具测试所有格式。夹具是全零 smoke texture，适合验证格式、尺寸、上传路径、错误路径和指标，不代表真实离线编码器画质。

## 指标口径

- 传输大小：KTX/PVR 文件或 ArrayBuffer 字节数；降级 RGBA 按 `width * height * 4` 统计。
- 估算显存：块压缩格式按 `ceil(width/blockW) * ceil(height/blockH) * blockBytes` 累加 mip；PVRTC 使用 2/4 bpp 和最小尺寸规则。
- PSNR：渲染目标尺寸回读后与合成夹具参考像素比较。真实素材应在离线管线中同时保留未压缩源或可信参考图，再计算 SSIM/PSNR。
- 真实 GPU 占用：WebGL 不提供可靠的驱动显存查询，页面中的值是可复核的存储估算，不包含对齐、驱动元数据和采样器开销。

## 测试

```bash
npm test
```

测试覆盖 KTX/PVR 往返、压缩块大小、PVRTC 最小尺寸、完整/非 2 次幂 mip、损坏容器和 RGBA mip 生成。
