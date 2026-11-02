# LassoClip Phase 4.1 Release Plan

## 1. 发布目标

发布候选版本必须满足：

1. P0 数据安全、截图、编辑、导出和恢复路径在真实 Chrome 中可重复完成。
2. IndexedDB v3/v4 数据升级到 v5 后，素材 Blob、项目、标签和 Collection 不丢失。
3. 失败恢复、取消恢复、配额不足和受保护页面都有清晰反馈。
4. 自动化门禁和手动验收记录可追溯，未执行的场景不标记为通过。

Phase 4.1.3 正式浏览器记录模板见 [PHASE4_BROWSER_ACCEPTANCE.md](PHASE4_BROWSER_ACCEPTANCE.md)，问题分级与复测记录见 [PHASE4_BUG_TRACKER.md](PHASE4_BUG_TRACKER.md)。

## 2. 发布阻断条件

以下任一项失败，暂停发布：

- 任意已有 ClipItem 或 ClipProject 在 v5 迁移后不可读取。
- 自由形状 Alpha 裁剪出现白底、错位或页面缩放/DPR 偏移。
- Blur、Pixelate、Solid Mask 导出后仍可看到可恢复的原始敏感像素。
- Full Restore 在校验失败、取消或中途异常后留下半恢复状态。
- 项目、素材、标签、Collection 关联恢复不一致。
- Popup、Background、Content Script 在 Service Worker 重启后出现不可恢复错误。
- Chrome 中无法生成普通 PNG 或无法保存恢复前安全备份。

## 3. 手动验收矩阵

### Capture

1. 普通网页执行矩形、椭圆、自由手绘和多边形截图；确认冻结画面、取消、重绘和 Enter/Escape 行为。
2. 在图片、SVG、表格、代码块、卡片和嵌套文本上使用 Element Select；观察边界高亮、拖动、右下角调整和父子元素抖动。
3. 检查放大镜跟随鼠标、十字辅助线、坐标显示和 Arrow/Shift+Arrow 微调。
4. 在 DPR 1、1.25、1.5、2、3 和 Chrome 页面缩放 80%、100%、125%、150% 下截图，逐像素检查边界和透明区域。
5. 在 Shadow DOM、开放/关闭 Shadow Root、同源 iframe、跨域 iframe、视频、Canvas、动态滚动页面中记录成功、降级或明确错误。
6. 截图期间触发动画、滚动、悬浮菜单和页面点击；确认网页布局未改变，退出后 Overlay DOM 和事件监听器被清理。

### Popup / MV3

1. 从扩展图标、Alt+Shift+L、右键菜单分别启动截图。
2. 关闭 Popup、切换标签页、让 Service Worker 空闲后再完成截图，确认保存和反馈仍然成功。
3. 重复发送同一 `captureId`，确认不会产生重复 ClipItem；Service Worker 重启后记录幂等缓存行为。
4. 在受保护页面和无法注入页面确认错误反馈清晰。

### Clip Board / Project Capture Mode

1. 打开一个已有项目，在 Studio 顶部点击“剪藏到此项目”；确认出现目标项目和模式状态提示。
2. 切换到支持注入的网页，分别使用扩展图标、快捷键和右键菜单截图；连续完成 5 次，逐次选择“继续截图”。
3. 点击“打开项目”，确认 5 个新素材已经保存、自动排版、只引用各自 ClipItem ID，且原图没有重复存储。
4. 在截图期间关闭 Popup、切换标签页并等待 Service Worker 空闲后继续截图；确认目标 projectId 和 sessionId 未漂移。
5. 重复投递同一个 captureId，确认 Library 只有一个 ClipItem，项目只有一个对应图层。
6. 删除或失效目标项目后完成一次截图，确认素材仍在 Library、出现明确提示，并且没有被加入其他项目。
7. 在 Studio 或 Popup 退出模式后完成普通截图，确认该素材不会自动加入旧项目；刷新 Studio 后确认已退出状态不会复活。
8. 同时打开两个浏览器窗口，分别为项目 A 和项目 B 启动模式，交替截图并核对各自项目只收到对应素材。

### Studio

1. 从单素材、多素材、Collection 创建项目；确认自动排版不重叠且项目只保存 ClipItem ID。
2. Shift 多选、框选、Ctrl/Cmd+A、拖动、八方向缩放、旋转、锁定、隐藏、层级调整和复制删除。
3. Space+拖动平移、滚轮缩放、适应屏幕、100% 显示、画布中心吸附、边缘/中心辅助线和吸附开关。
4. 创建文字、箭头、直线、矩形、椭圆、连续画笔和高亮；编辑属性、旋转、缩放、移动、复制、删除和图层排序。
5. 创建 Blur、Pixelate、Solid Mask；覆盖旋转素材和标注，导出后检查遮挡区域不存在可恢复原图。
6. 连续操作后执行 Undo/Redo、刷新页面、关闭并重新打开项目；确认 Zustand、Konva 和 IndexedDB 状态一致。

### Export

1. 分别导出 PNG、JPG、WebP，测试 1x/2x/3x、自定义宽高、宽高比锁定、质量、文件名和背景色。
2. PNG 透明背景检查 Alpha；JPG 强制检查背景色；WebP 检查质量和文件类型。
3. 检查旋转、圆角、阴影、边框、外边距、渐变、标注和三种遮挡与预览一致。
4. 点击复制 PNG，验证剪贴板内容；拒绝权限时确认错误提示和再次复制入口。
5. 使用接近 Canvas 限制的大画布，确认有明确缩小提示且浏览器不崩溃。

### Library / Data Management

1. 使用 100、500、1000 个真实素材检查首屏、滚动、缩略图缓存、内存和 Blob URL 释放。
2. 检查搜索、排序、收藏、标签、多标签筛选、Collection、来源跳转和项目打开。
3. 从 v3、v4 数据库升级到 v5，确认原图、缩略图、项目引用、标签和 Collection 完整。
4. 导出 ZIP，检查 Manifest、Schema、SHA-256、原图/缩略图文件和 JSON 中不存在 Base64 图片。
5. 恢复前确认自动下载 `*-before-restore.zip`；执行完整恢复、取消恢复、损坏备份和引用错误恢复。
6. 恢复后检查素材、项目、Annotations、Redactions、Tags、Collections 和封面引用；删除项目确认原素材仍存在。
7. 模拟配额不足、IndexedDB blocked、页面刷新和 Data Management 页面关闭，确认没有半恢复状态。

## 4. 性能基线

在至少一台普通办公设备和一台低性能设备记录：

- Popup 打开时间、截图启动时间和普通裁剪耗时。
- Library 首屏时间、100/500/1000 条滚动帧率、JS 堆和 GPU/Canvas 内存变化。
- Studio 10/50 个图层加载时间、连续变换 5 分钟后的内存。
- 100MB、500MB、1GB 备份导出和恢复耗时、峰值内存和失败行为。
- 页面隐藏/恢复前后的 Blob URL 数量，以及 `navigator.storage.estimate()` 使用量。

## 5. 发布顺序

1. 先执行自动化门禁并保存日志。
2. 加载 `.output/chrome-mv3` 执行 Capture、Studio、Export 手动矩阵。
3. 用备份副本执行 v3/v4 → v5 迁移与 Full Restore 矩阵。
4. 记录 P0/P1/P2 问题，P0 逐项复测并关闭；P1 进入下一迭代计划。
5. 确认构建版本、Manifest 权限、产物页面和 README/变更记录后，再创建发布标签。

## 6. 下一阶段建议

- Clip Board 项目上下文和 Capture → active project 链路已实现，并已按 windowId 隔离；发布前优先完成真实 Chrome 连续截图、Service Worker 重启和双窗口验收。
- 随后处理文字内联编辑、虚拟列表和大 ZIP 性能基线。
- 暂不开发 AI、OCR、云同步和 Merge Restore，保持当前 Schema v5 稳定。

