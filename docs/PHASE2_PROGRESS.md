# Phase 2 开发进度

本轮完成 Phase 2.1（数据模型与持久化）、Phase 2.2（Clip Studio 编辑器框架）和 Phase 2.3（画布交互完善）。未提前实现完整标注工具、敏感信息遮挡、OCR、标签或 AI 能力。

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

下一步应先完成真实 Chrome 手工验收，再进入后续标注、遮挡导出和编辑器精修阶段。

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
- 当前自动化门禁：`npm run compile` 通过；`npm test` 通过（6 个测试文件、22 个测试）。
- `npm run build`：通过，WXT 生成 Editor bundle（约 355 kB）及完整 Chrome MV3 扩展产物。

### 仍待后续

- 本轮没有实现完整标注编辑、非破坏性遮挡像素导出、自由变形、多边形旋转碰撞检测或 AI 功能。
- 需要在真实 Chrome 中人工检查触控板滚轮、键盘焦点、拖拽图层行、旋转后的导出画面及不同 DPR 下的 Transformer 视觉比例。
