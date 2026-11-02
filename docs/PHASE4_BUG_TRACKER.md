# LassoClip Phase 4 Bug Tracker

本表只记录已发现或待真实浏览器确认的问题。`未验证` 不等于 `通过`。Phase 4.1.3 的真实浏览器记录使用 [PHASE4_BROWSER_ACCEPTANCE.md](PHASE4_BROWSER_ACCEPTANCE.md)。

## P0

| ID | 问题 | 状态 | 证据 / 后续动作 |
|---|---|---|---|
| P0-001 | 真实 Chrome 尚未验证自由形状 Alpha、DPR/缩放坐标及三种遮挡的最终像素安全性 | 未验证 | 执行 `C-002`、`C-006`、`S-004`；失败时阻断发布 |
| P0-002 | Full Restore 的损坏 ZIP、取消、配额不足和恢复前安全备份尚未在真实 Chrome 验证 | 未验证 | 执行 `D-003`、`D-004`；确认无半恢复状态 |
| P0-003 | Project Capture 连续截图和 Service Worker 重启尚未真实验收 | 未验证 | 执行 `PC-004`、`PC-005`、`PC-010` |
| P0-004 | Edge Stable 打开 Clip Studio 时因空选区调用 `undefined.startsWith()` 而白屏 | 已修复，待 Edge 复测 | 根因是 `selectedEntity(project, [])` 未处理初始空选区；已增加显式选区守卫、Editor Error Boundary 和挂载回归测试 |
| P0-005 | Edge 中新截图保存后 Library/Studio 只能显示棋盘格或灰色占位 | 代码已修复，待 Edge 复测 | 根因是 Content Script 将 Blob 直接送入 `runtime.sendMessage`；Chromium/Edge 消息边界按 JSON 序列化，Blob 变成不可解码对象。现改为带 MIME、字节数和校验长度的 JSON-safe Base64 传输，Background 解码后才写入 `clipBlobs`；增加保存、读取、URL 生命周期和解码诊断。 |
| P0-006 | Project Capture 首次截图后点击“继续截图”无响应 | 代码已修复，待 Edge 复测 | 连续流程保留：确认或取消当前选区后在同一冻结画面进入下一轮；新画面来自用户在其他标签页重新发起的 `capture:start`，工具模式和 Overlay 实例保持不变。 |

## P1

| ID | 问题 | 状态 | 证据 / 后续动作 |
|---|---|---|---|
| P1-001 | 旧版本扩展级 Project Capture 上下文可能覆盖多个窗口 | 已修复，待 Chrome 验证 | 已改为按 windowId 隔离并串行写入；覆盖 `PC-008` |
| P1-002 | 文字标注依赖浏览器 prompt，缺少内联输入 | 已知 | 不在本轮扩大范围，纳入后续 Product Polish |
| P1-003 | Library 使用增量 Masonry，不是真正 DOM 回收式虚拟列表 | 已知 | 执行 `L-002`、`P-001`，根据数据决定后续优化 |
| P1-004 | Shadow DOM、跨域 iframe 和动态 DOM 元素的兼容性未在真实页面确认 | 未验证 | 执行 `C-003`、`C-004`、`C-005` |
| P1-005 | 矩形选区预览使用平滑曲线，视觉上呈半椭圆；最终裁剪仍为矩形 | 代码已修复，待 Edge 复测 | 矩形预览的填充和描边改用 Canvas `rect()`，保留最终裁剪的直线路径；增加四角几何回归测试。 |
| P1-006 | 连续截图确认/取消后页面短暂闪动 | 代码已修复，待 Edge 复测 | 同一 Overlay 内复用当前冻结画面，只重置选区和 captureId；不再为同一页面循环调用 `captureVisibleTab`。 |
| P1-007 | 完成截图后 Canvas pointerEvents 保持 `none`，工具和选区无法操作 | 代码已修复，待 Edge 复测 | 完成路径和外部新画面恢复时显式设置 Canvas `pointerEvents=auto`；增加 Overlay 生命周期回归测试。 |
| P1-008 | Clip Studio/Library 新建项目名称不可自定义，项目重命名入口缺失 | 代码已修复，待 Edge 复测 | 新建使用项目名称对话框；Studio 标题支持 Enter 保存/Esc 取消；Library 项目卡增加重命名；名称通过现有项目存储接口持久化。 |
| P1-009 | Studio 页面纵向滚动导致画布随页面移动 | 代码已修复，待 Edge 复测 | Editor 根布局改为 `100vh` 固定视口并隐藏页面溢出，左右面板独立滚动，中央画布保持 `overflow:hidden`。 |
| P1-010 | 元素截图命中错误的父级容器，悬停预览与点击锁定状态不一致 | 代码已修复，待 Edge 复测 | 根因是仅用 `elementFromPoint()` 后再 `closest()`，会跳过真实命中节点；同时悬停预览已写入 selection，首次点击被误判为拖动。现使用 `elementsFromPoint()` 候选栈过滤插件 Overlay、body/html 和超大通用容器；首次点击明确锁定，`[`/`]` 可切换候选父子元素。增加 DOM 命中、边界和锁定回归测试。 |

## P2

| ID | 问题 | 状态 | 计划 |
|---|---|---|---|
| P2-001 | Merge Restore、PDF/Markdown、OCR、AI、云同步未实现 | 延后 | 不属于 Phase 4.1 |
| P2-002 | Popup 设置入口和偏好持久化仍不完整 | 延后 | 后续 Product Polish |

## 缺陷记录模板

```text
Bug ID:
Priority: P0 / P1 / P2
Acceptance Case:
Environment:
Reproducible: 是 / 否 / 未验证
Steps:
Expected:
Actual:
Data impact:
Console / Service Worker log:
Attachments:
Fix / owner:
Retest result:
```

## P0-005 修复记录

- **故障环节：** Capture 生成 PNG Blob 正常；故障发生在 Content Script → MV3 Background 消息传输，早于 IndexedDB 保存。Edge 中元数据正常而图片不可读与该环节一致。
- **修复：** `blobTransport.ts` 将原图和缩略图转成 JSON-safe 负载；Background 校验并重建真实 Blob 后调用现有 `persistCapturedClip`。未升级数据库，也未覆盖历史记录。
- **诊断：** `imageDiagnostics.ts` 仅记录 clipId、MIME、字节数、解码尺寸、URL 创建/释放和异常，不记录图片内容、Blob URL 或来源页面。
- **渲染链：** Library、Editor AssetPanel 和 StudioViewport 现在共享错误处理与解码日志；无效历史 Blob 显示明确失败状态，绝不以占位图冒充成功。
- **限制：** 旧记录若在修复前已被 JSON 化为 `{}`，没有可恢复的原始字节；有效历史 Blob 继续按 v5 `clipBlobs` 读取。需要在 Edge 重新加载扩展后用新截图复测。
