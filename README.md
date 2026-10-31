# LassoClip

LassoClip 是基于 WXT + React + TypeScript 的 Manifest V3 网页视觉剪藏扩展。当前实现覆盖 Phase 0/1 截图核心和 Phase 2 Clip Studio：冻结当前视口、自由手绘/多边形/矩形/椭圆/DOM 元素选区、DPR/页面缩放坐标映射、Canvas 真实 Alpha 裁剪、PNG 剪贴板复制、IndexedDB 项目持久化，以及 Konva 多选变换、图层管理和画布视口交互。

## 开发

```bash
npm install
npm run dev       # WXT 开发模式
npm run compile   # TypeScript 严格检查
npm test          # 核心几何、坐标、Alpha 测试
npm run build     # 生成 .output/chrome-mv3
```

在 Chrome 中打开 `chrome://extensions`，启用“开发者模式”，选择“加载已解压的扩展”，目录选择 `.output/chrome-mv3`。在普通网页点击扩展图标中的“开始截图”，或使用 `Alt+Shift+L`、网页右键菜单启动。

## 当前边界

- 只捕获当前可见视口，不做整页截图。
- `chrome://`、Chrome Web Store 等受保护页面不能注入覆盖层，会显示错误反馈。
- 完整标注系统、敏感信息遮挡像素导出、Phase 3 的 Library UI 以及后续 OCR/导出格式仍在后续计划中；Clip Studio 当前已完成 Phase 2.3 画布交互。
