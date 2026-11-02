import { addClipsToProject } from './libraryStore';
import { saveClip } from './clipStore';
import type { ClipItemRecord } from '../../types/capture';

export interface PersistCapturedClipResult {
  clipId: string;
  addedToProject: boolean;
  projectMissing: boolean;
}

/**
 * Persists the original ClipItem first, then links it to the requested project.
 * A missing project is a recoverable workflow error: the capture remains in the
 * Library and is never redirected to another project.
 */
export async function persistCapturedClip(item: ClipItemRecord, projectId?: string): Promise<PersistCapturedClipResult> {
  await saveClip(item);
  if (!projectId) return { clipId: item.id, addedToProject: false, projectMissing: false };
  try {
    await addClipsToProject(projectId, [item.id]);
    return { clipId: item.id, addedToProject: true, projectMissing: false };
  } catch (error) {
    if (error instanceof Error && error.message === '项目不存在') {
      return { clipId: item.id, addedToProject: false, projectMissing: true };
    }
    throw error;
  }
}
