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
import { promptProjectName } from '../../modules/projects/projectName';
import { defaultToolStyle } from '../../modules/canvas-editor/toolStyle';
import type { AnnotationStyle } from '../../types/editor';
import '../../styles/editor.css';

export function EditorShell(): React.JSX.Element {
  const [leftTab, setLeftTab] = useState<'assets' | 'layers'>('assets');
  const [inspectorOpen, setInspectorOpen] = useState(() => window.innerWidth >= 1100);
  const project = useEditorStore((state) => state.project);
  const clips = useEditorStore((state) => state.clips);
  const selectedIds = useEditorStore((state) => state.selectedIds);
  const status = useEditorStore((state) => state.status);
  const error = useEditorStore((state) => state.error);
  const history = useEditorStore((state) => state.history);
  const future = useEditorStore((state) => state.future);
  const load = useEditorStore((state) => state.load);
  const createNew = useEditorStore((state) => state.createNew);
  const renameProject = useEditorStore((state) => state.renameProject);
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
      if (event.defaultPrevented || target?.closest('input, textarea, select, button, [role="dialog"]') || target?.isContentEditable) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); }
      else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); }
      else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); removeSelected(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [redo, undo, removeSelected]);
  const [projects, setProjects] = useState<ClipProject[]>([]);
  const [activeTool, setActiveTool] = useState<EditorTool>('select');
  const [toolStyles, setToolStyles] = useState<Partial<Record<EditorTool, AnnotationStyle>>>({});
  const toolStyle = toolStyles[activeTool] ?? defaultToolStyle(activeTool);
  const [exportOpen, setExportOpen] = useState(false);
  const [projectCaptureActive, setProjectCaptureActive] = useState(false);
  const [projectCaptureProjectId, setProjectCaptureProjectId] = useState<string | undefined>();
  const [projectCaptureName, setProjectCaptureName] = useState<string | undefined>();
  const [captureNotice, setCaptureNotice] = useState<string | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const projectId = useMemo(() => new URLSearchParams(window.location.search).get('projectId') ?? undefined, []);

  const refreshProjects = async () => setProjects(await listProjects());
  useEffect(() => { void load(projectId); }, [load, projectId]);
  useEffect(() => { void refreshProjects(); }, [project?.id, project?.updatedAt]);
  useEffect(() => {
    void browser.runtime.sendMessage({ type: 'project-capture:status' }).then((result) => {
      const value = result as { active?: boolean; projectName?: string; projectId?: string; context?: { projectId?: string }; error?: string } | undefined;
      setProjectCaptureActive(Boolean(value?.active));
      setProjectCaptureName(value?.projectName);
      setProjectCaptureProjectId(value?.projectId ?? value?.context?.projectId);
      if (value?.error) setCaptureNotice(value.error);
    }).catch(() => undefined);
  }, [project?.id]);
  useEffect(() => {
    if (!project || status !== 'ready') return;
    const timer = window.setTimeout(() => void save(), 500);
    return () => window.clearTimeout(timer);
  }, [project?.updatedAt, save, status]);

  if (status === 'error' && !project) return <main className="editor-state error-state"><h1>项目暂时无法打开</h1><p>{error}</p><button onClick={() => void load(projectId)}>重试</button></main>;
  if (status === 'loading' || !project) return <main className="editor-state"><div className="state-orb">L</div><h1>正在打开编辑器</h1><p>正在读取本地项目与剪藏素材…</p></main>;
  const selected = selectedEntity(project, selectedIds);
  const toggleLayout = () => setLayoutMode(project.canvas.layoutMode === 'auto' ? 'free' : 'auto');
  const focusAssets = () => { setLeftTab('assets'); requestAnimationFrame(() => document.querySelector<HTMLElement>('.asset-panel')?.scrollIntoView({ block: 'nearest' })); };
  const setGradient = () => setBackground({ type: 'linear-gradient', value: 'linear-gradient(135deg, #f8fafc, #c4b5fd)' });
  const startProjectCapture = async () => {
    setCaptureNotice('正在启动项目剪藏模式…');
    try {
      const result = await browser.runtime.sendMessage({ type: 'project-capture:start', projectId: project.id }) as { ok?: boolean; message?: string; projectName?: string } | undefined;
      if (!result?.ok) { setCaptureNotice(result?.message ?? '项目剪藏模式启动失败'); return; }
      setProjectCaptureActive(true); setProjectCaptureProjectId(project.id); setProjectCaptureName(result.projectName ?? project.name); setCaptureNotice(`已进入项目剪藏模式：${result.projectName ?? project.name}。切换到网页后点击扩展图标即可连续截图。`);
    } catch (error) { setCaptureNotice(error instanceof Error ? error.message : '项目剪藏模式启动失败'); }
  };
  const stopProjectCapture = async () => {
    await browser.runtime.sendMessage({ type: 'project-capture:stop' });
    setProjectCaptureActive(false); setProjectCaptureProjectId(undefined); setProjectCaptureName(undefined); setCaptureNotice('已退出项目剪藏模式，后续截图不会自动加入项目。');
  };
  const createNamedProject = () => {
    const name = promptProjectName();
    if (name) void createNew(name).then(refreshProjects);
  };
  const renameCurrentProject = async (name: string): Promise<void> => {
    await renameProject(name);
    if (projectCaptureProjectId === project.id) setProjectCaptureName(name);
    await refreshProjects();
  };
  return <main className="editor-app">
    <EditorToolbar project={project} projects={projects} status={status === 'saving' ? '保存中' : error ? '错误' : '已保存'} canUndo={history.length > 0} canRedo={future.length > 0} activeTool={activeTool} toolStyle={toolStyle} onTool={setActiveTool} onOpenProject={(id) => void load(id)} onNewProject={createNamedProject} onRenameProject={(name) => void renameCurrentProject(name)} onUndo={undo} onRedo={redo} onAddAsset={focusAssets} onAutoLayout={autoLayout} onToggleLayout={toggleLayout} onBackground={setBackground} onGradient={setGradient} onExport={() => setExportOpen(true)} onOpenLibrary={() => void browser.tabs.create({ url: browser.runtime.getURL(`/library.html?projectId=${encodeURIComponent(project.id)}` as never) })} projectCaptureActive={projectCaptureActive && projectCaptureProjectId === project.id} projectCaptureName={projectCaptureName} onStartProjectCapture={() => void startProjectCapture()} onStopProjectCapture={() => void stopProjectCapture()} inspectorOpen={inspectorOpen} onToggleInspector={() => setInspectorOpen((open) => !open)} onToolStyle={(style) => setToolStyles((current) => ({ ...current, [activeTool]: style }))} />
    {(error || captureNotice) && <div className="editor-alert">{error ?? captureNotice}</div>}
    <div className={`editor-grid ${inspectorOpen ? '' : 'inspector-hidden'}`}>
      <aside className="left-rail"><div className="rail-tabs" role="tablist" aria-label="编辑器侧栏"><button id="assets-tab" role="tab" aria-selected={leftTab === 'assets'} aria-controls="assets-panel" onClick={() => setLeftTab('assets')}>素材</button><button id="layers-tab" role="tab" aria-selected={leftTab === 'layers'} aria-controls="layers-panel" onClick={() => setLeftTab('layers')}>图层</button></div><div id="assets-panel" role="tabpanel" aria-labelledby="assets-tab" hidden={leftTab !== 'assets'}><AssetPanel clips={clips} project={project} onAdd={addClip} /></div><div id="layers-panel" role="tabpanel" aria-labelledby="layers-tab" hidden={leftTab !== 'layers'}><LayerPanel project={project} clips={clips} selectedIds={selectedIds} onSelect={select} onDelete={removeSelected} onDuplicate={duplicateSelected} onReorder={reorder} onVisibility={setItemVisibility} onLock={setItemLocked} onRename={renameItem} /></div></aside>
      <StudioViewport project={project} clips={clips} selectedIds={selectedIds} activeTool={activeTool} toolStyle={toolStyle} onTool={setActiveTool} onSelect={select} onUpdateItems={updateItems} onAddAnnotation={addAnnotation} onUpdateAnnotation={updateAnnotation} onUpdateAnnotations={updateAnnotations} onAddRedaction={addRedaction} onUpdateRedaction={updateRedaction} onUpdateRedactions={updateRedactions} onSetViewport={setViewport} onStageReady={(stage) => { stageRef.current = stage; }} />
      <aside id="editor-inspector" className="editor-inspector" hidden={!inspectorOpen}><InspectorPanel project={project} clips={clips} selectedLayer={selected} onUpdateItem={updateItem} onUpdateItemStyle={updateItemStyle} onUpdateAnnotation={updateAnnotation} onUpdateRedaction={updateRedaction} /></aside>
    </div>
    {exportOpen && <ExportDialog project={project} clips={clips} onClose={() => setExportOpen(false)} />}
  </main>;
}
