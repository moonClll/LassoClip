import { autoLayoutItems } from '../src/modules/canvas-editor/autoLayout';
import type { CanvasItem } from '../src/types/editor';

function item(id: string, width: number, height: number): CanvasItem {
  return { id, type: 'image', clipId: id, transform: { x: 0, y: 0, width, height, rotation: 0, opacity: 1 }, zIndex: 0, visible: true, locked: false, style: { cornerRadius: 0 } };
}

describe('Clip Studio auto layout', () => {
  it('is deterministic and starts a new row before overlap', () => {
    const items = [item('a', 300, 100), item('b', 300, 120), item('c', 300, 80)];
    const first = autoLayoutItems(items, 700, 500, { gap: 20, padding: 40 });
    const second = autoLayoutItems(items, 700, 500, { gap: 20, padding: 40 });
    expect(first).toEqual(second);
    expect(first.map((entry) => [entry.transform.x, entry.transform.y])).toEqual([[40, 40], [360, 40], [40, 180]]);
  });

  it('scales an item that is wider than the canvas content area', () => {
    const [result] = autoLayoutItems([item('wide', 1000, 500)], 600, 500, { padding: 40 });
    expect(result.transform.width).toBe(520);
    expect(result.transform.height).toBe(260);
  });
});
