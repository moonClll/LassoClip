import type { ClipItemRecord } from '../src/types/capture';
import { clipMatchesQuery, filterAndSortClips, sortClips } from '../src/modules/library/libraryUtils';

function clip(id: string, name: string, createdAt: number, favorite = false): ClipItemRecord {
  return {
    id, name, imageBlob: new Blob(['image'], { type: 'image/png' }),
    source: { url: `https://${id}.example.com/page`, title: `${name} source`, domain: `${id}.example.com`, capturedAt: createdAt },
    selection: { type: 'rectangle', bounds: { x: 0, y: 0, width: 10, height: 10 }, coordinateSpace: 'image-px' },
    metadata: { width: 10, height: 10, format: 'image/png', createdAt, updatedAt: createdAt }, tags: [], favorite,
  };
}

describe('library filtering and sorting', () => {
  const clips = [clip('a', 'Alpha', 10), clip('b', 'Beta', 30, true), clip('c', 'Gamma', 20, true)];

  it('searches names and source metadata', () => {
    expect(clipMatchesQuery(clips[0], 'alpha')).toBe(true);
    expect(clipMatchesQuery(clips[0], 'a.example.com')).toBe(true);
    expect(clipMatchesQuery(clips[0], 'not-found')).toBe(false);
  });

  it('sorts without mutating the IndexedDB result array', () => {
    expect(sortClips(clips, 'recent').map((item) => item.id)).toEqual(['b', 'c', 'a']);
    expect(sortClips(clips, 'oldest').map((item) => item.id)).toEqual(['a', 'c', 'b']);
    expect(sortClips(clips, 'name').map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(clips.map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });

  it('combines favorites and query filters', () => {
    expect(filterAndSortClips(clips, '', 'favorites', 'recent').map((item) => item.id)).toEqual(['b', 'c']);
    expect(filterAndSortClips(clips, 'gamma', 'all', 'recent').map((item) => item.id)).toEqual(['c']);
  });
});
