import type { ClipItemSummary } from '../../types/capture';

export type ClipSort = 'recent' | 'oldest' | 'name';
export type ClipFilter = 'all' | 'favorites';

export function clipMatchesQuery(clip: ClipItemSummary, query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return true;
  const haystack = [clip.name, clip.source.title, clip.source.domain, clip.source.url, clip.notes ?? '', ...clip.tags]
    .join(' ')
    .toLocaleLowerCase();
  return haystack.includes(normalized);
}

export function sortClips(clips: ClipItemSummary[], sort: ClipSort): ClipItemSummary[] {
  return [...clips].sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name, 'zh-CN');
    const delta = a.metadata.createdAt - b.metadata.createdAt;
    return sort === 'oldest' ? delta : -delta;
  });
}

export function filterAndSortClips(clips: ClipItemSummary[], query: string, filter: ClipFilter, sort: ClipSort): ClipItemSummary[] {
  return sortClips(clips.filter((clip) => (filter === 'all' || clip.favorite) && clipMatchesQuery(clip, query)), sort);
}

export function formatCapturedAt(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp));
}
