import { boundsOfItems, normalizeTransform, reorderItems, snapPosition } from '../src/modules/canvas-editor/transform';
import type { CanvasItem } from '../src/types/editor';

function item(id: string, x: number, y: number, zIndex: number): CanvasItem {
  return { id, name: id, type: 'image', clipId: id, transform: { x, y, width: 100, height: 60, rotation: 0, opacity: 1 }, zIndex, visible: true, locked: false, style: { cornerRadius: 0 } };
}

describe('Clip Studio transform helpers', () => {
  it('normalizes rotation, opacity, and minimum dimensions', () => {
    const result = normalizeTransform({ x: 0, y: 0, width: 5, height: 5, rotation: -30, opacity: 3 }, false);
    expect(result.width).toBe(24);
    expect(result.height).toBe(24);
    expect(result.rotation).toBe(330);
    expect(result.opacity).toBe(1);
  });

  it('snaps edges and centers to canvas guides within threshold', () => {
    const result = snapPosition({ x: 494, y: 96, width: 100, height: 50 }, [{ x: 0, y: 100, width: 20, height: 10 }], { width: 1200, height: 800 });
    expect(result.x).toBe(500);
    expect(result.y).toBe(100);
    expect(result.guides).toEqual(expect.arrayContaining([{ axis: 'x', position: 600 }, { axis: 'y', position: 100 }]));
  });

  it('reorders selected layers while preserving relative order', () => {
    const items = [item('a', 0, 0, 0), item('b', 0, 0, 1), item('c', 0, 0, 2)];
    expect(reorderItems(items, ['b'], 'top').map((entry) => entry.id)).toEqual(['a', 'c', 'b']);
    expect(reorderItems(items, ['b'], 'down').map((entry) => entry.id)).toEqual(['b', 'a', 'c']);
    expect(reorderItems(items, ['b'], 'up').map((entry) => entry.id)).toEqual(['a', 'c', 'b']);
  });

  it('calculates a stable multi-selection bounding box', () => {
    expect(boundsOfItems([item('a', 10, 20, 0), item('b', 150, 90, 1)])).toEqual({ x: 10, y: 20, width: 240, height: 130 });
  });
});
