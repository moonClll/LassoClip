import type { ClipProject } from '../../types/editor';

interface EditorToolbarProps {
  project: ClipProject;
  projects: ClipProject[];
  status: string;
  canUndo: boolean;
  canRedo: boolean;
  onOpenProject: (id: string) => void;
  onNewProject: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onAddAsset: () => void;
  onAutoLayout: () => void;
  onToggleLayout: () => void;
  onBackground: (value: string) => void;
  onExport: () => void;
}

export function EditorToolbar(props: EditorToolbarProps): React.JSX.Element {
  const background = typeof props.project.canvas.background === 'string' && props.project.canvas.background.startsWith('#')
    ? props.project.canvas.background
    : '#f8fafc';
  return (
    <header className="editor-toolbar">
      <div className="studio-brand"><span className="studio-mark">L</span><span>Clip Studio</span></div>
      <div className="project-switcher">
        <select aria-label="打开项目" value={props.project.id} onChange={(event) => props.onOpenProject(event.target.value)}>
          {props.projects.map((project) => <option key={project.id} value={project.id}>{project.name || '未命名项目'}</option>)}
        </select>
        <button className="toolbar-button subtle" onClick={props.onNewProject}>新项目</button>
      </div>
      <div className="toolbar-spacer" />
      <button className="toolbar-button" onClick={props.onUndo} disabled={!props.canUndo}>撤销</button>
      <button className="toolbar-button" onClick={props.onRedo} disabled={!props.canRedo}>重做</button>
      <button className="toolbar-button" onClick={props.onAddAsset}>添加素材</button>
      <button className="toolbar-button" onClick={props.onAutoLayout}>自动排版</button>
      <button className={`toolbar-button ${props.project.canvas.layoutMode === 'free' ? 'active' : ''}`} onClick={props.onToggleLayout}>{props.project.canvas.layoutMode === 'free' ? '自由布局' : '自动布局'}</button>
      <label className="background-picker" title="画布背景">
        <span className="color-dot" style={{ background: background }} />
        <input type="color" value={background} onChange={(event) => props.onBackground(event.target.value)} aria-label="画布背景颜色" />
      </label>
      <button className="toolbar-button export-button" onClick={props.onExport}>导出 PNG</button>
      <span className={`save-indicator ${props.status === 'error' ? 'error' : ''}`}><i />{props.status}</span>
    </header>
  );
}
