import { create } from 'zustand';
import { autoLayoutItems } from '../modules/canvas-editor/autoLayout';
import { reorderProjectLayers } from '../modules/canvas-editor/transform';
import { annotationSelectionId, createDefaultProject, entityIdFromSelection, isAnnotationSelectionId, isRedactionSelectionId, redactionSelectionId, type Annotation, type AnnotationDraft, type CanvasItem, type ClipProject, type ImageCanvasItem, type ProjectLayer, type Redaction } from '../types/editor';
import type { ClipItemSummary } from '../types/capture';
import { createProject, listClipSummaries, listProjects, loadProjectWithClips, saveProject } from '../modules/storage/clipStore';
import { DEFAULT_PROJECT_NAME, normalizeProjectName } from '../modules/projects/projectName';

type EditorStatus = 'idle' | 'loading' | 'ready' | 'saving' | 'error';

interface EditorState {
  project: ClipProject | null;
  clips: ClipItemSummary[];
  selectedIds: string[];
  status: EditorStatus;
  error: string | null;
  history: ClipProject[];
  future: ClipProject[];
  load: (projectId?: string) => Promise<void>;
  createNew: (name?: string) => Promise<void>;
  renameProject: (name: string) => Promise<boolean>;
  save: () => Promise<void>;
  addClip: (clip: ClipItemSummary) => void;
  removeSelected: () => void;
  removeLayers: (ids: string[]) => void;
  duplicateSelected: () => void;
  addAnnotation: (annotation: AnnotationDraft) => void;
  addRedaction: (redaction: Omit<Redaction, 'id' | 'zIndex'>) => void;
  updateAnnotation: (id: string, patch: Partial<Annotation>) => void;
  updateAnnotations: (updates: Array<{ id: string; patch: Partial<Annotation> }>) => void;
  updateRedaction: (id: string, patch: Partial<Redaction>) => void;
  updateRedactions: (updates: Array<{ id: string; patch: Partial<Redaction> }>) => void;
  updateItem: (id: string, transform: Partial<CanvasItem['transform']>) => void;
  updateItemStyle: (id: string, style: Partial<Extract<CanvasItem, { type: 'image' }>['style']>) => void;
  updateItems: (updates: Array<{ id: string; transform: Partial<CanvasItem['transform']> }>) => void;
  select: (ids: string[]) => void;
  setViewport: (zoom: number, pan: { x: number; y: number }) => void;
  reorder: (direction: 'up' | 'down' | 'top' | 'bottom') => void;
  setItemVisibility: (id: string, visible: boolean) => void;
  setItemLocked: (id: string, locked: boolean) => void;
  renameItem: (id: string, name: string) => void;
  setLayoutMode: (mode: ClipProject['canvas']['layoutMode']) => void;
  autoLayout: () => void;
  setBackground: (background: ClipProject['canvas']['background']) => void;
  undo: () => void;
  redo: () => void;
}

function commit(current: ClipProject, next: ClipProject, history: ClipProject[], future: ClipProject[]) {
  return {
    project: { ...next, updatedAt: Date.now() },
    history: [...history, current].slice(-50),
    future: future.slice(0, 0),
  };
}

function createImageItem(clip: ClipItemSummary, index: number): ImageCanvasItem {
  const maxWidth = 280;
  const width = Math.min(maxWidth, Math.max(1, clip.metadata.width));
  const height = Math.max(1, Math.round(width * (clip.metadata.height / Math.max(1, clip.metadata.width))));
  return {
    id: crypto.randomUUID(),
    name: clip.name,
    clipId: clip.id,
    type: 'image',
    transform: { x: 40 + index * 20, y: 40 + index * 20, width, height, rotation: 0, opacity: 1 },
    zIndex: index,
    visible: true,
    locked: false,
    style: { cornerRadius: 0 },
  };
}

export const useEditorStore = create<EditorState>((set, get) => ({
  project: null,
  clips: [],
  selectedIds: [],
  status: 'idle',
  error: null,
  history: [],
  future: [],

  load: async (projectId) => {
    set({ status: 'loading', error: null });
    try {
      const projects = await listProjects();
      const targetId = projectId ?? projects[0]?.id;
      if (targetId) {
        const loaded = await loadProjectWithClips(targetId);
        if (loaded) {
          set({ project: loaded.project, clips: await listClipSummaries(), selectedIds: [], history: [], future: [], status: 'ready' });
          return;
        }
      }
      const project = createDefaultProject(DEFAULT_PROJECT_NAME);
      await createProject(project);
      set({ project, clips: await listClipSummaries(), selectedIds: [], history: [], future: [], status: 'ready' });
    } catch (error) {
      set({ status: 'error', error: error instanceof Error ? error.message : '项目加载失败' });
    }
  },

  createNew: async (name = DEFAULT_PROJECT_NAME) => {
    set({ status: 'loading', error: null });
    try {
      const project = createDefaultProject(normalizeProjectName(name) ?? DEFAULT_PROJECT_NAME);
      await createProject(project);
      set({ project, clips: await listClipSummaries(), selectedIds: [], history: [], future: [], status: 'ready' });
    } catch (error) {
      set({ status: 'error', error: error instanceof Error ? error.message : '项目创建失败' });
    }
  },

  renameProject: async (name) => {
    const current = get().project;
    const normalized = normalizeProjectName(name);
    if (!current || !normalized) return false;
    const next = { ...current, name: normalized, updatedAt: Date.now() };
    set({ project: next, status: 'saving', error: null });
    try {
      await saveProject(next);
      set({ status: 'ready' });
      return true;
    } catch (error) {
      set({ project: current, status: 'error', error: error instanceof Error ? error.message : '项目重命名失败' });
      return false;
    }
  },

  save: async () => {
    const project = get().project;
    if (!project) return;
    set({ status: 'saving', error: null });
    try {
      await saveProject(project);
      set({ status: 'ready' });
    } catch (error) {
      set({ status: 'error', error: error instanceof Error ? error.message : '项目保存失败' });
    }
  },

  addClip: (clip) => {
    const { project, history, future } = get();
    // Library imports are idempotent; explicit duplication remains available through
    // the duplicate action, so adding an already present ClipItem must not create a
    // second accidental layer.
    if (!project || project.items.some((item) => item.type === 'image' && item.clipId === clip.id)) return;
    const image = createImageItem(clip, project.items.length);
    const items = [...project.items, image];
    const nextProject = { ...project, items: project.canvas.layoutMode === 'auto' ? autoLayoutItems(items, project.canvas.width, project.canvas.height) : items };
    const next = commit(project, nextProject, history, future);
    set({ ...next, clips: get().clips.some((item) => item.id === clip.id) ? get().clips : [...get().clips, clip], selectedIds: [image.id] });
  },

  removeSelected: () => {
    const { project, selectedIds, history, future } = get();
    if (!project || selectedIds.length === 0) return;
    const rawIds = new Set(selectedIds.map(entityIdFromSelection));
    const next = commit(project, { ...project, items: project.items.filter((item) => !rawIds.has(item.id)), annotations: project.annotations.filter((annotation) => !rawIds.has(annotation.id)), redactions: project.redactions.filter((redaction) => !rawIds.has(redaction.id)) }, history, future);
    set({ ...next, selectedIds: [] });
  },

  removeLayers: (ids) => {
    const { project, history, future } = get();
    if (!project || ids.length === 0) return;
    const rawIds = new Set(ids.map(entityIdFromSelection));
    const next = commit(project, { ...project, items: project.items.filter((item) => !rawIds.has(item.id)), annotations: project.annotations.filter((annotation) => !rawIds.has(annotation.id)), redactions: project.redactions.filter((redaction) => !rawIds.has(redaction.id)) }, history, future);
    set({ ...next, selectedIds: [] });
  },

  duplicateSelected: () => {
    const { project, selectedIds, history, future } = get();
    if (!project) return;
    const rawIds = new Set(selectedIds.map(entityIdFromSelection));
    const selectedItems = project.items.filter((item) => rawIds.has(item.id));
    const selectedAnnotations = project.annotations.filter((annotation) => rawIds.has(annotation.id));
    const selectedRedactions = project.redactions.filter((redaction) => rawIds.has(redaction.id));
    if (selectedItems.length + selectedAnnotations.length + selectedRedactions.length === 0) return;
    const layerCount = project.items.length + project.annotations.length + project.redactions.length;
    const duplicate = <T extends ProjectLayer>(layer: T, index: number): T => ({ ...layer, id: crypto.randomUUID(), zIndex: layerCount + index, transform: { ...layer.transform, x: layer.transform.x + 24, y: layer.transform.y + 24 } } as T);
    const duplicateItems = selectedItems.map((item, index) => duplicate(item, index));
    const duplicateAnnotations = selectedAnnotations.map((annotation, index) => duplicate(annotation, selectedItems.length + index));
    const duplicateRedactions = selectedRedactions.map((redaction, index) => duplicate(redaction, selectedItems.length + selectedAnnotations.length + index));
    const nextProject = { ...project, items: [...project.items, ...duplicateItems], annotations: [...project.annotations, ...duplicateAnnotations], redactions: [...project.redactions, ...duplicateRedactions] };
    const next = commit(project, nextProject, history, future);
    set({ ...next, selectedIds: [...duplicateItems.map((item) => item.id), ...duplicateAnnotations.map((annotation) => annotationSelectionId(annotation.id)), ...duplicateRedactions.map((redaction) => redactionSelectionId(redaction.id))] });
  },

  addAnnotation: (annotation) => {
    const { project, history, future } = get();
    if (!project) return;
    const nextAnnotation = { ...annotation, id: crypto.randomUUID(), zIndex: [...project.items, ...project.annotations, ...project.redactions].length } as Annotation;
    const next = commit(project, { ...project, annotations: [...project.annotations, nextAnnotation] }, history, future);
    set({ ...next, selectedIds: [annotationSelectionId(nextAnnotation.id)] });
  },

  addRedaction: (redaction) => {
    const { project, history, future } = get();
    if (!project) return;
    const nextRedaction = { ...redaction, id: crypto.randomUUID(), zIndex: [...project.items, ...project.annotations, ...project.redactions].length } as Redaction;
    const next = commit(project, { ...project, redactions: [...project.redactions, nextRedaction] }, history, future);
    set({ ...next, selectedIds: [redactionSelectionId(nextRedaction.id)] });
  },

  updateAnnotation: (id, patch) => {
    get().updateAnnotations([{ id, patch }]);
  },

  updateAnnotations: (updates) => {
    const { project, history, future } = get();
    if (!project || updates.length === 0) return;
    const updateMap = new Map(updates.map((update) => [update.id, update.patch]));
    const next = commit(project, { ...project, annotations: project.annotations.map((annotation) => updateMap.has(annotation.id) ? { ...annotation, ...updateMap.get(annotation.id) } as Annotation : annotation) }, history, future);
    set(next);
  },

  updateRedaction: (id, patch) => {
    get().updateRedactions([{ id, patch }]);
  },

  updateRedactions: (updates) => {
    const { project, history, future } = get();
    if (!project || updates.length === 0) return;
    const updateMap = new Map(updates.map((update) => [update.id, update.patch]));
    const next = commit(project, { ...project, redactions: project.redactions.map((redaction) => updateMap.has(redaction.id) ? { ...redaction, ...updateMap.get(redaction.id) } as Redaction : redaction) }, history, future);
    set(next);
  },

  updateItem: (id, transform) => {
    get().updateItems([{ id, transform }]);
  },

  updateItemStyle: (id, style) => {
    const { project, history, future } = get();
    if (!project) return;
    const next = commit(project, { ...project, items: project.items.map((item) => item.id === id && item.type === 'image' ? { ...item, style: { ...item.style, ...style } } : item) }, history, future);
    set(next);
  },

  updateItems: (updates) => {
    const { project, history, future } = get();
    if (!project || updates.length === 0) return;
    const updateMap = new Map(updates.map((update) => [update.id, update.transform]));
    const nextItems = project.items.map((item) => updateMap.has(item.id) ? { ...item, transform: { ...item.transform, ...updateMap.get(item.id) } } : item);
    const next = commit(project, { ...project, items: nextItems, canvas: { ...project.canvas, layoutMode: 'free' } }, history, future);
    set(next);
  },

  select: (ids) => set({ selectedIds: ids }),

  setViewport: (zoom, pan) => {
    const project = get().project;
    if (!project) return;
    set({ project: { ...project, canvas: { ...project.canvas, zoom: Math.min(4, Math.max(.25, zoom)), pan }, updatedAt: Date.now() } });
  },

  reorder: (direction) => {
    const { project, selectedIds, history, future } = get();
    if (!project || selectedIds.length === 0) return;
    const layers = reorderProjectLayers([...project.items, ...project.annotations, ...project.redactions], selectedIds.map(entityIdFromSelection), direction);
    const itemIds = new Set(project.items.map((item) => item.id));
    const annotationIds = new Set(project.annotations.map((annotation) => annotation.id));
    const next = commit(project, { ...project, items: layers.filter((layer): layer is CanvasItem => itemIds.has(layer.id)), annotations: layers.filter((layer): layer is Annotation => annotationIds.has(layer.id)), redactions: layers.filter((layer): layer is Redaction => !itemIds.has(layer.id) && !annotationIds.has(layer.id)) }, history, future);
    set(next);
  },

  setItemVisibility: (id, visible) => {
    const { project, history, future } = get();
    if (!project) return;
    const next = commit(project, { ...project, items: project.items.map((item) => item.id === id ? { ...item, visible } : item), annotations: project.annotations.map((annotation) => annotation.id === id ? { ...annotation, visible } : annotation), redactions: project.redactions.map((redaction) => redaction.id === id ? { ...redaction, visible } : redaction) }, history, future);
    set(next);
  },

  setItemLocked: (id, locked) => {
    const { project, history, future } = get();
    if (!project) return;
    const next = commit(project, { ...project, items: project.items.map((item) => item.id === id ? { ...item, locked } : item), annotations: project.annotations.map((annotation) => annotation.id === id ? { ...annotation, locked } : annotation), redactions: project.redactions.map((redaction) => redaction.id === id ? { ...redaction, locked } : redaction) }, history, future);
    set({ ...next, selectedIds: locked ? get().selectedIds.filter((selectedId) => selectedId !== id) : get().selectedIds });
  },

  renameItem: (id, name) => {
    const { project, history, future } = get();
    if (!project || !name.trim()) return;
    const next = commit(project, { ...project, items: project.items.map((item) => item.id === id ? { ...item, name: name.trim() } : item), annotations: project.annotations.map((annotation) => annotation.id === id ? { ...annotation, name: name.trim() } : annotation), redactions: project.redactions.map((redaction) => redaction.id === id ? { ...redaction, name: name.trim() } : redaction) }, history, future);
    set(next);
  },

  setLayoutMode: (mode) => {
    const { project, history, future } = get();
    if (!project) return;
    const next = commit(project, { ...project, canvas: { ...project.canvas, layoutMode: mode } }, history, future);
    set(next);
  },

  autoLayout: () => {
    const { project, history, future } = get();
    if (!project) return;
    const next = commit(project, { ...project, canvas: { ...project.canvas, layoutMode: 'auto' }, items: autoLayoutItems(project.items, project.canvas.width, project.canvas.height) }, history, future);
    set(next);
  },

  setBackground: (background) => {
    const { project, history, future } = get();
    if (!project) return;
    const next = commit(project, { ...project, canvas: { ...project.canvas, background } }, history, future);
    set(next);
  },

  undo: () => {
    const { project, history, future } = get();
    if (!project || history.length === 0) return;
    const previous = history[history.length - 1];
    set({ project: previous, history: history.slice(0, -1), future: [project, ...future].slice(0, 50), selectedIds: [] });
  },

  redo: () => {
    const { project, history, future } = get();
    if (!project || future.length === 0) return;
    const nextProject = future[0];
    set({ project: nextProject, history: [...history, project].slice(-50), future: future.slice(1), selectedIds: [] });
  },
}));

export function selectedItem(project: ClipProject | null, selectedIds: string[]): CanvasItem | undefined {
  return project?.items.find((item) => selectedIds.includes(item.id));
}

export function selectedEntity(project: ClipProject | null, selectedIds: string[]): ProjectLayer | undefined {
  if (!project) return undefined;
  const id = selectedIds[0];
  // An empty selection is the normal initial editor state. Keep the selection
  // contract explicit before dispatching to the string-prefixed ID helpers.
  if (typeof id !== 'string' || id.length === 0) return undefined;
  if (isAnnotationSelectionId(id)) return project.annotations.find((annotation) => annotation.id === entityIdFromSelection(id));
  if (isRedactionSelectionId(id)) return project.redactions.find((redaction) => redaction.id === entityIdFromSelection(id));
  return project.items.find((item) => item.id === id);
}
