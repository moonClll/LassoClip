# LassoClip 技术实施计划

## 当前基线

初始执行检查时仓库仅包含 PRD，没有 Git 元数据、源代码或依赖清单，因此本计划以空仓库初始化为前提，不覆盖既有实现。当前 PRD 位于 `docs/PRD.md`，并已建立本地 Git 仓库。运行环境为 Node 24.15、npm 11.12、pnpm 11.25；目标浏览器为支持 Manifest V3 的 Chromium。

## 技术决策

- **扩展运行时**：WXT 0.21 + Vite，输出 Chrome Manifest V3。Service Worker 只负责生命周期、截图权限和消息协调；Content Script 只在用户主动启动时创建覆盖层。
- **前端**：React 19 + TypeScript 严格模式。Popup 仅提供快速入口，不把编辑器塞进弹窗。
- **截图引擎**：`tabs.captureVisibleTab` 获取当前可见视口 PNG；Content Script 将其作为冻结图像显示，选区始终在冻结图像上绘制。这样页面滚动、动画和悬浮菜单变化不会改变已显示的像素。
- **坐标系统**：交互坐标统一为 viewport CSS px；截图像素通过 `imageWidth / viewportCssWidth` 和 `imageHeight / viewportCssHeight` 分别映射。该比例同时覆盖 DPR、浏览器页面缩放和截图尺寸差异，禁止直接假设比例等于 `devicePixelRatio`。
- **DOM 吸附**：覆盖层临时关闭 pointer-events 后调用 `document.elementFromPoint`，读取目标 `getBoundingClientRect()`；对视口外边界做裁剪，并以目标元素签名抑制父子节点抖动。首期支持 img、svg、表格、常见文本/卡片容器。
- **裁剪**：Canvas 2D 在源截图像素坐标中建立闭合 Path，先按路径 bounds 创建最小输出画布，再 `ctx.clip()` 和 `drawImage()`。Canvas 原生边缘抗锯齿保留；路径外像素保持透明 Alpha 0。矩形、椭圆、自由手绘和多边形均通过同一适配器处理。
- **输出**：默认 `image/png`。Content Script 生成 Blob，尝试通过 `ClipboardItem` 写入系统剪贴板；同时把 Blob 与来源/选区元数据发给扩展 Service Worker。剪贴板失败会显示明确错误，不影响本地结果。
- **持久化边界**：Phase 1 建立可复用的 IndexedDB ClipStore 接口并保存成功剪藏，后续 Phase 3 在其上增加 Library UI；不把图片塞进 `chrome.storage.sync`。
- **权限**：仅申请 `activeTab`、`scripting`、`storage`、`contextMenus`、`clipboardWrite`。截图只由用户动作触发；受保护页面无法注入时给出降级错误。

## 模块与目录

```text
entrypoints/
  background.ts              # MV3 service worker、快捷键、右键菜单、captureVisibleTab
  content.ts                 # 页面侧截图入口与 CaptureOverlay 生命周期
  popup/index.html
  popup/main.tsx             # React 快速入口
src/
  components/popup/          # 轻量入口 UI
  modules/capture/           # 捕获协调、选择模型与 DOM 吸附
  modules/selection/         # 选择几何、坐标映射、边界
  modules/image-processing/  # Canvas 裁剪、Alpha、Blob 输出
  modules/storage/           # IndexedDB ClipStore 与迁移版本
  services/clipboard/        # ClipboardItem 适配
  types/                     # ClipItem、选择和消息类型
  styles/                    # Popup 与覆盖层样式
tests/                       # 坐标、几何、Alpha 核心单测
```

## 开发顺序与验收

### Phase 0：工程初始化（本次完成）

1. 建立 WXT + React + TypeScript 工程和严格编译配置。
2. 配置 MV3 manifest、最小权限、Popup、Background、Content Script。
3. 建立共享类型、模块边界、构建和测试脚本。
4. 提供可安装的扩展构建产物和开发说明。

验收：`npm run compile`、`npm test`、`npm run build` 全部通过，输出 `.output/chrome-mv3` 可在 Chrome 的“加载已解压扩展”中安装。

### Phase 1：截图核心（本次完成）

1. Background 捕获当前可见区域并把冻结 PNG 发给 Content Script。
2. Overlay 提供 rectangle、ellipse、freehand、polygon、element 五种模式、确认/取消和重绘。
3. DOM 元素高亮使用 `elementFromPoint` + `getBoundingClientRect`，支持移动与右下控制点调整。
4. 提供冻结图像放大镜、十字坐标辅助线、Arrow/Shift+Arrow 微调和 Shift 等比例几何选区。
5. 通过独立的坐标映射模块处理 DPR、页面缩放、滚动后的 viewport 坐标和图片像素。
6. Canvas Path 执行真实透明 Alpha 裁剪，生成 PNG Blob；尝试复制到剪贴板并保存 ClipItem。
7. 用纯函数和 Canvas 适配器测试坐标、bounds、椭圆/多边形 mask、平滑路径和 Alpha 结果；浏览器内手工验收覆盖层。

验收：普通网页可启动冻结截图；四种几何模式产生真实图像；不规则路径外 Alpha 为 0；DOM 元素可吸附；复制失败有反馈；`npm run compile`、`npm test`、`npm run build` 全部通过。

### Phase 2（不在本次范围）

Clip Studio 多素材画布、图层、自动排版、标注、遮挡和撤销重做。

### Phase 3 及以后（不在本次范围）

Clip Library UI、OCR、标签/收藏夹、JPG/WebP/PDF/Markdown 和分享能力。

## 关键难点与处理

1. **截图像素与 CSS 坐标不一致**：不使用固定 DPR，使用截图实际 naturalWidth/viewport CSS 宽高的独立 X/Y 比例；所有测试覆盖 1x、1.25x、2x 和缩放后的非整数比例。
2. **透明边缘**：路径在源像素坐标中闭合，使用 Canvas clip 的抗锯齿；输出 bounds 向外取整，避免裁掉边缘像素。
3. **DOM 吸附抖动**：对候选元素保存稳定签名，优先最近的叶子内容节点；只有签名变化或边界变化超过阈值时才刷新高亮。
4. **页面事件污染**：覆盖层使用固定定位和最高层级，事件在捕获阶段拦截；退出时移除节点、监听器和 object URL。
5. **受保护页面/跨域内容**：`captureVisibleTab` 仍可得到用户可见像素，但无法注入脚本的页面显示可操作错误；不声称能够修改或读取跨域 iframe 内部 DOM。
6. **大图资源**：首期只处理当前可见视口；按 bounds 创建最小输出 Canvas，失败时捕获异常并提示，避免把整页/原图长期缓存。

## 测试方案

- **单元测试**：坐标映射可逆性、CSS Rect 到图片 Rect 的边界裁剪、路径 bounds、椭圆和多边形 mask、Alpha 应用。
- **浏览器集成验收**：在普通 HTML 页面、不同 `devicePixelRatio`/页面缩放、滚动位置和包含图片/文字/卡片的页面中手工检查冻结、吸附、确认、取消、复制和透明像素。
- **回归门禁**：每个 Phase 必须先通过 `npm run compile`、`npm test`、`npm run build`，再报告已完成项、测试结果和遗留问题。

## 风险记录

- Chrome 对 `chrome://`、Web Store 等页面禁止 Content Script；实现会显示明确的“当前页面不支持”反馈。
- 剪贴板 API 可能受浏览器焦点或权限策略拒绝；PNG 结果仍返回并显示“复制失败，可重试”。
- 页面捕获图像与 CSS 视口在某些浏览器窗口缩放组合下可能出现非整数比例，因此所有几何计算使用浮点坐标，最后只在输出 Canvas bounds 取整。
