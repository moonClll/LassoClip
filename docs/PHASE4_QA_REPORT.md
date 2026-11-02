# LassoClip Phase 4.1 QA 审查报告

**审查日期：** 2026-11-01  
**审查范围：** PRD 1.0、Capture、Popup、MV3 Background、Content Script、Library、Clip Studio、Data Management、IndexedDB v5、Backup & Recovery  
**审查结论：** 自动化门禁通过；桌面环境只暴露了 Microsoft Edge，没有可控的 Chrome 窗口，因此真实 Chrome 尚未执行。当前结论为“候选发布版本”，不是最终发布通过。

## 1. 审查方法

本次结论来自当前代码、Manifest、IndexedDB v5 迁移实现、现有测试和构建产物的交叉检查。未把历史进度文档中的“已完成”直接视为验收证据。

证据分为两类：

- **自动化证据：** `npm run compile`、`npm test`、`npm run build`，以及数据库迁移、截图几何、编辑器变换、Editor 挂载、导出、工作流、性能规模、备份恢复测试。
- **真实 Chrome 证据：** 需要加载 `.output/chrome-mv3`，在不同 DPR、页面缩放、Shadow DOM、跨域 iframe、真实 Canvas 和大图环境中手动执行。本轮没有把这些场景标记为通过。

## 2. PRD 功能审查

### P0 功能矩阵

| 模块 | PRD P0 能力 | 当前代码判断 | 证据与限制 |
|---|---|---|---|
| Capture | 自由手绘、多边形、矩形、椭圆、元素选取 | 已实现 | `entrypoints/content.ts`；几何、坐标和 Alpha 处理有自动化测试 |
| Capture | 冻结画面、放大镜、坐标辅助、键盘微调 | 已实现，待 Chrome 验收 | 代码路径完整；未在真实 Chrome 验证触控板、页面缩放和高 DPR |
| Capture | DOM 智能吸附 | 部分完成 | 支持 `elementFromPoint`、`getBoundingClientRect`、常见元素；Shadow DOM、跨域 iframe、动态父子节点仍需真实页面验证 |
| Capture | 透明 Alpha 输出 | 已实现，待像素验收 | 使用 Canvas Path 和 PNG；浏览器实际边缘抗锯齿需手动验证 |
| Capture | 快捷键、扩展图标、右键菜单 | 已实现 | MV3 command、action、contextMenus 均注册 |
| Popup / Background | Quick Clip 自动保存、剪贴板复制、反馈 | 已实现，待 Chrome 验收 | Background 写入 IndexedDB v5；复制失败有明确反馈 |
| Clip Studio | 独立图层、移动、缩放、旋转、多选、层级、隐藏、锁定 | 已实现 | Konva Transformer、Zustand、图层面板和历史记录路径完整 |
| Clip Studio | 自由画布、缩放平移、自动排版、对齐吸附、Undo/Redo | 已实现 | 编辑器交互测试和项目存储测试覆盖；真实鼠标/触控板仍需手动验证 |
| Clip Studio | 文字、箭头、直线、矩形、椭圆、画笔、高亮 | 已实现，文字输入体验待改进 | 当前文字入口使用浏览器 `prompt`，可创建并参与保存/导出 |
| Clip Studio | Blur、Pixelate、Solid Mask 真像素遮挡 | 已实现，必须 Chrome 像素验收 | `renderProjectToCanvas` 在导出时合成像素；自动化环境不能代表真实 Canvas 像素结果 |
| Clip Library | 自动保存、缩略图、重命名、备注、收藏、来源追溯 | 已实现 | v5 metadata-first 查询和 Library 页面已实现 |
| Export | PNG 导出、透明背景、复制到剪贴板 | 已实现，待真实浏览器验收 | 导出前预览、尺寸限制、临时 URL 释放路径完整 |
| Storage | IndexedDB 持久化、项目引用、迁移、删除保护 | 已实现 | v1/v2/v3/v4 → v5 迁移测试、项目引用保护和完整性检查通过 |

### P0 未闭合项

1. **Clip Board 连续剪藏已实现，待真实 Chrome 端到端验收。** Studio 的“剪藏到此项目”会持久化 projectId/sessionId，截图消息携带上下文，Background 先保存 ClipItem 再幂等加入项目；连续 5 次、Service Worker 重启和项目删除竞态仍必须按手动清单实测。
2. **真实浏览器验收尚未完成。** Shadow DOM、跨域 iframe、DPR、浏览器缩放、Canvas 像素遮挡和 MV3 Service Worker 重启都不能由当前 jsdom 测试替代。
3. **Edge Stable Clip Studio 白屏已完成代码修复，待用户在 Edge 中复测。** 初始项目加载时 `selectedIds` 为空数组，`selectedEntity` 仍把 `selectedIds[0]` 当作字符串传给 `startsWith`；生产包中的 `ne` 对应 `isAnnotationSelectionId`，与 DevTools 调用栈一致。

## 2.1 Edge 白屏 P0 修复记录

- **根因：** `src/stores/editorStore.ts` 的 `selectedEntity` 没有处理“尚未选中任何图层”的合法初始状态，运行时执行 `isAnnotationSelectionId(undefined)`。
- **修复：** 在进入字符串前缀判断前校验选区 ID；增加 `EditorErrorBoundary`，渲染异常时显示重新加载和返回 Library 的恢复界面。
- **依赖检查：** 实际安装版本为 React 19.3.1、React DOM 19.3.1、react-konva 19.3.2、Konva 10.9.0、react-reconciler 0.34.0，react-konva 的 peer 依赖与当前 React/Konva 版本匹配，未发现依赖版本冲突。
- **构建检查：** 生产包调用栈中的 `ne` 已定位到 `isAnnotationSelectionId`，`le` 对应 `selectedEntity`；本次没有通过默认值或可选链掩盖错误，也没有升级 IndexedDB。
- **回归测试：** 新增真实 `EditorShell` 挂载测试、空选区测试和 Error Boundary 恢复测试；Edge 实际复测仍保持“待执行”。

## 3. Phase 3.4 遗留问题审查

### 已修复

- Full Restore 之前生成安全备份，并通过 Data Management 页面自动下载为 `lassoclip-backup-YYYY-MM-DD-before-restore.zip`。
- 备份 Manifest 在恢复前解析；每个数据文件在 staging 前检查大小和 SHA-256；校验失败不会提交主库。
- ZIP 解析、恢复 staging 和主库替换使用短事务；最终替换使用单个 IndexedDB 事务，失败会 abort。
- Blob 导出按单个文件读取；浏览器环境下 ZIP 写入保留 Blob 片段，避免同时构造所有原图字节数组。
- 存储统计改为游标逐条聚合 Blob 大小；完整性检查使用 `getAllKeys()`，不再把所有原图读入内存。
- 恢复后验证项目图层、Collection 成员和封面引用的 ClipItem ID。

### 仍需真实环境验证

- 损坏 ZIP、SHA 不匹配、取消恢复和配额不足时的 UI 反馈。
- 100/500/1000 个素材及大型原图 ZIP 的内存峰值和恢复耗时。
- 恢复前安全备份在 Chrome 下载流程中的实际落盘结果。
- Full Restore 后 Library、Studio、Tags、Collections、Annotations、Redactions 的真实恢复一致性。

## 4. 性能与稳定性审查

### 已检查并加固

- Library 使用 `ClipItemSummary` 和缩略图缓存；Popup 不再调用会读取全部原图的 `listClips()`。
- 缩略图加载并发限制为 4；页面隐藏时释放缓存 Blob URL。
- 导出 fallback 的临时 URL 和 `ImageBitmap` 在每个素材完成绘制后释放。
- Canvas 导出尺寸受最大边长和面积限制，超限会缩小并给出状态提示。
- IndexedDB v5 恢复使用 staging object stores，不依赖一个跨长时间异步解压的事务。

### 风险

- `StudioViewport` 会在项目图层变化时重新加载当前可见原图；长时间编辑大型项目时仍需 Chrome 内存观察。
- Library 当前是 80 条增量渲染加 CSS columns，不是真正的 DOM 回收式虚拟列表。
- ZIP 当前为 Store（无压缩）格式，稳定性和分块处理优先，但大备份文件体积较大。
- captureId 账本现在持久化到 `browser.storage.local`，并有 in-flight 锁和 10 分钟清理；真实 Chrome 仍需验证 Service Worker 重启后的重复投递。
- Project Capture 上下文现在按浏览器窗口隔离；同一窗口切换项目使用新的 sessionId，真实多窗口操作仍需验收。

## 5. 问题分级

### P0

- **P0-1（已修复）：** 恢复前安全备份只在服务返回值中存在，用户无法保存。现在在 Full Restore 提交前自动下载安全备份。
- **P0-2（已修复，待 Chrome 验收）：** 已加入 Project Capture Mode。Studio 持久化目标项目上下文，Capture Overlay 每次携带 sessionId，Background 先保存 ClipItem、再幂等加入项目；项目失效时保留素材并提示，不会写入其他项目。详见 `docs/PHASE3_PROGRESS.md`。
- **P0-3（开放，验证项）：** 真实 Chrome 的遮挡像素安全性、DPR/缩放坐标、Project Capture 连续 5 次和 MV3 生命周期尚未执行，不能标记通过。
- **P0-4（已修复，待 Edge 复测）：** Clip Studio 初始空选区触发 `undefined.startsWith()` 导致白屏；已修复选区状态契约并增加 Error Boundary。必须在 Edge Stable 中分别验证空白 Editor、创建新项目和加载已有项目。

### P1

- 文字标注使用 `prompt`，缺少编辑器内联输入和更完整的字体控件。
- Shadow DOM、跨域 iframe、动态页面元素的智能吸附需要更明确的降级提示和 Chrome 验证。
- Library 需要真正的窗口化虚拟列表和更详细的长时间内存基线。
- Data Management 可增加备份文件历史、恢复前后摘要和配额预警的统一展示。

### Phase 4.1.2 / 4.1.3 代码审查与验证准备

- 发现并修复 P1：Project Capture 原先是扩展级单例，多窗口分别操作不同项目时存在上下文覆盖风险。现在使用 `window:<windowId>` 作用域保存上下文，并串行化上下文写入；旧单例值只迁移到首次读取它的窗口。
- captureId 账本保留跨 Service Worker 生命周期的本地持久化，并增加并发完成锁；IndexedDB v5 未升级。
- syntheticDataset 生成器限制在 jsdom + fake-indexeddb，数量限制为 0–1000；自动化清理不会触及真实 Chrome Profile。
- [PHASE4_BROWSER_ACCEPTANCE.md](PHASE4_BROWSER_ACCEPTANCE.md) 已升级为 Phase 4.1.3 记录模板，补充 Project Capture、Capture、Studio、Library、Data Management 分类验收表；[PHASE4_BUG_TRACKER.md](PHASE4_BUG_TRACKER.md) 继续记录 P0/P1/P2。
- 所有真实 Chrome 场景仍标记为“未执行”。

### Phase 4.1.1 复核

- 自动化已覆盖 Project Capture 的上下文 TTL、session 隔离、窗口隔离、ClipItem 优先保存、项目失效降级、重复项目引用去重，以及 Editor 空白加载、新项目、已有项目、空选区挂载和 Error Boundary；图片、矩形选区、连续截图、Overlay 生命周期、项目命名、固定画布布局和元素 DOM 命中回归后为 18 个测试文件、70 个测试全部通过。
- `npm run compile` 和 `npm run build` 均通过，构建产物包含 MV3 Background、Content Script、Popup、Library、Editor、Data Management 页面。
- 真实 Chrome 仍需按照 Release Plan 的 Clip Board 清单执行；本轮没有把未执行的手动步骤标记为通过。

### P2

- Merge Restore、拖拽导出、PDF/Markdown 导出、OCR、AI 分类、云同步仍按 PRD 后续版本处理。
- Popup 设置入口、默认模式/格式/自动复制偏好仍可在后续 Product Polish 迭代补齐。

## 6. 自动化结果

- `npm run compile`：通过。
- `npm test`：通过，18 个测试文件、70 个测试（新增项目名称规范化/持久化、Studio 固定视口布局、元素 DOM 命中/锁定和元素矩形预览回归测试）。
- `npm run build`：通过，包含 `data.html`、`editor.html`、`library.html`、`popup.html` 和 MV3 Service Worker。

自动化测试不覆盖真实 Edge/Chrome 的页面注入、Canvas 像素、剪贴板权限、下载行为、Service Worker 重启和真实内存峰值；这些场景在浏览器验收文档中保持“未执行”。P0-004 和 P0-005 的 Edge 复测也尚未执行。

## 7. Edge 图片加载 P0-005 诊断与修复

### 证据链

1. Capture 使用 Canvas 生成 PNG；同一 Blob 能复制到 Windows 画图，说明截图生成和 Canvas 导出成功。
2. ClipItem 的名称、尺寸、来源和时间能保存，说明消息中的 JSON 元数据正常到达 Background。
3. 原实现把 `imageBlob` / `thumbnailBlob` 直接放进 `browser.runtime.sendMessage`。Chromium 扩展消息 API 对消息使用 JSON 序列化，Blob 不属于可保留的 JSON 二进制值，因此 Background 收到的图片字段不是可解码 Blob；随后 `clipBlobs` 虽有记录键值，但 `URL.createObjectURL`、`createImageBitmap` 和 Konva 图片加载均失败。
4. 该判断由代码路径、Edge 现象和新增传输回归测试共同确认；没有修改 IndexedDB v5 或删除任何素材。

### 修复内容

- `src/modules/media/blobTransport.ts`：以 MIME、原始字节数和 Base64 负载跨消息传输，Background 校验长度后重建 Blob，并对超大消息明确失败。
- `entrypoints/content.ts` / `entrypoints/background.ts`：Capture 发送 JSON-safe 负载，Background 在保存前恢复真实原图和缩略图。
- `src/modules/media/imageDiagnostics.ts` / `imageLoader.ts`：记录读取、URL 生命周期和解码结果，不输出原始图片数据。
- `blobPreview.ts`、Library、AssetPanel、StudioViewport：增加共享的 Blob 校验、解码失败处理和 URL 释放路径。
- `tests/image-pipeline.test.ts`：覆盖 JSON 往返、Blob 字节和 MIME 保持、clipBlobs 读写、解码失败回收 URL、解码成功尺寸。

### 尚待真实 Edge 复测

以下结果当前仍为“未执行”，不能由 jsdom 测试替代：新截图后的 Library 缩略图、详情高清图、Studio 素材列表、Konva 画布显示、缩放/旋转/导出，以及旧的有效素材兼容性。若旧记录本身已是 `{}` 等损坏对象，需在 UI 中报告不可恢复并重新截图；不得伪造恢复结果。

## 8. Phase 4.1.4 剩余核心 Bug 修复

### P1-005 矩形选区预览

- **根因：** Overlay 的通用 `drawSmoothPath` 对矩形四个角使用二次曲线，因此预览看起来像半椭圆；Canvas 裁剪路径本身已使用四条直边。
- **修复：** 矩形的遮罩和虚线边框都直接调用 `CanvasRenderingContext2D.rect()`。裁剪逻辑和透明 Alpha 行为未改变，矩形四角不会再因预览路径被圆化。
- **回归：** `geometry.test.ts` 验证矩形路径严格返回四个轴对齐角点。

### P0-006 连续截图

- **根因：** Continue Capture 原先关闭 Overlay 后通过 Background 查询“当前活动标签页”重新发起截图；用户切换标签页或浏览器未将请求归属到原标签页时，下一次 `capture:start` 可能无法回到拥有 Overlay 的页面，且失败没有反馈。
- **修复：** Background 优先使用 `runtime.onMessage` sender 的 tabId/windowId；失败时返回明确消息。新 Overlay 由现有 content listener 创建并生成新的 captureId，Project Capture 上下文由 Background 按窗口作用域重新附加。普通 Quick Clip 和 Project Capture 均显示“继续截图”。
- **回归：** `project-capture.test.ts` 验证发送标签页优先级和连续三次素材写入同一项目且无重复图层。

### 旧损坏素材

Library、详情面板和 Studio 素材面板对无法创建 Blob URL 或无法解码的历史记录显示“图片数据损坏，可删除后重新截图”。系统不自动删除、不覆盖 IndexedDB v5 数据；用户仍可使用现有删除入口主动清理，项目引用保护继续生效。

### 待真实 Edge 复测

P0-006 需要验证普通 Quick Clip 连续截图、Project Capture 连续截图、活动标签页切换和新的 captureId；P1-005 需要验证矩形拖动预览四条直边、反向拖动、Shift 正方形和最终 PNG 四角像素。以上均保持“未执行”，不能由自动化测试替代。

## 9. 元素截图命中修复

### 根因

元素工具原先先调用 `elementFromPoint()`，再用 `closest()` 向上跳到预设标签选择器。这会把图片、文字和按钮的真实命中节点替换成不合适的父级容器；Overlay 自身还可能参与命中。另一个状态问题是悬停预览复用了正式 `selection`，所以首次点击会进入移动/缩放分支，无法可靠锁定元素。

### 修复

- `entrypoints/content.ts` 在临时关闭 Overlay 命中后优先调用 `document.elementsFromPoint()`，过滤插件节点、`html`/`body`、不可见节点和覆盖整个视口的通用容器，并保留从顶部到祖先的候选顺序。
- 悬停时只更新候选和预览边界；首次点击明确设置 `elementLocked`，之后才允许移动/缩放。
- 元素锁定后可使用 `[`/`]` 在当前命中栈中切换父级或子级；元素边界直接来自 `getBoundingClientRect()`，再由既有 viewport/DPR 映射参与裁剪。
- 跨域 iframe 无法注入内部 DOM 时显示明确限制提示，不声称能够读取 iframe 内部元素。

### 自动化与真实浏览器状态

- 自动化：`capture-overlay.test.ts` 已覆盖命中栈过滤、元素边界、首次点击锁定和父级切换；本轮 `npm run compile`、`npm test`（18 文件 / 69 测试）和 `npm run build` 均通过。
- 真实 Edge：尚未执行，仍需在普通 DOM、嵌套卡片、滚动容器、图片、Shadow DOM 和跨域 iframe 页面复测；不得以自动化结果替代浏览器验收。

### 连续截图机制更新

- 外部新截图请求在 `captureVisibleTab` 前仍向当前标签页发送 `capture:prepare`；Content Script 隐藏整个 Overlay 并等待两帧，再允许截图发生。
- 同一连续截图模式内不重复调用 `captureVisibleTab`：确认/取消只在当前冻结画面上复用同一个 Overlay，重置选区并生成新的 `captureId`，工具栏不会重复叠加，也不会暴露原网页。
- 选区在 pointerup/多边形闭合后进入待确认状态；确认按钮或 Enter 才保存并进入下一轮，取消按钮丢弃当前选区后进入下一轮，Esc 退出模式并保留已保存素材。
- 用户在其他标签页重新发起截图时，现有 `capture:start` 会更新冻结画面但保留工具模式；截图持久化仍使用现有 JSON-safe Blob 传输和 captureId 幂等账本，未修改 IndexedDB v5。
- 同一 Overlay 在保存/传输期间使用 in-flight 锁，快速重复按键不会重复发送同一 `captureId` 或启动多个下一轮截图。

