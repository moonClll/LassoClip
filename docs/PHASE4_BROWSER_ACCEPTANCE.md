# LassoClip Phase 4.1.3：Real Browser Validation

**状态：** 测试准备完成；真实 Chrome 场景在当前环境未执行。所有手动结果必须由执行者填写，不得用自动化结果替代。

## 1. 测试环境记录

| 字段 | 记录 |
|---|---|
| 操作系统 / 版本 | |
| Chrome 版本 / 渠道 | |
| LassoClip 构建目录 | `.output/chrome-mv3` |
| Manifest 版本 | `0.1.0` |
| 屏幕分辨率 | |
| DPR | |
| Chrome 页面缩放 | |
| 测试日期 / 执行人 | |
| 结果日志或录屏 | |

状态值：`未执行`、`通过`、`失败`、`阻塞`。只有真实 Chrome 中实际完成的步骤才能填写“通过”。

## 2. 自动化基线

执行命令：

```text
npm run compile
npm test
npm run build
```

当前自动化覆盖 15 个测试文件、55 个测试，覆盖 IndexedDB v5 迁移、项目引用、截图几何、导出合成、标签/Collection、备份恢复、性能规模、Project Capture 数据契约，以及 Editor 空白加载、新项目、已有项目、空选区挂载和错误恢复。自动化不证明真实页面注入、剪贴板权限、Canvas 浏览器像素、下载行为、Service Worker 生命周期或真实内存峰值。

## 3. Project Capture 专项

| ID | 场景 | 步骤与检查点 | 结果 |
|---|---|---|---|
| PC-001 | 启动上下文 | Studio 打开项目 A，点击“剪藏到此项目”；记录 projectId、模式提示和目标名称 | 未执行 |
| PC-002 | 持久化 | 关闭 Studio/Popup，重新打开 Popup 或 Studio；确认项目 A 仍是目标 | 未执行 |
| PC-003 | TTL | 使用 DevTools 修改或等待过期上下文；确认过期后不再启动项目截图且不会自动加入项目 | 未执行 |
| PC-004 | 连续截图 | 切换到网页，连续完成 5 次截图；每次选择“继续截图”；返回项目确认 5 个独立素材和图层 | 未执行 |
| PC-005 | Service Worker | 在两次截图之间让 Background Service Worker 空闲并重新唤醒；确认 projectId/sessionId 不变 | 未执行 |
| PC-006 | captureId 幂等 | 重复投递同一个 captureId，含并发重复投递；确认仅有一个 ClipItem 和一个项目图层 | 未执行 |
| PC-007 | 项目失效 | 截图开始后删除目标项目，再完成截图；确认 ClipItem 保留、出现提示、没有加入其他项目 | 未执行 |
| PC-008 | 项目切换 | 窗口 1 目标项目 A，窗口 2 目标项目 B；分别截图，确认素材不会串入另一项目 | 未执行 |
| PC-009 | 退出模式 | Studio 或 Popup 退出模式后截图；确认素材只进入 Library，不进入旧项目 | 未执行 |
| PC-010 | 浏览器重启 | 关闭并重启 Chrome，再打开扩展；确认未过期上下文可恢复，过期上下文被清理 | 未执行 |

上下文现在按浏览器窗口隔离；同一窗口内切换目标项目会创建新 sessionId，旧 overlay 完成时只保存素材，不会写入新项目。

## 4. Capture

| ID | 场景 | 检查点 | 结果 |
|---|---|---|---|
| C-001 | 矩形 / 椭圆 | 冻结画面、Shift 等比、重绘、取消、Enter/Escape | 未执行 |
| C-002 | 自由形状 / 多边形 | 闭合、撤销顶点、透明 Alpha、边缘抗锯齿 | 未执行 |
| C-003 | DOM 吸附 | img、SVG、表格、卡片、嵌套父子元素、边界调整 | 未执行 |
| C-004 | Shadow DOM | open/closed shadow root 内元素，高亮和降级反馈 | 未执行 |
| C-005 | 跨域 iframe | iframe 内外元素，确认权限限制时不崩溃且反馈明确 | 未执行 |
| C-006 | DPR / 缩放 | DPR 1/1.25/1.5/2/3 与页面缩放 80/100/125/150%，逐像素检查边界 | 未执行 |
| C-007 | 放大镜 / 微调 | 十字线、坐标、Arrow 与 Shift+Arrow 微调 | 未执行 |
| C-008 | 清理 | 取消或完成后 Overlay、Shadow DOM 和监听器被清理 | 未执行 |

## 5. Studio 与导出

| ID | 场景 | 检查点 | 结果 |
|---|---|---|---|
| S-001 | 多素材 | 5 个素材自动排版、自由布局、移动、缩放、旋转 | 未执行 |
| S-002 | 图层 | 隐藏、锁定、重命名、上移/下移/置顶/置底、复制/删除 | 未执行 |
| S-003 | 标注 | 文字、箭头、直线、矩形、椭圆、连续画笔、高亮持久化 | 未执行 |
| S-004 | 遮挡 | Blur、Pixelate、Solid Mask 在旋转素材上真实写入导出像素 | 未执行 |
| S-005 | Undo/Redo | 连续拖动合并、刷新恢复、快捷键和自动保存一致 | 未执行 |
| S-006 | PNG | 透明 Alpha、渐变、阴影、圆角、标注和遮挡与预览一致 | 未执行 |
| S-007 | JPG/WebP | 背景色、质量、1x/2x/3x、自定义尺寸和文件名 | 未执行 |

## 6. Library、Data Management 与性能

| ID | 场景 | 检查点 | 结果 |
|---|---|---|---|
| L-001 | 查询 | 搜索、排序、收藏、多标签、Collection、来源跳转 | 未执行 |
| L-002 | 规模 | 100/500/1000 个真实素材首屏、滚动、缩略图缓存和 Blob URL 释放 | 未执行 |
| D-001 | 备份 | Manifest、Schema、数量、SHA-256、Blob 文件和无 Base64 图片 | 未执行 |
| D-002 | Full Restore | 预览、进度、项目/素材/标签/Collection/标注关联一致 | 未执行 |
| D-003 | 损坏与取消 | SHA 失败、ZIP 损坏、用户取消、中途失败均不提交半恢复状态 | 未执行 |
| D-004 | 安全备份 | 恢复前 `*-before-restore.zip` 实际下载并可重新恢复 | 未执行 |
| P-001 | 长时间使用 | 5 分钟 Library 浏览和 5 分钟 Studio 编辑，记录 JS 堆、Blob URL、Canvas 内存 | 未执行 |
| P-002 | 大文件 | 100MB/500MB/1GB 备份和大画布，记录耗时、峰值内存和失败反馈 | 未执行 |

## 7. MV3 生命周期与多标签页

1. 从扩展图标、快捷键和右键菜单分别启动截图。
2. 关闭 Popup、切换标签页、让 Service Worker 空闲后完成截图。
3. 同时打开两个浏览器窗口，分别为项目 A/B 启动 Project Capture；交替截图并核对项目归属。
4. 在一个窗口切换项目目标，确认旧 session 不会写入新项目。
5. 重启 Chrome，检查未过期上下文、IndexedDB v5 数据和备份入口。
6. 在受保护页面、无法注入页面和跨域 iframe 中记录明确错误，不把失败当作通过。

## 8. 手动记录模板

```text
Case ID:
Environment:
Preconditions:
Steps:
Expected:
Actual:
Status: 未执行 / 通过 / 失败 / 阻塞
Console / Service Worker log:
Screenshot or video:
Related bug ID:
```

## 9. 分类验收记录表

每个用例都必须填写“实际步骤、预期、实际结果、证据和状态”。表格中的空白不是通过，默认状态为“未执行”。

### Project Capture

| Case ID | 实际步骤 | 预期结果 | 实际结果 | 证据（截图/日志/项目 ID） | 状态 | Bug ID |
|---|---|---|---|---|---|---|
| PC-001 至 PC-010 | | projectId、sessionId、窗口隔离、TTL、幂等和降级均符合矩阵描述 | | | 未执行 | |

### Capture

| Case ID | 实际步骤 | 预期结果 | 实际结果 | 证据（裁剪图/像素检查/控制台） | 状态 | Bug ID |
|---|---|---|---|---|---|---|
| C-001 至 C-008 | | 选区、Alpha、DOM 吸附、放大镜、DPR/缩放和清理符合矩阵描述 | | | 未执行 | |

### Studio / Export

| Case ID | 实际步骤 | 预期结果 | 实际结果 | 证据（项目快照/导出文件/像素检查） | 状态 | Bug ID |
|---|---|---|---|---|---|---|
| S-001 至 S-007 | | 编辑、遮挡、Undo/Redo 和 PNG/JPG/WebP 输出与预览一致 | | | 未执行 | |

### Library

| Case ID | 实际步骤 | 预期结果 | 实际结果 | 证据（计数/性能/内存记录） | 状态 | Bug ID |
|---|---|---|---|---|---|---|
| L-001 至 L-002 | | 查询结果正确，100/500/1000 素材首屏和滚动行为可记录 | | | 未执行 | |

### Data Management / MV3

| Case ID | 实际步骤 | 预期结果 | 实际结果 | 证据（ZIP/Manifest/SHA/Service Worker 日志） | 状态 | Bug ID |
|---|---|---|---|---|---|---|
| D-001 至 D-004、P-001 至 P-002 | | 备份、校验、恢复回滚、配额反馈和 MV3 生命周期符合矩阵描述 | | | 未执行 | |

## 10. 测试数据安全

- `tests/helpers/syntheticDataset.ts` 只允许在 jsdom + fake-indexeddb 环境运行；非 jsdom 环境会主动抛错。
- 生成数量限制为 0–1000，验收规模固定使用 100、500、1000。
- `clearSyntheticDatabase()` 只由自动化性能测试调用，测试开始前和每个规模切换前清理 fake IndexedDB。
- 真实 Chrome 不加载该 TypeScript helper，也不调用 `deleteDatabase()`；真实浏览器压力测试必须使用可恢复的测试备份或专用 Chrome Profile。
- 开始真实测试前先导出用户数据备份，结束后核对 ClipItem、ClipProject、Tags 和 Collections 数量，确认没有误删真实数据。
