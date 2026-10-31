import type { ClipItemRecord } from '../../types/capture';
import type { ClipProject } from '../../types/editor';
import { projectClipIds } from '../../types/editor';

export const DB_NAME = 'lassoclip';
export const DB_VERSION = 2;
export const CLIP_STORE_NAME = 'clips';
export const PROJECT_STORE_NAME = 'projects';

export class ProjectReferenceError extends Error {
  constructor(public readonly missingClipIds: string[]) {
    super(`项目引用了不存在的素材：${missingClipIds.join(', ')}`);
    this.name = 'ProjectReferenceError';
  }
}

function configureDatabase(database: IDBDatabase): void {
  database.onversionchange = () => database.close();
}

export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(CLIP_STORE_NAME)) database.createObjectStore(CLIP_STORE_NAME, { keyPath: 'id' });
      if (!database.objectStoreNames.contains(PROJECT_STORE_NAME)) {
        const projects = database.createObjectStore(PROJECT_STORE_NAME, { keyPath: 'id' });
        projects.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };
    request.onblocked = () => reject(new Error('本地素材库正在被其他窗口占用，请关闭其他 LassoClip 页面后重试'));
    request.onsuccess = () => {
      configureDatabase(request.result);
      resolve(request.result);
    };
    request.onerror = () => reject(request.error ?? new Error('无法打开本地素材库'));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 请求失败'));
  });
}

export async function saveClip(item: ClipItemRecord): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(CLIP_STORE_NAME, 'readwrite');
      transaction.objectStore(CLIP_STORE_NAME).put(item);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('素材保存失败'));
      transaction.onabort = () => reject(transaction.error ?? new Error('素材保存已回滚'));
    });
  } finally {
    database.close();
  }
}

export async function getClip(id: string): Promise<ClipItemRecord | undefined> {
  const database = await openDatabase();
  try {
    return await requestResult(database.transaction(CLIP_STORE_NAME, 'readonly').objectStore(CLIP_STORE_NAME).get(id));
  } finally {
    database.close();
  }
}

export async function listClips(): Promise<ClipItemRecord[]> {
  const database = await openDatabase();
  try {
    const result = await requestResult(database.transaction(CLIP_STORE_NAME, 'readonly').objectStore(CLIP_STORE_NAME).getAll());
    return (result as ClipItemRecord[]).sort((a, b) => b.metadata.createdAt - a.metadata.createdAt);
  } finally {
    database.close();
  }
}

export async function createProject(project: ClipProject): Promise<ClipProject> {
  await saveProject(project);
  return project;
}

export async function saveProject(project: ClipProject): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction([CLIP_STORE_NAME, PROJECT_STORE_NAME], 'readwrite');
      const clipStore = transaction.objectStore(CLIP_STORE_NAME);
      const projectStore = transaction.objectStore(PROJECT_STORE_NAME);
      const missing: string[] = [];
      const clipIds = projectClipIds(project);
      let pending = clipIds.length;
      for (const clipId of clipIds) {
        const request = clipStore.get(clipId);
        request.onsuccess = () => {
          if (!request.result) missing.push(clipId);
          pending -= 1;
          if (pending === 0) {
            if (missing.length > 0) {
              transaction.abort();
              reject(new ProjectReferenceError(missing));
            } else {
              projectStore.put(project);
            }
          }
        };
        request.onerror = () => {
          transaction.abort();
          reject(request.error ?? new Error('无法验证项目素材关联'));
        };
      }
      if (pending === 0) projectStore.put(project);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('项目保存失败'));
      transaction.onabort = () => {
        if (missing.length === 0) reject(transaction.error ?? new Error('项目保存已回滚'));
      };
    });
  } finally {
    database.close();
  }
}

export async function getProject(id: string): Promise<ClipProject | undefined> {
  const database = await openDatabase();
  try {
    return await requestResult(database.transaction(PROJECT_STORE_NAME, 'readonly').objectStore(PROJECT_STORE_NAME).get(id));
  } finally {
    database.close();
  }
}

export async function listProjects(): Promise<ClipProject[]> {
  const database = await openDatabase();
  try {
    const result = await requestResult(database.transaction(PROJECT_STORE_NAME, 'readonly').objectStore(PROJECT_STORE_NAME).getAll());
    return (result as ClipProject[]).sort((a, b) => b.updatedAt - a.updatedAt);
  } finally {
    database.close();
  }
}

export async function deleteProject(id: string): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(PROJECT_STORE_NAME, 'readwrite');
      transaction.objectStore(PROJECT_STORE_NAME).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('项目删除失败'));
      transaction.onabort = () => reject(transaction.error ?? new Error('项目删除已回滚'));
    });
  } finally {
    database.close();
  }
}

export async function loadProjectWithClips(id: string): Promise<{ project: ClipProject; clips: Map<string, ClipItemRecord> } | undefined> {
  const project = await getProject(id);
  if (!project) return undefined;
  const clips = new Map<string, ClipItemRecord>();
  for (const clipId of projectClipIds(project)) {
    const clip = await getClip(clipId);
    if (clip) clips.set(clipId, clip);
  }
  return { project, clips };
}
