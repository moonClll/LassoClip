import { useEffect, useMemo, useRef, useState } from 'react';
import Konva from 'konva';
import { browser } from 'wxt/browser';
import { listProjects } from '../../modules/storage/clipStore';
import { useEditorStore, selectedEntity } from '../../stores/editorStore';
import type { ClipProject, EditorTool } from '../../types/editor';
import { EditorToolbar } from './EditorToolbar';
import { AssetPanel } from './AssetPanel';
import { LayerPanel } from './LayerPanel';
import { InspectorPanel } from './InspectorPanel';
import { StudioViewport } from './StudioViewport';
import { ExportDialog } from './ExportDialog';
import '../../styles/editor.css';

export function EditorShell(): React.JSX.Element {
  const project = useEditorStore((state) => state.project);
  const clips = useEditorStore((state) => state.clips);
  const selectedIds = useEditorStore((state) => state.selectedIds);
  const status = useEditorStore((state) => state.status);
  const error = useEditorStore((state) => state.error);
  const history = useEditorStore((state) => state.history);
  const future = useEditorStore((state) => state.future);
  const load = useEditorStore((state) => state.load);
  const createNew = useEditorStore((state) => state.createNew);
  const save = useEditorStore((state) => state.save);
  const addClip = useEditorStore((state) => state.addClip);
  const updateItem = useEditorStore((state) => state.updateItem);
  const updateItemStyle = useEditorStore((state) => state.updateItemStyle);
  const updateItems = useEditorStore((state) => state.updateItems);
  const addAnnotation = useEditorStore((state) => state.addAnnotation);
  const updateAnnotation = useEditorStore((state) => state.updateAnnotation);
  const updateAnnotations = useEditorStore((state) => state.updateAnnotations);
  const addRedaction = useEditorStore((state) => state.addRedaction);
  const updateRedaction = useEditorStore((state) => state.updateRedaction);
  const updateRedactions = useEditorStore((state) => state.updateRedactions);
  const setViewport = useEditorStore((state) => state.setViewport);
  const select = useEditorStore((state) => state.select);
  const removeSelected = useEditorStore((state) => state.removeSelected);
  const duplicateSelected = useEditorStore((state) => state.duplicateSelected);
  const autoLayout = useEditorStore((state) => state.autoLayout);
  const setLayoutMode = useEditorStore((state) => state.setLayoutMode);
  const setBackground = useEditorStore((state) => state.setBackground);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const reorder = useEditorStore((state) => state.reorder);
  const setItemVisibility = useEditorStore((state) => state.setItemVisibility);
  const setItemLocked = useEditorStore((state) => state.setItemLocked);
  const renameItem = useEditorStore((state) => state.renameItem);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); }
      else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); }
      else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); removeSelected(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [redo, undo, removeSelected]);
  const [projects, setProjects] = useState<ClipProject[]>([]);
  const [activeTool, setActiveTool] = useState<EditorTool>('select');
  const [exportOpen, setExportOpen] = useState(false);
  const stageRef = useRef<Konva.Stage | null>(null);
  const projectId = useMemo(() => new URLSearchParams(window.location.search).get('projectId') ?? undefined, []);

  const refreshProjects = async () => setProjects(await listProjects());
  useEffect(() => { void load(projectId); }, [load, projectId]);
  useEffect(() => { void refreshProjects(); }, [project?.id, project?.updatedAt]);
  useEffect(() => {
    if (!project || status !== 'ready') return;
    const timer = window.setTimeout(() => void save(), 500);
    return () => window.clearTimeout(timer);
  }, [project?.updatedAt, save, status]);

  if (status === 'error' && !project) return <main className="editor-state error-state"><h1>项目暂时无法打开</h1><p>{error}</p><button onClick={() => void load(projectId)}>重试</button></main>;
  if (status === 'loading' || !project) return <main className="editor-state"><div className="state-orb">L</div><h1>正在打开 Clip Studio</h1><p>正在读取本地项目与剪藏素材…</p></main>;
  const selected = selectedEntity(project, selectedIds);
  const toggleLayout = () => setLayoutMode(project.canvas.layoutMode === 'auto' ? 'free' : 'auto');
  const focusAssets = () => document.querySelector<HTMLElement>('.asset-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const setGradient = () => setBackground({ type: 'linear-gradient', value: 'linear-gradient(135deg, #f8fafc, #c4b5fd)' });
  return <main className="editor-app">
    <EditorToolbar project={project} projects={projects} status={status === 'saving' ? '保存中' : error ? '错误' : '已保存'} canUndo={history.length > 0} canRedo={future.length > 0} activeTool={activeTool} onTool={setActiveTool} onOpenProject={(id) => void load(id)} onNewProject={() => void createNew().then(refreshProjects)} onUndo={undo} onRedo={redo} onAddAsset={focusAssets} onAutoLayout={autoLayout} onToggleLayout={toggleLayout} onBackground={setBackground} onGradient={setGradient} onExport={() => setExportOpen(true)} onOpenLibrary={() => void browser.tabs.create({ url: browser.runtime.getURL(`/library.html?projectId=${encodeURIComponent(project.id)}` as never) })} />
    {error && <div className="editor-alert">{error}</div>}
    <div className="editor-grid">
      <aside className="left-rail"><AssetPanel clips={clips} project={project} onAdd={addClip} /><LayerPanel project={project} clips={clips} selectedIds={selectedIds} onSelect={select} onDelete={removeSelected} onDuplicate={duplicateSelected} onReorder={reorder} onVisibility={setItemVisibility} onLock={setItemLocked} onRename={renameItem} /></aside>
      <StudioViewport project={project} clips={clips} selectedIds={selectedIds} activeTool={activeTool} onTool={setActiveTool} onSelect={select} onUpdateItems={updateItems} onAddAnnotation={addAnnotation} onUpdateAnnotation={updateAnnotation} onUpdateAnnotations={updateAnnotations} onAddRedaction={addRedaction} onUpdateRedaction={updateRedaction} onUpdateRedactions={updateRedactions} onSetViewport={setViewport} onStageReady={(stage) => { stageRef.current = stage; }} />
      <InspectorPanel project={project} clips={clips} selectedLayer={selected} onUpdateItem={updateItem} onUpdateItemStyle={updateItemStyle} onUpdateAnnotation={updateAnnotation} onUpdateRedaction={updateRedaction} />
    </div>
    {exportOpen && <ExportDialog project={project} clips={clips} onClose={() => setExportOpen(false)} />}
  </main>;
}
