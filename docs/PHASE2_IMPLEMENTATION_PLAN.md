# Phase 2 Clip Studio 技术实施计划

## 目标与边界

Phase 2 交付一个可本地运行的 Clip Studio：把已有 `ClipItemRecord` 作为独立素材导入项目，在三栏编辑器中进行自由布局或确定性自动排版，支持图层、变换、多选、标注、撤销/重做、持久化和透明 PNG 导出。Phase 3 的 Library 搜索、标签、OCR 和 Phase 4 的设置/分享不在本计划实现范围。

## 技术选型

### Canvas 原生 API

优点是依赖最少、像素级导出可控、与当前 Canvas 裁剪模块直接复用。缺点是需要自行实现场景树、对象命中测试、拖动/缩放/旋转控制点、多选框、文本编辑、序列化和高 DPI 渲染；这些交互会把编辑器逻辑集中到一个难以维护的组件中。

### Fabric.js

Fabric 自带对象模型、控制点、文本和序列化，适合快速搭建单画布编辑器。它的对象状态是可变的，React 集成主要依靠事件桥接；非破坏性标注、独立交互层和多画布状态需要额外同步。自定义安全遮挡导出时还要严格管理对象可见性和底层像素合成。

### Konva.js

Konva 提供 Stage/Layer/Node 场景树、命中测试、Transformer、拖动事件和高分辨率导出，`react-konva` 与现有 React 组件树直接对应。素材、标注、选择框和辅助线可以放在不同 Layer；节点属性是可序列化的纯数据，适合 Zustand 状态、历史记录和 IndexedDB 持久化。通过 `stage.toDataURL({ pixelRatio })` 可按导出分辨率生成 PNG，同时仍可在导出前将遮挡效果写入独立合成 Canvas。

### 选择

采用 **Konva.js + react-konva**。当前产品的难点是多对象交互、独立图层、变换和 React UI 状态同步，而不是单纯像素绘制；Konva 已提供这些交互基础，依赖重量和学习成本低于自行维护一套场景引擎。Phase 1 的 Canvas 2D 继续负责自由形状裁剪和最终像素处理，Konva 只承担 Studio 场景编辑与预览，避免替换已经验证过的截图引擎。

计划增加依赖：`konva`、`react-konva`、`zustand`。不引入 Fabric.js、通用重量级 UI 套件或远程服务。

## Editor 页面与三栏架构

新增 `entrypoints/editor/index.html` 与 `entrypoints/editor/main.tsx`，由 Background/Popup 通过 `browser.tabs.create({ url: browser.runtime.getURL('editor.html') })` 打开。编辑器页面使用 CSS Grid：

```text
┌──────────────────────────────────────────────────────────────────┐
│ EditorToolbar: undo redo | add | auto layout | mode | background │
├───────────────┬──────────────────────────────────┬───────────────┤
│ AssetPanel    │ StudioViewport                   │ Inspector     │
│ 项目素材       │ Konva Stage                     │ 选中属性        │
│ LayerPanel     │ 背景/辅助线/选择框/变换           │ 尺寸位置旋转      │
│ 图层顺序       │ 缩放、平移、框选                  │ 样式/标注        │
└───────────────┴──────────────────────────────────┴───────────────┘
```

- `AssetPanel`：读取当前项目和最近剪藏，拖入或点击添加 ClipItem；显示缩略图、来源域名和尺寸。
- `LayerPanel`：按 zIndex 显示图片、文字、形状和标注；支持选择、隐藏、锁定、上移、下移、置顶、置底、复制和删除。
- `StudioViewport`：Konva Stage，内部按顺序放置 `BackgroundLayer`、`ImageLayer`、`AnnotationLayer`、`InteractionLayer`。Stage 坐标使用逻辑画布 px，视图缩放与设备 DPR 分离。
- `InspectorPanel`：编辑选中对象的 x/y/width/height/rotation/opacity、圆角、阴影、边框和标注属性。数值输入通过同一条 store action 更新，避免 UI 直接修改 Konva Node。
- `EditorToolbar`：Undo/Redo、添加素材、自动排版、自由/自动布局切换、背景设置、PNG 导出。

响应式规则：桌面窗口默认三栏；窗口窄于 960px 时右侧属性面板折叠为抽屉，主画布仍保持最小可操作宽度。弹窗继续只承担入口，不能把编辑器嵌入 Popup。

## 数据模型

### ClipItemRecord 扩展

保留现有截图数据模型，并补充可选的 `thumbnailBlob`、`updatedAt` 和 `source.elementText` 索引字段。截图选区继续使用 `coordinateSpace: 'image-px'`；编辑器不修改原始 Blob。

### ClipProject

```ts
interface ClipProject {
  id: string;
  name: string;
  canvas: {
    width: number;
    height: number;
    background: string | { type: 'solid' | 'linear-gradient'; value: string };
    layoutMode: 'auto' | 'free';
    zoom: number;
    pan: { x: number; y: number };
  };
  items: CanvasItem[];
  annotations: Annotation[];
  createdAt: number;
  updatedAt: number;
  schemaVersion: number;
}
```

### CanvasItem

```ts
interface CanvasItem {
  id: string;
  clipId: string;
  type: 'image';
  transform: {
    x: number; y: number; width: number; height: number;
    rotation: number; opacity: number;
  };
  zIndex: number;
  visible: boolean;
  locked: boolean;
  style: { cornerRadius: number; shadow?: ShadowStyle; border?: BorderStyle };
}
```

### Annotation

```ts
type Annotation =
  | { id: string; type: 'text'; x: number; y: number; width: number; height: number; text: string; style: TextStyle; zIndex: number; visible: boolean; locked: boolean }
  | { id: string; type: 'arrow' | 'line' | 'rectangle' | 'ellipse' | 'drawing' | 'highlight'; points: Point[]; style: AnnotationStyle; zIndex: number; visible: boolean; locked: boolean };
```

Annotations remain separate from `CanvasItem`. Editing a label or arrow changes its own object; the original ClipItem Blob remains immutable. The export pipeline is the only place where layers are flattened.

## 多素材导入与图层

1. `AssetPanel` calls `listClips()` and creates an object URL for each Blob; each URL is revoked when the asset leaves the page.
2. Adding a ClipItem creates a new `CanvasItem` with intrinsic image dimensions capped to a configurable maximum (for example, 640 logical px on the long edge) while preserving aspect ratio.
3. `addItem` assigns a UUID and zIndex above the current top layer; the same ClipItem can be added multiple times as independent items.
4. `LayerPanel` actions operate on immutable arrays in the store. Locked/hidden items stay in project data and are excluded from hit testing/rendering as appropriate.
5. Delete removes only the project reference. The ClipItem Blob is deleted only by the future Library deletion flow after checking project references.

## 自由画布、变换与自动排版

- **Stage viewport**：Stage contains a logical canvas group. Wheel/pinch changes `canvas.zoom` within 0.25–4; middle mouse or space-drag changes `canvas.pan`. Export always renders at logical canvas dimensions and ignores viewport pan/zoom.
- **Selection**：single click selects one item; Shift click toggles selection; drag on empty InteractionLayer creates a normalized selection rectangle. A Konva Transformer attaches to selected unlocked nodes and uses `boundBoxFunc` to enforce minimum size and aspect rules.
- **Transform commit**：during drag/transform Konva updates the preview node; on `dragend`/`transformend`, normalized values are written to the store and one history transaction is recorded. This prevents one pointer gesture from producing hundreds of undo entries.
- **Rotation**：rotation is stored in degrees around the item center. Inspector input normalizes to `[0, 360)` and all hit testing uses the Konva node transform.
- **Deterministic auto layout**：sort new items by insertion order, compute scaled sizes, and place them using a row flow algorithm with fixed `gap` and `padding`; when a row exceeds canvas width, start the next row. Use the same algorithm for “自动排版” so repeated execution is stable and overlap-free. Manual edits switch `layoutMode` to `free`.
- **Alignment guides**：during drag, compare active edges/centers with visible unlocked items and canvas center; render guide lines in InteractionLayer within a snap threshold in logical px. Guides are transient and never persisted.

## 标注与非破坏性编辑

Toolbar tools create `Annotation` records for text, arrow, line, rectangle, ellipse, freehand drawing and highlight. Each annotation has its own transform/style and zIndex; `AnnotationLayer` renders them above images. Text editing uses a temporary HTML textarea positioned over the Stage and commits on blur/Enter. Highlight uses a semi-transparent fill in preview while preserving the original ClipItem.

Sensitive masking is represented as an annotation with `type: 'highlight' | 'rectangle'` and `style.maskMode: 'solid' | 'pixelate' | 'blur'`. The preview may use Konva filters, but export must run a dedicated raster pass: draw the underlying image, apply the selected mask to the export Canvas, and only then encode PNG. The original Blob is never included as a recoverable hidden layer in the exported file.

## Undo / Redo

Use a small Zustand store with `{ past, present, future }` snapshots or command records. A command contains `label`, `before`, `after`, and `timestamp`. Actions that belong to one gesture (drag, resize, rotate, freehand stroke) are grouped on pointerup; Inspector text input commits on blur. New edits clear `future`; Undo moves the current state to `future` and restores `before`; Redo reverses that operation. Cap history at 100 entries and keep large Blobs outside snapshots by storing only ClipItem/CanvasItem IDs.

## PNG 导出

1. Validate canvas dimensions and visible items.
2. Create an offscreen export Canvas at `canvas.width * exportScale` × `canvas.height * exportScale`; default exportScale is 1 and an optional 2x setting can be added without changing logical coordinates.
3. Paint the configured background.
4. Render visible CanvasItems in zIndex order. Decode local Blob URLs before draw; reject failed images with a user-visible error.
5. Render annotations in order. For mask annotations, write pixels to the export Canvas during this pass; do not rely on toggling visibility of a UI layer.
6. `canvas.toBlob('image/png')`, offer download and reuse the existing clipboard service. The same export function feeds future JPG/WebP adapters.
7. Revoke temporary URLs and report the output dimensions and failures.

## 编辑器状态持久化

Extend the existing IndexedDB database from version 1 to version 2 with a `projects` object store keyed by project id and an index on `updatedAt`. Store project JSON separately from ClipItem image Blobs; project items reference `clipId`. On opening the editor, load the last project or create a default project with 1200×800 canvas and auto layout. Debounce writes by 400–600 ms after store changes, flush on `visibilitychange`/`pagehide`, and expose save status in the toolbar. A migration function must preserve existing `clips` records and initialize missing project fields.

## 文件与模块顺序

```text
entrypoints/editor/index.html
entrypoints/editor/main.tsx
src/components/editor/EditorShell.tsx
src/components/editor/EditorToolbar.tsx
src/components/editor/AssetPanel.tsx
src/components/editor/LayerPanel.tsx
src/components/editor/StudioViewport.tsx
src/components/editor/InspectorPanel.tsx
src/modules/canvas-editor/autoLayout.ts
src/modules/canvas-editor/transform.ts
src/modules/canvas-editor/export.ts
src/modules/annotation/annotationModel.ts
src/modules/storage/projectStore.ts
src/stores/editorStore.ts
src/types/editor.ts
tests/auto-layout.test.ts
tests/editor-history.test.ts
tests/project-store.test.ts
tests/export-order.test.ts
```

实施顺序：先扩展类型与 IndexedDB v2 迁移；再实现纯函数自动排版、变换归一化和历史记录；随后搭建 Editor 三栏壳与 Stage；接入 ClipItem 导入、图层和多选；加入标注和遮挡导出；最后实现保存状态、PNG 导出入口和浏览器集成验收。

## Phase 2 测试门禁

- `npm run compile`：严格类型检查，尤其验证 Konva event 类型、Blob 引用和项目 schema。
- `npm test`：自动排版无重叠/确定性、变换边界、旋转归一化、Undo/Redo 分组、项目迁移、zIndex 导出顺序和 mask 像素写入。
- 浏览器手测：三栏布局、导入多个素材、拖动/缩放/旋转、多选、图层排序、自动/自由布局切换、标注编辑、刷新恢复、透明 PNG 粘贴检查。
- 性能门槛：100 个 CanvasItem 的选择和拖动不产生连续历史快照；导出失败有明确错误；所有 object URL 在项目关闭或素材移除时回收。

## 风险与取舍

- Konva 预览和导出 Canvas 的字体/滤镜差异需要以导出像素测试校准；不把预览截图直接当作安全遮挡结果。
- 本地 Blob 可能较大，项目快照只引用 ClipItem ID，避免历史栈复制图片数据。
- 跨来源图像若未来从外部 URL 导入会污染 Canvas；Phase 2 只接受 IndexedDB 中的本地 Blob，确保导出不被 tainted canvas 阻断。
- Editor 打开为独立扩展页，避免 Popup 生命周期导致项目状态丢失；关闭页面前由 IndexedDB debounce flush 保证恢复。
