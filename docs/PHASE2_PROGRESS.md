# Phase 2 开发进度

本轮完成 Phase 2.1（数据模型与持久化）、Phase 2.2（Clip Studio 编辑器框架）、Phase 2.3（画布交互完善）和 Phase 2.4（标注与视觉编辑系统）。未提前实现 OCR、标签或 AI 能力。

## 已完成内容

### Phase 2.1：数据模型与持久化

- 新增 `src/types/editor.ts`，定义 `ClipProject`、`CanvasItem`、`ImageCanvasItem`、`TextCanvasItem`、`Annotation`、画布背景、变换和样式类型。
- `ClipProject.items` 只保存 `clipId`，不会复制 `ClipItemRecord.imageBlob`。
- IndexedDB 从 v1 升级到 v2，保留原有 `clips` object store，并新增 `projects` object store 和 `updatedAt` 索引。
- 新增项目创建、读取、列表、更新、删除和 `loadProjectWithClips` 关联读取。
- 保存项目时在同一事务中验证所有 image item 的 ClipItem 引用；缺失引用会抛出 `ProjectReferenceError` 并回滚项目写入。
- 数据库连接在 `versionchange` 时关闭，迁移被其他窗口阻塞时给出可读错误。
- 现有 ClipItem Blob 数据保持在 `clips` store；项目删除不会删除素材。

关键文件：

- [src/types/editor.ts](../src/types/editor.ts)
- [src/modules/storage/clipStore.ts](../src/modules/storage/clipStore.ts)
- [tests/project-store.test.ts](../tests/project-store.test.ts)

### Phase 2.2：Clip Studio 编辑器框架

- 新增独立 WXT Editor 页面：`editor.html`。
- Popup 的 Clip Board 按钮已接入 Background，打开独立 Clip Studio 页面。
- Editor 启动时读取 URL 项目 ID；没有项目时创建默认项目并持久化。
- 支持在项目下拉菜单中打开已有项目、创建新项目。
- 左栏显示真实 IndexedDB ClipItem 素材列表和项目图层列表；没有素材时显示空状态。
- 中央使用 `react-konva` Stage 显示真实 Blob 图片素材，支持选择、拖动和选区反馈。
- 右侧属性面板支持选中对象的 x/y/宽/高/旋转/透明度编辑。
- 顶部支持撤销、重做、自动排版、自动/自由布局切换、背景颜色、PNG 导出入口和保存状态。
- Zustand 管理项目、素材、选择、历史和错误状态；项目变更以 500ms debounce 写入 IndexedDB。
- 自动排版使用确定性行流算法，不依赖模拟数据或远程服务。

关键文件：

- [entrypoints/editor/index.html](../entrypoints/editor/index.html)
- [entrypoints/editor/main.tsx](../entrypoints/editor/main.tsx)
- [src/components/editor/EditorShell.tsx](../src/components/editor/EditorShell.tsx)
- [src/components/editor/StudioViewport.tsx](../src/components/editor/StudioViewport.tsx)
- [src/stores/editorStore.ts](../src/stores/editorStore.ts)
- [src/modules/canvas-editor/autoLayout.ts](../src/modules/canvas-editor/autoLayout.ts)
- [src/styles/editor.css](../src/styles/editor.css)

## 验证结果

- `npm run compile`：通过。
- `npm test`：通过，5 个测试文件、18 个测试。
- `npm run build`：通过，生成 `.output/chrome-mv3/editor.html`、Popup、Background、Content Script 和 Editor bundle。
- 数据层测试覆盖：v1 → v2 迁移、原有 ClipItem 字段保留、项目 CRUD、项目与 ClipItem 关联、缺失引用回滚。
- 自动布局测试覆盖：确定性、换行避免重叠、超宽素材缩放。
- Phase 1 原有截图、坐标、Alpha、Canvas 裁剪测试继续通过。

## 遗留问题

- 当前环境没有真实 Chrome 扩展运行会话，尚未完成加载未打包扩展后的视觉手工验收；需在 Chrome 中验证 Editor 页面打开、Blob 缩略图、Konva 拖动和浏览器关闭恢复。
- Phase 2.3 已实现 Transformer、多选框、图层命令、视口缩放/平移和基础对齐吸附；真实 Chrome 手势仍需在扩展加载后做一次人工验收，尤其是不同 DPR、触控板滚轮和窗口尺寸下的体验。
- 变换边界使用轴对齐尺寸约束，旋转后的精确多边形碰撞检测和复杂等距布局提示仍可在后续交互打磨中增强。
- 标注工具、非破坏性遮挡像素导出、完整导出服务和更细的图层排序控制未在本轮实现。
- 项目名称目前由默认名称生成，右侧没有名称编辑控件；后续可在 Inspector 或顶部项目菜单补充。
- 现有 ClipItem 的 `imageBlob` 在 fake-indexeddb + jsdom 测试中会被表示为跨 realm 的普通对象，测试验证字段保留；真实 Chrome IndexedDB Blob 行为仍需手工验证。

下一步应先完成真实 Chrome 手工验收，再进入编辑器视觉精修和更完整导出能力阶段。

## Phase 2.4：标注与视觉编辑系统

### 已完成

- 扩展 `src/types/editor.ts`：标注统一使用独立 `Annotation` 记录和 `CanvasTransform`，支持文字、箭头、直线、矩形、椭圆、自由画笔和高亮；新增独立 `Redaction` 记录，类型为 `blur`、`pixelate`、`solid`。
- 项目 schemaVersion 升至 2；`normalizeProject` 会为既有 IndexedDB v2 项目补齐 `redactions: []`，原有 ClipItem、ClipProject 和图片 Blob 不变。
- 工具栏接入真实标注工具。画布拖拽创建形状、线条、箭头、画笔、高亮和矩形遮挡；文字工具通过输入框创建文字标注。
- 标注和遮挡作为独立图层参与选择、移动、缩放、旋转、复制、删除、锁定、可见性、重命名、排序、Undo/Redo 和自动保存。
- Inspector 支持标注位置/尺寸/旋转/透明度、文字字号/颜色、线条颜色/线宽、遮挡颜色/模糊半径/像素大小；图片支持圆角、外边距和样式预设。
- 新增原生 Canvas 导出管线 `src/modules/canvas-editor/export.ts`：按 zIndex 合成画布背景、图片、标注和遮挡；Blur、Pixelate、Solid Mask 均写入最终像素，导出结果不依赖 Konva 控制层，原始 ClipItem Blob 不会被修改。
- 支持纯色与默认线性渐变画布背景，导出与预览均可使用。

### 验证结果

- `npm run compile`：通过。
- `npm test`：通过，8 个测试文件、27 个测试。
- `npm run build`：通过，WXT 生成 Chrome MV3 Editor bundle（约 373 kB）。
- 新增 `tests/annotation-model.test.ts`：标注/遮挡独立数据、schema 兼容和选择 ID。
- 新增 `tests/export-redaction.test.ts`：Solid Mask 像素写入路径和三种遮挡类型区分。

### 遗留问题

- 当前环境没有真实 Chrome 扩展会话；需要人工验证文字输入、画笔连续点、Transformer 旋转、遮挡导出像素和渐变背景。
- Blur/Pixelate 导出使用浏览器 Canvas 2D 离屏合成，尚未加入大尺寸项目的性能基准。
- 图片阴影/边框的 Inspector 目前通过样式预设设置，细粒度颜色和参数编辑可在后续视觉精修阶段补充。
- 标注的文字编辑目前采用创建时输入，后续可增加画布内双击编辑。

## Phase 2.4 真实环境验收审查

### 当前代码审查结论

| 验收项 | 代码状态 | 当前环境证据 |
| --- | --- | --- |
| 文字输入 | 已实现 | 工具栏文字工具通过 `window.prompt` 创建独立文字标注；需 Chrome 手测输入法和长文本换行 |
| 连续画笔 | 已实现 | Stage 持续采样 pointer 点并在 pointerup 一次性保存；需 Chrome 手测快速移动和离开画布 |
| 旋转导出 | 已实现 | 图片、标注和遮挡均保存 rotation；Canvas 导出按对象变换合成 |
| 渐变背景 | 已实现 | Konva 预览和 Canvas 导出均使用线性渐变 |
| Blur / Pixelate / Solid | 已实现 | `applyRedaction` 在扁平像素上执行三种处理；源 ClipItem 不参与写入 |
| 大尺寸画布 | 已防护 | 导出尺寸限制为 16384 边长和约 268MP，并自动降低基础渲染 scale；浏览器真实耗时仍需手测 |
| 原始 ClipItem | 已保持不变 | 导出只读取 Blob，项目只保存 clipId；现有 IndexedDB 迁移测试继续通过 |

### 真实 Chrome 手动测试清单

1. 加载 `.output/chrome-mv3`，打开 Clip Studio，导入至少两张真实剪藏素材。
2. 选择文字工具，在空白处和素材上分别点击，输入中文、英文和多行文字；确认图层、撤销、刷新恢复正常。
3. 连续绘制画笔和高亮，包含快速短线、长线、反向拖动和画布边缘；确认只生成一个历史步骤。
4. 创建箭头、直线、矩形、椭圆，执行移动、八方向缩放、旋转、复制、锁定和图层排序。
5. 创建 Blur、Pixelate、Solid Mask，分别移动、缩放、旋转并导出 PNG；放大导出图检查遮挡区域没有可读原文残留。
6. 设置渐变背景和图片圆角、阴影、边框，分别导出 PNG、JPG、WebP，比较预览和文件像素。
7. 测试 1x、2x、3x、透明背景、JPG 背景色、质量滑块、自定义尺寸和宽高比锁定。
8. 使用“复制 PNG”，在图片编辑器或文档中粘贴，检查 Alpha、旋转、标注和遮挡结果。
9. 使用 4000×4000 以上画布和多个素材，记录预览、导出耗时和浏览器内存；验证超限尺寸提示或自动缩小。
10. 导出后重新打开项目，确认 ClipItem Blob、项目图层和遮挡记录仍可恢复。

## Phase 2.5：专业导出系统

### 已完成

- 复用 `src/modules/canvas-editor/export.ts`，新增 PNG、JPG、WebP MIME 输出。
- 支持 1x、2x、3x；支持自定义宽高，导出尺寸经过浏览器 Canvas 边长和面积上限保护。
- 支持宽高比锁定、透明背景、指定背景色和 JPG/WebP 质量控制。
- 新增导出预览对话框，预览使用同一份 Canvas 合成结果；支持自定义文件名。
- 支持一键复制 PNG 到剪贴板，失败时在对话框显示明确错误。
- 导出顺序继续按 zIndex 处理图片、标注和遮挡，保留旋转、圆角、阴影、边框、渐变和安全遮挡。
- PDF / Markdown 方案：PDF 后续使用离屏 PNG 页面拼接并由独立适配器调用；Markdown 输出图片文件链接、项目名、备注和来源 URL，暂不在本轮实现。

### 自动化验证

- `tests/export-redaction.test.ts` 覆盖 Solid Mask 写入路径、遮挡类型和大尺寸导出限制。
- `tests/annotation-model.test.ts` 覆盖标注/遮挡独立持久化模型和旧项目补字段。
- `npm run compile`、`npm test`、`npm run build` 作为本轮交付门禁。

### 遗留问题

- 当前无原生浏览器 Canvas 运行会话，无法在本地自动读取真实 PNG/JPG/WebP 像素和测量 Chrome 内存；上述项目列出的 Chrome 手测清单必须执行。
- 导出预览在每次参数变化后重新合成，超大画布可进一步加入缩略图预览和任务进度。
- PDF 与 Markdown 仅完成技术方案，等待后续导出适配器阶段。

## Phase 2.3：画布交互完善

### 已完成

- `StudioViewport` 接入 Konva `Transformer`：八个缩放锚点、旋转锚点、保持宽高比和最小尺寸限制；多个选中对象共享 Transformer。
- Shift 点击、拖动框选、Ctrl/Cmd+A、Escape 取消选择、Delete/Backspace 删除，以及多选对象批量复制、移动、缩放和旋转。
- 拖动和变换只在手势结束时写入 Zustand，一次手势生成一条历史记录；Ctrl/Cmd+Z、Ctrl/Cmd+Shift+Z、Ctrl/Cmd+Y 可撤销/重做。
- 图层面板支持拖拽排序、置顶/置底/上移/下移、显示/隐藏、锁定/解锁和双击重命名，选择状态与画布同步。
- 画布拖动时显示边缘/中心/画布中心吸附线；补充相邻素材的等间距吸附计算，并提供吸附开关。
- 滚轮以鼠标位置为中心缩放，Space+拖动或中键拖动画布，视口提供适应和 100% 控件；视口 zoom/pan 继续写入项目并自动保存。
- 所有 Transformer、框选矩形和辅助线都带 `selection-overlay` 标记，PNG 导出前隐藏并在导出后恢复。

### 新增验证

- `tests/editor-transform.test.ts`：最小尺寸/旋转/透明度归一化、画布与边缘吸附、图层排序和多选边界计算。
- 当前自动化门禁：`npm run compile` 通过；`npm test` 通过（8 个测试文件、27 个测试）。
- `npm run build`：通过，WXT 生成 Editor bundle（约 355 kB）及完整 Chrome MV3 扩展产物。

### 仍待后续

- 本轮没有实现完整标注编辑、非破坏性遮挡像素导出、自由变形、多边形旋转碰撞检测或 AI 功能。
- 需要在真实 Chrome 中人工检查触控板滚轮、键盘焦点、拖拽图层行、旋转后的导出画面及不同 DPR 下的 Transformer 视觉比例。
