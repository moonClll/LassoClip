import type { ProjectCaptureContext } from '../../types/capture';

export const PROJECT_CAPTURE_CONTEXT_KEY = 'lassoclip.projectCaptureContext';
export const PROCESSED_CAPTURE_LEDGER_KEY = 'lassoclip.processedCaptureLedger';
export const PROJECT_CAPTURE_TTL_MS = 24 * 60 * 60 * 1000;
export const PROCESSED_CAPTURE_TTL_MS = 10 * 60 * 1000;
export const PROJECT_CAPTURE_GLOBAL_SCOPE = 'global';

export function projectCaptureScope(windowId?: number): string {
  return windowId === undefined ? PROJECT_CAPTURE_GLOBAL_SCOPE : `window:${windowId}`;
}

export type ScopedProjectCaptureContexts = Record<string, ProjectCaptureContext>;

export function assignProjectCaptureContext(contexts: ScopedProjectCaptureContexts, windowId: number | undefined, context: ProjectCaptureContext): ScopedProjectCaptureContexts {
  const next = { ...contexts };
  delete next[PROJECT_CAPTURE_GLOBAL_SCOPE];
  next[projectCaptureScope(windowId)] = context;
  return next;
}

export function removeProjectCaptureContext(contexts: ScopedProjectCaptureContexts, windowId: number | undefined): ScopedProjectCaptureContexts {
  const next = { ...contexts };
  delete next[projectCaptureScope(windowId)];
  delete next[PROJECT_CAPTURE_GLOBAL_SCOPE];
  return next;
}

export function migrateLegacyProjectCaptureContext(contexts: ScopedProjectCaptureContexts, windowId: number): ScopedProjectCaptureContexts {
  if (!contexts[PROJECT_CAPTURE_GLOBAL_SCOPE]) return contexts;
  const next = { ...contexts, [projectCaptureScope(windowId)]: contexts[PROJECT_CAPTURE_GLOBAL_SCOPE] };
  delete next[PROJECT_CAPTURE_GLOBAL_SCOPE];
  return next;
}

/** Recovers a single surviving window context after a browser restart. */
export function migrateSingleProjectCaptureContext(contexts: ScopedProjectCaptureContexts, windowId: number): ScopedProjectCaptureContexts {
  if (contexts[PROJECT_CAPTURE_GLOBAL_SCOPE]) return migrateLegacyProjectCaptureContext(contexts, windowId);
  const candidates = Object.entries(contexts).filter(([scope]) => scope.startsWith('window:'));
  if (candidates.length !== 1) return contexts;
  const next = { ...contexts, [projectCaptureScope(windowId)]: candidates[0][1] };
  delete next[candidates[0][0]];
  return next;
}

export function createProjectCaptureContext(projectId: string, now = Date.now()): ProjectCaptureContext {
  return {
    projectId,
    sessionId: crypto.randomUUID(),
    startedAt: now,
    expiresAt: now + PROJECT_CAPTURE_TTL_MS,
  };
}

export function isProjectCaptureContextActive(context: ProjectCaptureContext | undefined, now = Date.now()): context is ProjectCaptureContext {
  return Boolean(context && context.projectId && context.sessionId && context.startedAt <= now && context.expiresAt > now);
}

export function sameProjectCaptureSession(a: ProjectCaptureContext | undefined, b: ProjectCaptureContext | undefined): boolean {
  return Boolean(a && b && a.projectId === b.projectId && a.sessionId === b.sessionId);
}

export interface ProcessedCaptureLedgerEntry {
  clipId: string;
  savedAt: number;
}

export type ProcessedCaptureLedger = Record<string, ProcessedCaptureLedgerEntry>;

export function pruneProcessedCaptureLedger(ledger: ProcessedCaptureLedger, now = Date.now()): ProcessedCaptureLedger {
  return Object.fromEntries(Object.entries(ledger).filter(([, entry]) => entry.savedAt + PROCESSED_CAPTURE_TTL_MS > now));
}
