import { create } from 'zustand';
import { autoLayoutItems } from '../modules/canvas-editor/autoLayout';
import { reorderItems } from '../modules/canvas-editor/transform';
import { createDefaultProject, type CanvasItem, type ClipProject, type ImageCanvasItem } from '../types/editor';
import type { ClipItemRecord } from '../types/capture';
import { createProject, listClips, listProjects, loadProjectWithClips, saveProject } from '../modules/storage/clipStore';

type EditorStatus = 'idle' | 'loading' | 'ready' | 'saving' | 'error';

interface EditorState {
  project: ClipProject | null;
  clips: ClipItemRecord[];
  selectedIds: string[];
  status: EditorStatus;
  error: string | null;
  history: ClipProject[];
  future: ClipProject[];
  load: (projectId?: string) => Promise<void>;
  createNew: () => Promise<void>;
  save: () => Promise<void>;
  addClip: (clip: ClipItemRecord) => void;
  removeSelected: () => void;
  duplicateSelected: () => void;
  updateItem: (id: string, transform: Partial<CanvasItem['transform']>) => void;
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

function createImageItem(clip: ClipItemRecord, index: number): ImageCanvasItem {
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
          set({ project: loaded.project, clips: await listClips(), selectedIds: [], history: [], future: [], status: 'ready' });
          return;
        }
      }
      const project = createDefaultProject();
      await createProject(project);
      set({ project, clips: await listClips(), selectedIds: [], history: [], future: [], status: 'ready' });
    } catch (error) {
      set({ status: 'error', error: error instanceof Error ? error.message : '项目加载失败' });
    }
  },

  createNew: async () => {
    set({ status: 'loading', error: null });
    try {
      const project = createDefaultProject();
      await createProject(project);
      set({ project, clips: await listClips(), selectedIds: [], history: [], future: [], status: 'ready' });
    } catch (error) {
      set({ status: 'error', error: error instanceof Error ? error.message : '项目创建失败' });
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
    if (!project || project.items.some((item) => item.type === 'image' && item.clipId === clip.id && get().selectedIds.includes(item.id))) return;
    const image = createImageItem(clip, project.items.length);
    const items = [...project.items, image];
    const nextProject = { ...project, items: project.canvas.layoutMode === 'auto' ? autoLayoutItems(items, project.canvas.width, project.canvas.height) : items };
    const next = commit(project, nextProject, history, future);
    set({ ...next, clips: get().clips.some((item) => item.id === clip.id) ? get().clips : [...get().clips, clip], selectedIds: [image.id] });
  },

  removeSelected: () => {
    const { project, selectedIds, history, future } = get();
    if (!project || selectedIds.length === 0) return;
    const next = commit(project, { ...project, items: project.items.filter((item) => !selectedIds.includes(item.id)) }, history, future);
    set({ ...next, selectedIds: [] });
  },

  duplicateSelected: () => {
    const { project, selectedIds, history, future } = get();
    if (!project) return;
    const selected = project.items.filter((item) => selectedIds.includes(item.id));
    if (selected.length === 0) return;
    const duplicates = selected.map((item, index) => ({ ...item, id: crypto.randomUUID(), zIndex: project.items.length + index, transform: { ...item.transform, x: item.transform.x + 24, y: item.transform.y + 24 } }));
    const next = commit(project, { ...project, items: [...project.items, ...duplicates] }, history, future);
    set({ ...next, selectedIds: duplicates.map((item) => item.id) });
  },

  updateItem: (id, transform) => {
    get().updateItems([{ id, transform }]);
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
    const next = commit(project, { ...project, items: reorderItems(project.items, selectedIds, direction) }, history, future);
    set(next);
  },

  setItemVisibility: (id, visible) => {
    const { project, history, future } = get();
    if (!project) return;
    const next = commit(project, { ...project, items: project.items.map((item) => item.id === id ? { ...item, visible } : item) }, history, future);
    set(next);
  },

  setItemLocked: (id, locked) => {
    const { project, history, future } = get();
    if (!project) return;
    const next = commit(project, { ...project, items: project.items.map((item) => item.id === id ? { ...item, locked } : item) }, history, future);
    set({ ...next, selectedIds: locked ? get().selectedIds.filter((selectedId) => selectedId !== id) : get().selectedIds });
  },

  renameItem: (id, name) => {
    const { project, history, future } = get();
    if (!project || !name.trim()) return;
    const next = commit(project, { ...project, items: project.items.map((item) => item.id === id ? { ...item, name: name.trim() } : item) }, history, future);
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
  return project?.items.find((item) => item.id === selectedIds[0]);
}
