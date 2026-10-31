import type { SelectionGeometry } from '../../types/capture';

export function translateSelection(selection: SelectionGeometry, dx: number, dy: number): SelectionGeometry {
  return {
    ...selection,
    bounds: { ...selection.bounds, x: selection.bounds.x + dx, y: selection.bounds.y + dy },
    points: selection.points?.map((point) => ({ x: point.x + dx, y: point.y + dy })),
  };
}

export function resizeSelection(selection: SelectionGeometry, width: number, height: number): SelectionGeometry {
  const nextWidth = Math.max(4, width);
  const nextHeight = Math.max(4, height);
  if (!selection.points || selection.points.length === 0) return { ...selection, bounds: { ...selection.bounds, width: nextWidth, height: nextHeight } };
  const scaleX = nextWidth / Math.max(1, selection.bounds.width);
  const scaleY = nextHeight / Math.max(1, selection.bounds.height);
  const points = selection.points.map((point) => ({
    x: selection.bounds.x + (point.x - selection.bounds.x) * scaleX,
    y: selection.bounds.y + (point.y - selection.bounds.y) * scaleY,
  }));
  return { ...selection, points, bounds: { ...selection.bounds, width: nextWidth, height: nextHeight } };
}
