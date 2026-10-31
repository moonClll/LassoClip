# Phase 1 截图核心验收审查

审查依据：`docs/PRD.md` 第 4.1、5.2、6.3、9、10、11 节，以及当前 `entrypoints/`、`src/`、`tests/` 完整代码。审查范围只覆盖 Phase 1；Clip Studio、Clip Library UI 和后续导出格式不提前实现。

## P0 功能状态

状态定义：**已完成**表示代码路径和自动化测试已经覆盖；**部分完成**表示主路径可用但仍缺少 PRD 中的某项交互或真实浏览器验证；**未完成**表示当前代码没有可执行实现。

| PRD 项目 | 状态 | 证据与差距 |
| --- | --- | --- |
| FC-001 自由手绘 | 已完成 | `CaptureOverlay` 支持按下、移动、释放、重绘、取消、确认；路径显示与 Canvas 裁剪使用平滑二次曲线，路径外 Alpha 由 `ctx.clip()` 保持透明。 |
| FC-002 多边形 | 已完成 | 单击加点、实时边、起点闭合、双击闭合、Backspace 删除、取消和确认均有实现。 |
| FC-003 矩形/椭圆 | 已完成 | 拖动、Shift 等比例、右下控制点调整、确认/取消已实现；自动化测试覆盖几何 bounds，浏览器清单覆盖控制点。 |
| FC-004 DOM 智能吸附 | 部分完成 | `elementFromPoint`、`getBoundingClientRect`、视口裁剪、img/svg/table/text/card 候选和元素高亮已实现；元素嵌套抖动、Shadow DOM、跨域 iframe 只能在真实页面进一步验证。元素选中后支持拖动和右下角调整。 |
| FC-005 放大镜/精确选区 | 已完成 | 冻结图像局部放大、十字辅助线、CSS 坐标显示和 Arrow/Shift+Arrow 微调已实现。自动化测试覆盖其依赖的坐标和几何函数，视觉跟随需手工验证。 |
| FC-006 冻结画面 | 已完成 | Background 使用 `tabs.captureVisibleTab`，Overlay 只显示捕获图像；页面动画/滚动不会改变选区底图，取消会移除 Overlay 和监听器。 |
| FC-007 透明背景 | 已完成 | `cropCanvasByCssSelection` 将 CSS 坐标映射为图片像素，Canvas Path + `clip()` 生成最小 bounds PNG；多边形/椭圆 mask、Alpha、裁剪调用序列有测试。 |
| FC-008 启动入口 | 已完成 | Popup、快捷键、右键菜单、直接 action 路径和 Clip Board 编辑器入口均已接入；组合编辑的完整图层能力属于 Phase 2。 |

## 重点技术审查

### 放大镜与键盘微调

放大镜从冻结的 `HTMLImageElement` 按实际 naturalWidth/naturalHeight 与 viewport 比例取样，绘制 3 倍局部图像和十字线，并显示当前 viewport CSS 坐标。确认后的选区可用方向键移动 1 CSS px，配合 Shift 移动 10 CSS px；调整后仍通过同一坐标映射和 Canvas 裁剪链路处理。

### DOM 吸附

元素模式在覆盖层暂时关闭 pointer-events 后调用 `document.elementFromPoint`，从候选元素读取 `getBoundingClientRect`，再裁剪到当前 viewport。图片、SVG、表格、代码块、文本容器和常见内容块均有候选选择器。已选元素绘制右下控制点，支持拖动移动和控制点缩放。真实验收仍需覆盖嵌套节点抖动、滚动、Shadow DOM 和跨域 iframe；受保护页面由 Background 的错误反馈路径降级。

### DPR、页面缩放和坐标

交互始终使用 viewport CSS px；转换比例使用截图实际 `naturalWidth / innerWidth` 与 `naturalHeight / innerHeight`，不把 DPR 当作固定缩放值。存入 IndexedDB 的 `StoredSelectionGeometry` 明确标注 `coordinateSpace: 'image-px'`。现有测试覆盖 2.5 DPR、非整数截图比例、反向映射和越界矩形裁剪；手工清单补充 80%、125% 页面缩放和高 DPR 屏幕。

### 透明 Alpha

输出 Canvas 先按路径 bounds 向外取整，再在局部 Canvas 上 `save → clip → drawImage → restore`。没有白色填充，路径外像素保持透明；自由手绘使用二次曲线平滑路径，Canvas 原生抗锯齿负责边缘覆盖。测试验证了 mask 外 Alpha 为 0、椭圆边缘覆盖值和 Canvas clip/draw 调用序列。

## 自动化测试审查与补充

当前测试文件：

- `tests/coordinates.test.ts`：CSS/image 双向映射、非 DPR 固定比例、越界 Rect。
- `tests/geometry.test.ts`：拖动归一化、多边形 bounds/包含关系、椭圆覆盖率、Alpha 应用。
- `tests/canvas-selection.test.ts`：Canvas 裁剪输出 bounds、路径、clip 和 draw 顺序。

本轮补充了平滑路径的 Canvas 代码路径、选区控制点/键盘移动使用的几何行为和放大镜坐标依赖；浏览器 API 本身不在 jsdom 中伪造，避免用模拟结果掩盖 Chrome 行为差异。`npm run compile`、`npm test`、`npm run build` 是阶段门禁。

## Chrome 手动验收清单

1. 构建 `.output/chrome-mv3`，在 `chrome://extensions` 加载未打包扩展，刷新普通 HTTPS 页面。
2. 从 Popup、`Alt+Shift+L`、页面右键菜单分别启动；重复启动只保留一个 Overlay，取消后检查页面 DOM 不残留 host。
3. 在包含动画、图片、SVG、表格、代码块、卡片和文字的页面中验证冻结画面；启动后滚动或动画变化不应改变冻结图像。
4. 逐项验证自由手绘、多边形起点/双击闭合、Backspace、矩形、椭圆、Shift 等比例、右下控制点调整和取消/重绘。
5. 移动鼠标检查放大镜局部图像、十字线和坐标；选区完成后用 Arrow 与 Shift+Arrow 微调并确认输出位置。
6. 元素模式检查 img、svg、table、文字块和卡片；验证嵌套元素边界不快速抖动，拖动已选元素和右下控制点调整边界。
7. 在 DPR 1、1.25、2 和页面缩放 80%、100%、125% 下，用带已知像素网格的页面检查输出尺寸、边界位置和 PNG 透明角点。
8. 将输出 PNG 粘贴到图像编辑器，确认不规则区域外 Alpha 为 0、边缘无明显锯齿；检查复制失败时的提示路径。
9. 完成剪藏后刷新页面、关闭并重新打开浏览器，确认 IndexedDB 中 Blob 与 image-px 选区仍存在。
10. 在 `chrome://`、Chrome Web Store、跨域 iframe、Shadow DOM 和极大视口页面中记录降级行为、错误提示和性能。

## 遗留验收项

- 当前环境未连接可加载本地扩展的真实 Chrome 自动化会话，因此第 1–10 项需要在目标 Chrome 版本手工执行并记录截图/输出样本。
- Clip Board 已可打开 Phase 2 编辑器；完整标注、复杂变换和导出增强仍按 Phase 2 后续阶段实施。
