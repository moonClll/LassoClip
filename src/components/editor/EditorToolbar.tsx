import { AnnotationStyleControls } from './AnnotationStyleControls';
import { isAnnotationTool } from '../../modules/canvas-editor/toolStyle';
import { useEffect, useRef, useState } from 'react';
import type { AnnotationStyle, AnnotationType, ClipProject, EditorTool } from '../../types/editor';
import { normalizeProjectName } from '../../modules/projects/projectName';
import { Icon, type IconName } from '../Icon';

interface EditorToolbarProps {
  project: ClipProject;
  projects: ClipProject[];
  status: string;
  canUndo: boolean;
  canRedo: boolean;
  activeTool: EditorTool;
  toolStyle: AnnotationStyle;
  onToolStyle: (style: AnnotationStyle) => void;
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
  inspectorOpen: boolean;
  onToggleInspector: () => void;
}

const tools: Array<{ id: EditorTool; label: string; title: string; icon: IconName }> = [
  { id: 'select', label: '选择', title: '选择 / 移动 / 变换', icon: 'select' },
  { id: 'text', label: '文字', title: '文字标注', icon: 'text' },
  { id: 'arrow', label: '箭头', title: '箭头标注', icon: 'arrow' },
  { id: 'line', label: '直线', title: '直线标注', icon: 'line' },
  { id: 'rectangle', label: '矩形', title: '矩形标注', icon: 'rectangle' },
  { id: 'ellipse', label: '椭圆', title: '椭圆标注', icon: 'ellipse' },
  { id: 'drawing', label: '画笔', title: '自由画笔', icon: 'pen' },
  { id: 'highlight', label: '高亮', title: '高亮区域', icon: 'highlight' },
  { id: 'redact-blur', label: '模糊', title: '像素模糊遮挡', icon: 'shield' },
  { id: 'redact-pixelate', label: '像素化', title: '像素化遮挡', icon: 'shield' },
  { id: 'redact-solid', label: '实色遮挡', title: '实色遮挡', icon: 'shield' },
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
  const shapeTools = tools.filter((tool) => ['arrow', 'line', 'rectangle', 'ellipse'].includes(tool.id));
  const redactionTools = tools.filter((tool) => tool.id.startsWith('redact-'));
  const groupedTool = (label: string, icon: IconName, group: typeof tools) => {
    const selected = group.some((tool) => tool.id === props.activeTool);
    return <label className={`tool-select ${selected ? 'active' : ''}`}><Icon name={icon} /><select aria-label={label} value={selected ? props.activeTool : ''} onChange={(event) => props.onTool(event.target.value as EditorTool)}><option value="" disabled>{label}</option>{group.map((tool) => <option key={tool.id} value={tool.id}>{tool.label}</option>)}</select></label>;
  };
  return <>
    <header className="editor-toolbar">
      <button className="studio-brand studio-brand-button" onClick={props.onOpenLibrary} title="返回素材库"><span className="studio-mark">L</span><span>编辑器</span></button>
      <div className="project-switcher"><select aria-label="打开项目" value={props.project.id} onChange={(event) => props.onOpenProject(event.target.value)}>{!props.projects.some((project) => project.id === props.project.id) && <option value={props.project.id}>{props.project.name || '未命名项目'}</option>}{props.projects.map((project) => <option key={project.id} value={project.id}>{project.name || '未命名项目'}</option>)}</select>{editingName ? <input ref={nameInputRef} className="project-name-input" value={draftName} onChange={(event) => setDraftName(event.target.value)} onBlur={() => { if (!skipBlurCommitRef.current) commitName(); }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitName(); } if (event.key === 'Escape') { event.preventDefault(); cancelName(); } }} aria-label="项目名称" /> : <button className="toolbar-button rename-project" onClick={() => setEditingName(true)} title="重命名当前项目" aria-label="重命名当前项目"><Icon name="edit" /></button>}<button className="toolbar-button" onClick={props.onNewProject}><Icon name="plus" />新项目</button></div>
      <div className="toolbar-spacer" />
      <div className="history-actions"><button className="toolbar-button" onClick={props.onUndo} disabled={!props.canUndo} title="撤销" aria-label="撤销"><Icon name="undo" /></button><button className="toolbar-button" onClick={props.onRedo} disabled={!props.canRedo} title="重做" aria-label="重做"><Icon name="redo" /></button></div>
      <span className={`save-indicator ${props.status === '错误' ? 'error' : ''}`} role="status"><i />{props.status}</span>
      <button className={`toolbar-button capture-project-button ${props.projectCaptureActive ? 'active' : ''}`} onClick={props.projectCaptureActive ? props.onStopProjectCapture : props.onStartProjectCapture} title={props.projectCaptureActive ? `退出「${props.projectCaptureName ?? props.project.name}」项目剪藏` : '连续截图并自动加入当前项目'}><Icon name="capture" />{props.projectCaptureActive ? '退出剪藏' : '连续剪藏'}</button>
      <button className="toolbar-button export-button" onClick={props.onExport}><Icon name="download" />导出</button>
    </header>
    <div className="editor-tools-row">
      <div className="tool-group" role="group" aria-label="标注工具">{tools.filter((tool) => ['select', 'text', 'drawing', 'highlight'].includes(tool.id)).map((tool) => <button key={tool.id} className={`tool-button ${props.activeTool === tool.id ? 'active' : ''}`} aria-pressed={props.activeTool === tool.id} title={tool.title} onClick={() => props.onTool(tool.id)}><Icon name={tool.icon} />{tool.label}</button>)}{groupedTool('形状', 'rectangle', shapeTools)}{groupedTool('遮挡', 'shield', redactionTools)}</div>
      <div className="canvas-actions"><button className="toolbar-button" onClick={props.onAddAsset}>添加素材</button><button className="toolbar-button" onClick={props.onAutoLayout}>自动排版</button><button className={`toolbar-button ${props.project.canvas.layoutMode === 'free' ? 'active' : ''}`} onClick={props.onToggleLayout}>{props.project.canvas.layoutMode === 'free' ? '自由布局' : '自动布局'}</button><label className="background-picker" title="画布背景颜色"><input type="color" value={background} onChange={(event) => props.onBackground(event.target.value)} aria-label="画布背景颜色" /></label><button className="toolbar-button" onClick={props.onGradient}>渐变</button></div>
      <button className={`toolbar-button inspector-toggle ${props.inspectorOpen ? 'active' : ''}`} onClick={props.onToggleInspector} aria-expanded={props.inspectorOpen} aria-controls="editor-inspector">属性</button>
    </div>
    {isAnnotationTool(props.activeTool) && <div className="tool-options" role="group" aria-label="当前工具样式"><span className="tool-options-label">{tools.find((tool) => tool.id === props.activeTool)?.label}</span><AnnotationStyleControls type={props.activeTool as AnnotationType} style={props.toolStyle} onChange={props.onToolStyle} /><span className="tool-options-hint">点击或拖动画布以连续添加 · Esc 返回选择</span></div>}
  </>;
}
