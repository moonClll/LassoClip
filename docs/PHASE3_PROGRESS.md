# LassoClip Phase 3 Progress

## Phase 3.1 · Clip Library

### 架构审查结论

- `ClipItemRecord.imageBlob` 直接保存在 IndexedDB v2 的 `clips` object store；`thumbnailBlob` 是 PRD 允许的可选字段，当前截图流程只写入原图 Blob。
- `ClipItemRecord` 已有 `tags: string[]`、`notes?: string`、`favorite: boolean`，本阶段直接复用，不新增数据库版本或重复字段。
- `ClipProject.items` 的图片对象只保存 `clipId`。项目通过 `projectClipIds` 读取关联素材，项目 JSON 与图片 Blob 分离，不会复制图片。
- `saveProject` 在同一事务中检查所有 `clipId`，缺失关联会回滚写入。
- 原有存储没有素材删除 API。本阶段新增 `deleteClip` 和 `ClipReferenceError`：删除前扫描全部项目；只要仍有项目引用就拒绝永久删除并返回项目名称，删除项目不会删除素材。
- 数据库仍使用 `DB_VERSION = 2`，没有未经检查的 schema 升级。备注和收藏更新通过已有 `clips` store 的 `put` 持久化。

### 已完成

- 新增独立 WXT 页面 `library.html`，从 Popup 的 Clip Library 入口打开；保留 Clip Studio 的直接入口。
- Library 提供 All Clips、Recent、Favorites、Collections 入口和 Projects 入口。Collections 本阶段显示明确的即将推出空状态，不提前实现完整收藏夹系统。
- 素材使用响应式 Masonry columns 展示，图片 Blob 通过 `URL.createObjectURL` 读取，不产生第二份图片存储。
- 支持按名称、来源域名、来源标题、URL、备注和标签搜索；支持最近添加、最早添加、名称排序和收藏筛选。
- 详情面板显示真实图片、名称、来源 URL/域名、截图时间、尺寸、选区类型和备注；名称、备注、收藏状态通过 `saveClip` 更新。
- 支持打开原始网页、从详情创建“素材 + 项目”并进入 Clip Studio、创建空白项目、从 Projects 列表重新打开已有项目。
- 增加加载、错误、空状态和无结果状态；项目卡片显示画布背景、项目名称、素材数量和更新时间。
- 新增引用保护测试，确保项目引用中的素材不能被删除；项目删除后才允许删除未引用素材。

### 自动化验证

- `npm run compile`：通过。
- `npm test`：通过，9 个测试文件、31 个测试；新增 `library-utils.test.ts` 的搜索/排序/收藏筛选覆盖，以及项目引用删除保护覆盖。
- `npm run build`：通过，生成 `.output/chrome-mv3/library.html`、Library bundle、样式，并确认 Popup → Background → Library 消息链路构建成功。

### 真实 Chrome 手动验收清单

1. 加载构建产物，点击 Popup 的 Clip Library，确认新标签页打开并能读取已有真实剪藏。
2. 在 All Clips、Recent、Favorites 间切换；确认收藏数量和筛选结果与详情面板一致。
3. 使用名称、域名、来源标题、备注搜索；切换三种排序并确认卡片顺序稳定。
4. 检查 Masonry 图片在窄窗口、宽窗口和不同图片比例下没有溢出；确认图片仍来自本地 Blob。
5. 打开素材详情，编辑名称、备注、收藏，刷新 Library 后确认数据保持。
6. 点击“打开原始网页”，确认 URL 在新标签页打开；点击“在 Clip Studio 中编辑”，确认项目只新增 `clipId` 引用并能恢复图片。
7. 在 Projects 入口打开已有项目，确认 Editor 中的素材与 Library 同一份 Blob；创建空白项目并确认保存。
8. 尝试删除仍被项目引用的素材，确认显示明确错误且项目和素材都保留；删除项目后再测试删除未引用素材。
9. 在无素材、无收藏、无项目和搜索无结果时检查空状态与错误重试路径。

### 遗留问题

- Collections、完整标签编辑和 OCR 按本轮边界暂未实现；现有标签仅作为搜索字段。
- 当前 Library 采用 CSS columns Masonry，尚未加入虚拟列表；超大素材库需要后续性能基准和虚拟化。
- 详情面板的备注保存依赖失焦；后续可增加明确保存状态和键盘快捷键。
- 本地环境未提供真实 Chrome 扩展会话，以上手动清单需要在加载 `.output/chrome-mv3` 后执行。

## Phase 3.2 · Advanced Asset Organization

### 数据架构审查与迁移

- 保留 `ClipItemRecord.tags` 作为素材标签关联字段；标签名称通过 `normalizeTagName` 去除首尾空白、合并连续空格并统一大小写。
- IndexedDB 从 v2 安全升级到 v3，仅新增 `tags` 与 `collections` object store，并保留原有 `clips`、`projects` 及图片 Blob。
- `TagRecord` 只保存标签名称、颜色和时间；`CollectionRecord` 只保存名称、描述、封面 Clip ID 与 Clip ID 列表，绝不复制图片 Blob。
- v2 → v3 迁移不会改写已有素材和项目；项目引用校验仍由原有 `saveProject` 执行。

### 已完成

- 标签创建、规范化去重、颜色编辑、删除；删除或重命名标签会在同一事务中同步更新 ClipItem 的 `tags`。
- 侧边栏显示标签使用数量；标签筛选支持多个标签同时匹配，搜索框支持标签 datalist 自动补全。
- 素材网格支持复选多选和当前结果全选；批量添加/移除标签、批量收藏、批量名称前缀、批量删除。
- 新增 Collections CRUD：创建、重命名、描述编辑、删除、封面设置、详情查看、加入和移出素材。
- 一个素材可以同时属于多个 Collection；删除 Collection 不会删除 ClipItem。
- 支持从素材卡拖拽到 Collection 卡片；Collection 详情支持批量移出素材和设置封面。
- 批量删除在 `clips + projects + collections` 同一事务中执行：项目引用会阻止整批删除，成功删除时同步清理所有 Collection 关联和失效封面。
- Library 侧边栏新增素材、标签、Collection 数量统计，补充批量工具栏、标签徽标、Collection 封面及空状态。

### 自动化验证

- `npm run compile`：通过。
- `npm test`：通过，10 个测试文件、37 个测试。
- `npm run build`：通过，生成独立 Library bundle（约 24 kB）和 `library.html`。
- 新增 `tests/library-store.test.ts`，覆盖 v2 → v3 迁移、标签规范化/重命名/删除、Collection 多对多关联、批量更新、项目引用保护和删除后的关联清理。

### 真实 Chrome 手动验收清单

1. 使用已有 v2 数据加载 Library，确认原有素材、项目和 Blob 均可读取，刷新后标签/Collection 数据仍在。
2. 创建同名不同大小写或多余空格标签，确认不会出现重复；编辑颜色和名称，确认素材标签同步更新。
3. 删除标签，确认所有 ClipItem 的对应标签被移除，图片和项目不受影响。
4. 使用多个标签筛选，确认结果是同时满足所有已选标签；使用标签输入框的自动补全并按 Enter 应用筛选。
5. 创建 Collection，编辑名称和描述，拖拽真实素材进入，确认同一素材可加入多个 Collection。
6. 打开 Collection 详情，设置不同素材为封面、移出素材，确认封面和数量更新；删除 Collection 后确认素材仍存在。
7. 多选素材执行批量标签、收藏、改名前缀、加入/移出 Collection，刷新页面确认持久化。
8. 在项目仍引用素材时批量删除，确认整批操作被拒绝且素材、项目和 Collection 关联都保留。
9. 删除未被项目引用的素材，确认它会从所有 Collection 中移除，失效封面自动切换，且原始项目引用保护不被绕过。

### 遗留问题

- 标签和 Collection 的编辑入口目前使用轻量 prompt，后续可替换为统一的非阻塞对话框。
- Collection 列表暂未实现拖拽排序；素材拖入 Collection 和 Collection 内移出已实现。
- 超大素材库仍使用现有 CSS columns，尚未加入虚拟列表性能优化。
- 本地环境没有真实 Chrome 扩展会话，手动清单仍需加载 `.output/chrome-mv3` 验收。

## Phase 3.3 · Unified Workflow Integration

### 已完成

- Capture Overlay 成功后继续自动保存真实 ClipItem，并显示“打开 Library”“进入 Studio”“关闭”后续操作入口；原有 PNG 剪贴板反馈保留。
- `captureId` 作为捕获幂等键由一次 Overlay 会话持有，Background 对重复消息返回已有 Clip ID，避免网络/消息重试重复创建素材。
- Library 支持多选素材自动创建项目；项目素材只保存 `clipId`，使用确定性自动排版。
- Library 批量工具栏支持将多个素材添加到已有项目；已存在的 Clip ID 不会重复导入。
- Collection 详情支持一键用当前 Collection 创建新项目；项目列表支持打开、复制和删除。
- 项目复制会生成新的项目与图层 ID，但继续引用同一批 ClipItem，不复制图片 Blob。
- Studio 顶部品牌入口返回 Library，并携带当前 `projectId`；左侧素材面板可以带 `clipId` 和项目上下文打开 Library 素材详情。
- 删除项目只删除项目记录，不删除原始 ClipItem；移除 Studio 图层也不会删除素材。
- 现有项目加载、ClipItem 引用校验、自动排版和 IndexedDB v3 数据保持不变。

### 跨模块自动化验证

- 新增 `tests/workflow-integration.test.ts`：覆盖多素材导入、重复 Clip ID 去重、自动排版、项目复制、项目删除后素材保留。
- 现有 Library/Storage 测试继续覆盖项目引用保护、Collection 关联清理和数据迁移。
- `npm run compile`：通过。
- `npm test`：通过，11 个测试文件、39 个测试。
- `npm run build`：通过，生成 Editor、Library、Popup、Background 和 Content Script 产物。

### 真实 Chrome 工作流验收清单

1. 打开网页，连续完成多个真实截图；确认每次自动保存到 Library，成功面板可分别打开 Library 和 Studio。
2. 在成功面板重复点击或模拟消息重试，确认不会产生重复 ClipItem。
3. 在 Library 多选素材，点击“新建项目”，确认进入 Studio 后素材已自动排版且项目只引用 Clip ID。
4. 在 Library 选择素材加入已有项目，重新打开项目，确认新素材恢复且重复加入不会增加第二个图层。
5. 从 Collection 详情创建项目，确认 Collection 中所有素材进入画布并自动排列。
6. 在 Studio 点击品牌入口返回 Library，确认项目上下文和素材详情入口可用；从左侧素材打开 Library 后检查来源和备注。
7. 在 Studio 删除素材图层、在 Library 删除项目，确认原始 ClipItem、Collection 和其他项目仍保留。
8. 从素材详情打开原始网页，确认使用真实来源 URL 新开标签页。
9. 刷新/关闭并重新打开 Library 与 Studio，确认 URL 中的 `clipId`/`projectId` 能恢复对应上下文。

### 遗留问题

- 捕获幂等键只在 Background Service Worker 生命周期内缓存；浏览器重启后同一用户主动重复截图仍会生成新素材，这是预期的独立剪藏行为。
- 捕获成功面板目前是 Overlay 内轻量操作条，后续可替换为统一扩展页面通知组件。
- 尚未进行 Phase 3.4 级别的虚拟列表和大规模素材库性能优化。

## Phase 3.4 · Performance & Storage（第一轮）

### 实施方案

- 审查确认 v3 的 `listClips()` 会把全部原始 Blob 读入 Library；本轮将原图和缩略图拆到新的 `clipBlobs` store，`clips` store 只保存元数据。
- IndexedDB 从 v3 升级到 v4。升级事务会把旧 `clips.imageBlob` 原子移动到 `clipBlobs`，成功前不会删除旧记录，失败会整体回滚；项目、标签和 Collection store 保持不变。
- 新截图在 Capture 阶段生成最大 320px 的 WebP 缩略图；旧素材第一次在 Library 预览时按需生成并回写缩略图，不复制原始 Blob。
- Library 使用元数据列表、缩略图缓存和 IntersectionObserver 增量渲染，每次只挂载 80 个卡片；原始图片只在详情面板按需加载。
- Blob URL 由缩略图缓存统一管理，页面卸载时释放缓存 URL；详情原图 URL 在组件卸载时释放。
- Blob 读取队列限制为 4 个并发任务，避免大批素材同时解码。
- Studio 的素材面板使用缩略图；Konva 只为当前项目中可见图片加载原图，导出对话框只读取项目引用的原图。

### 存储与完整性

- 新增存储统计：素材、项目、Collection、标签数量、原图/缩略图字节数、Blob 数量和 `navigator.storage.estimate()` 配额信息。
- Library 提供存储检查入口；配额超过 85% 时显示存储不足提醒。
- 完整性检查覆盖缺失 Blob、孤立 Blob、项目失效素材引用和 Collection 失效引用。
- 安全修复只清理失效 Collection Clip ID 与封面，不自动删除原始 Blob，不自动删除项目图层；孤立 Blob 只报告不删除。

### 文件变更

- `src/types/capture.ts`：增加 `ClipItemSummary`、`ClipBlobRecord` 和缩略图字段。
- `src/modules/storage/clipStore.ts`：v4 迁移、元数据查询、按需 Blob 查询、缩略图写入和元数据更新。
- `src/modules/media/blobPreview.ts`：缩略图生成、缓存、并发队列和 URL 生命周期管理。
- `src/modules/storage/integrity.ts`：存储统计、完整性扫描和安全修复。
- `src/components/library/LibraryShell.tsx`：元数据优先、增量渲染、存储状态入口。
- `src/components/editor/AssetPanel.tsx`、`StudioViewport.tsx`、`ExportDialog.tsx`：缩略图/项目原图按需加载。
- `tests/performance-scale.test.ts`：100、500、1000 条素材规模验证。

### 性能测试数据

在 fake-indexeddb + jsdom 中，元数据列表查询耗时如下（不读取原始图片字段）：

| 素材数 | 元数据列表耗时 |
| ---: | ---: |
| 100 | 1.5 ms |
| 500 | 5.4 ms |
| 1000 | 11.1 ms |

测试同时验证列表记录不包含 `imageBlob`，Blob 记录数量与素材数量一致。真实 Chrome 的首屏、滚动和内存数据仍需手动测量。

### 第一轮验证结果

- `npm run compile`：通过。
- `npm test`：通过，12 个测试文件、42 个测试。
- `npm run build`：通过，生成 Editor、Library、Popup、Background、Content Script 和 `blobPreview` bundle。
- 新增迁移测试验证 v3 旧记录的 Blob 被移动到 `clipBlobs`，`getClip()` 仍能恢复完整 ClipItem。
- 新增完整性测试验证失效 Collection 关联报告与安全修复。

### 第一轮遗留问题

- 当前增量渲染按 80 条批次加载，尚未实现真正的 DOM 回收式虚拟列表；后续可在素材量更大时替换为窗口化列表。
- fake-indexeddb 对 Blob 的 `size` 表现不完全等同 Chrome，字节统计需要在真实浏览器中复核。
- 旧素材缩略图在首次展示时生成，首次访问仍可能短暂读取原图；生成后会持久化并进入缓存。
- 版本化 ZIP 备份与恢复系统尚未开始，留待 Phase 3.4 第二轮。

## Phase 3.4 · Performance & Storage（第二轮：Backup & Recovery）

### 备份格式

- IndexedDB 从 v4 安全升级到 v5。v5 新增 `restoreMeta`、`restoreClips`、`restoreClipBlobs`、`restoreProjects`、`restoreTags`、`restoreCollections` 暂存 object store；原有五个主 store 和 v3/v4 数据迁移逻辑保持不变。
- 备份使用版本化 ZIP（Backup Format v1），不把图片转成 Base64。ZIP 使用无压缩 Store 条目，图片按单个 Blob 读取并写入，避免一次性加载整个素材库。
- 文件布局：`manifest.json`、`clips/{id}.json`、`blobs/{id}/original`、`blobs/{id}/thumbnail`、`projects/{id}.json`、`tags/{id}.json`、`collections/{id}.json`。
- Manifest 包含备份时间、应用版本、Schema 版本、素材/项目/标签/Collection/Blob 数量，以及每个文件的路径、类型、ID、字节数、MIME 和 SHA-256。恢复前先验证格式、版本、路径和数量，再逐文件验证大小与 SHA-256。

### 恢复安全机制

- Full Restore 开始前先生成当前数据库的安全备份 Blob；解压、解析、校验和写入 staging 均使用短事务，不在长时间异步 ZIP 读取期间持有 IndexedDB 事务。
- 所有文件通过校验后才进入单个提交事务。提交事务清空主 `clips`、`clipBlobs`、`projects`、`tags`、`collections`，再从 staging 游标逐条复制；任意错误会触发事务 abort，主数据保持原状。
- 取消、版本不兼容、文件缺失、SHA-256 不匹配和引用失效都会在提交前清理 staging 并拒绝恢复；不会自动删除用户原始素材。
- 恢复后验证项目图片图层和 Collection 成员/封面引用的 Clip ID 均存在；恢复只引用 ClipItem ID，不复制图片到项目或 Collection。
- Merge Restore 本轮只完成设计：需要为 ClipItem、Project、Tag、Collection 建立旧 ID → 新 ID 映射，并同步重写项目图层、Collection 成员和封面引用；在缺少完整事务合并策略前暂不实现，避免产生半合并数据。

### UI 与文件变更

- 新增独立 `data.html` Data Management 页面：Export Backup、ZIP 预览（版本/数量/时间）、Full Restore、取消、Storage Usage、Integrity Check 和安全 Collection 修复入口。
- Library 顶部增加“数据管理”入口；页面使用现有深色渐变、卡片和按钮视觉体系。
- 新增 `src/modules/backup/zip.ts`（CRC32、ZIP Store 写入/解析、Blob 分块读取、SHA-256）、`src/modules/backup/backupService.ts`（Manifest、导出、预览、Full Restore）和 `src/modules/storage/restoreStore.ts`（staging 与原子提交）。

### 自动化验证

- 新增 `tests/backup.test.ts`，覆盖：版本化 ZIP 与 Manifest、原图/缩略图文件、SHA-256 字段、项目 Annotation/Redaction、Tag/Collection 关联、完整恢复、当前数据替换、损坏备份拒绝及失败后原数据保留。
- `npm run compile`：通过。
- `npm test`：通过，13 个测试文件、45 个测试。
- `npm run build`：通过；生成 `data.html`、`editor.html`、`library.html`、`popup.html` 及 MV3 Background/Content Script 产物。

### 真实 Chrome 手动验收清单

1. 在已有 v4 数据上打开 Data Management，确认 Storage Usage、素材/项目数量和 Integrity Check 可读，原有 Library/Studio 数据不变。
2. 导出 ZIP，使用系统解压工具确认包含 `manifest.json`、`clips`、`blobs`、`projects`、`tags`、`collections`，图片文件不是 JSON Base64；检查 Manifest 中 SHA-256 和数量。
3. 选择导出的 ZIP，确认恢复前预览数量、Schema 和时间；执行 Full Restore，观察进度后刷新 Library、Projects 和 Studio，确认图片、缩略图、标签、Collection、Annotation、Redaction 与原状态一致。
4. 在 ZIP 中替换或修改一个 Blob 后恢复，确认校验失败且现有素材库仍完整；恢复中点击取消，确认没有半恢复状态。
5. 在恢复前创建一个额外素材，执行恢复后确认它被备份前数据替换；检查恢复过程中的安全备份可用于后续恢复。
6. 使用大尺寸图片和 100/500/1000 素材规模导出/恢复，观察页面响应、内存峰值、进度更新和 Blob URL 是否正常释放。

### 遗留问题

- 当前 ZIP 使用 Store（无压缩）格式以优先保证流式分块和稳定性；后续可增加 Deflate 读取/写入，但不能改变 Manifest 校验协议。
- 恢复服务生成的安全备份现在由 Data Management 页面在提交恢复前自动下载为 `*-before-restore.zip`；后续可再增加备份历史列表和保留策略。
- Merge Restore 只完成 ID 映射与引用重写设计，尚未开放 UI。
- 真实 Chrome 的超大 Blob 内存峰值、磁盘配额和恢复耗时仍需按清单手动测量。
## Phase 4.1.1：Clip Board / Continuous Capture Mode

### 已完成

- Clip Studio 顶部增加“剪藏到此项目”入口，可启动或退出 Project Capture Mode。
- 项目上下文通过 `browser.storage.local` 持久化，包含 `projectId`、独立 `sessionId`、启动时间和 24 小时 TTL，并按浏览器 `windowId` 隔离；Service Worker 挂起后可恢复，过期上下文会自动清理。
- Background 在每次截图启动时验证目标项目并把上下文传给 Capture Overlay；截图完成时再次校验 sessionId，模式退出或切换后不会静默写入其他项目。
- 每次截图先保存 ClipItem，再调用现有 `addClipsToProject` 自动排版并以 ClipItem ID 建立引用。目标项目被删除时素材仍保留在 Library，并明确提示用户。
- Capture Overlay 在项目模式下提供“继续截图 / 打开项目 / 退出模式”，Popup 显示当前剪藏目标与退出入口。
- captureId 账本同时保存到扩展本地存储并带 10 分钟清理窗口，补足 Service Worker 重启后的重复投递保护；IndexedDB v5 未升级。

### 自动化验证

- `tests/project-capture.test.ts` 覆盖上下文 TTL、session 隔离、连续保存与项目关联、项目失效降级、重复项目图层去重和 capture ledger 清理。
- `npm run compile`：通过。
- `npm test`：通过，14 个测试文件、50 个测试。
- `npm run build`：通过，生成 `data.html`、`editor.html`、`library.html`、`popup.html` 及 MV3 Background/Content Script 产物。

### 待真实 Chrome 验收

- Studio 启动模式后切换网页连续截图 5 次并返回项目。
- Popup 关闭、标签页切换、Service Worker 挂起/唤醒后的上下文恢复。
- 重复 captureId 的真实消息重投递和项目删除竞态。
- 退出模式后执行普通截图，确认不再自动加入旧项目。

## Phase 4.1.2 / 4.1.3：Real Browser Acceptance 准备

- 新增正式测试矩阵、环境记录模板和缺陷记录模板：`docs/PHASE4_BROWSER_ACCEPTANCE.md`、`docs/PHASE4_BUG_TRACKER.md`。
- 修复多窗口项目剪藏上下文覆盖风险：上下文按 `window:<windowId>` 保存，写入串行化；旧扩展级上下文只迁移到首次读取它的窗口。
- syntheticDataset 仅允许在 jsdom + fake-indexeddb 中生成和清理 100/500/1000 素材，真实 Chrome 不调用清理函数。
- 本地自动化仍覆盖 14 个测试文件、50 个测试；真实 Chrome、Shadow DOM、跨域 iframe、DPR/缩放、Service Worker 重启和大规模性能均保持“未执行”。
