import { useEffect, useRef, useState } from 'react';
import type { ClipProject, EditorTool } from '../../types/editor';
import { normalizeProjectName } from '../../modules/projects/projectName';

interface EditorToolbarProps {
  project: ClipProject;
  projects: ClipProject[];
  status: string;
  canUndo: boolean;
  canRedo: boolean;
  activeTool: EditorTool;
  onTool: (tool: EditorTool) => void;
  onOpenProject: (id: string) => void;
  onNewProject: () => void;
  onRenameProject: (name: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onAddAsset: () => void;
  onAutoLayout: () => void;
  onToggleLayout: () => void;
  onBackground: (value: string) => void;
  onGradient: () => void;
  onExport: () => void;
  onOpenLibrary: () => void;
  projectCaptureActive: boolean;
  projectCaptureName?: string;
  onStartProjectCapture: () => void;
  onStopProjectCapture: () => void;
}

const tools: Array<{ id: EditorTool; label: string; title: string }> = [
  { id: 'select', label: '选择', title: '选择 / 移动 / 变换' },
  { id: 'text', label: '文字', title: '文字标注' },
  { id: 'arrow', label: '箭头', title: '箭头标注' },
  { id: 'line', label: '直线', title: '直线标注' },
  { id: 'rectangle', label: '矩形', title: '矩形标注' },
  { id: 'ellipse', label: '椭圆', title: '椭圆标注' },
  { id: 'drawing', label: '画笔', title: '自由画笔' },
  { id: 'highlight', label: '高亮', title: '高亮区域' },
  { id: 'redact-blur', label: '模糊', title: '真实像素模糊遮挡' },
  { id: 'redact-pixelate', label: '像素', title: '真实像素化遮挡' },
  { id: 'redact-solid', label: '遮挡', title: '实色遮挡' },
];

export function EditorToolbar(props: EditorToolbarProps): React.JSX.Element {
  const background = typeof props.project.canvas.background === 'string' && props.project.canvas.background.startsWith('#') ? props.project.canvas.background : '#f8fafc';
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(props.project.name);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const skipBlurCommitRef = useRef(false);
  useEffect(() => { if (!editingName) setDraftName(props.project.name); }, [editingName, props.project.name]);
  useEffect(() => { if (editingName) nameInputRef.current?.focus(); }, [editingName]);
  const commitName = () => { const name = normalizeProjectName(draftName); if (name) props.onRenameProject(name); setEditingName(false); };
  const cancelName = () => { skipBlurCommitRef.current = true; setDraftName(props.project.name); setEditingName(false); queueMicrotask(() => { skipBlurCommitRef.current = false; }); };
  return <header className="editor-toolbar">
    <button className="studio-brand studio-brand-button" onClick={props.onOpenLibrary} title="返回 Clip Library"><span className="studio-mark">L</span><span>Clip Studio</span></button>
    <div className="project-switcher"><select aria-label="打开项目" value={props.project.id} onChange={(event) => props.onOpenProject(event.target.value)}>{props.projects.map((project) => <option key={project.id} value={project.id}>{project.name || '未命名项目'}</option>)}</select>{editingName ? <input ref={nameInputRef} className="project-name-input" value={draftName} onChange={(event) => setDraftName(event.target.value)} onBlur={() => { if (!skipBlurCommitRef.current) commitName(); }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitName(); } if (event.key === 'Escape') { event.preventDefault(); cancelName(); } }} aria-label="项目名称" /> : <button className="project-name-button" onClick={() => setEditingName(true)} title="重命名项目">{props.project.name || '未命名项目'}</button>}<button className="toolbar-button subtle" onClick={props.onNewProject}>新项目</button><button className={`toolbar-button capture-project-button ${props.projectCaptureActive ? 'active' : ''}`} onClick={props.projectCaptureActive ? props.onStopProjectCapture : props.onStartProjectCapture} title={props.projectCaptureActive ? `退出「${props.projectCaptureName ?? props.project.name}」项目剪藏` : '连续截图并自动加入当前项目'}>{props.projectCaptureActive ? '退出剪藏' : '剪藏到此项目'}</button></div>
    <div className="toolbar-spacer" />
    <div className="tool-group" aria-label="标注工具">{tools.map((tool) => <button key={tool.id} className={`tool-button ${props.activeTool === tool.id ? 'active' : ''}`} title={tool.title} onClick={() => props.onTool(tool.id)}>{tool.label}</button>)}</div>
    <button className="toolbar-button" onClick={props.onUndo} disabled={!props.canUndo}>撤销</button>
    <button className="toolbar-button" onClick={props.onRedo} disabled={!props.canRedo}>重做</button>
    <button className="toolbar-button" onClick={props.onAddAsset}>添加素材</button>
    <button className="toolbar-button" onClick={props.onAutoLayout}>自动排版</button>
    <button className={`toolbar-button ${props.project.canvas.layoutMode === 'free' ? 'active' : ''}`} onClick={props.onToggleLayout}>{props.project.canvas.layoutMode === 'free' ? '自由布局' : '自动布局'}</button>
    <label className="background-picker" title="画布背景颜色"><span className="color-dot" style={{ background }} /><input type="color" value={background} onChange={(event) => props.onBackground(event.target.value)} aria-label="画布背景颜色" /></label>
    <button className="toolbar-button subtle" onClick={props.onGradient}>渐变</button>
    <button className="toolbar-button export-button" onClick={props.onExport}>导出</button>
    <span className={`save-indicator ${props.status === '错误' ? 'error' : ''}`}><i />{props.status}</span>
  </header>;
}
