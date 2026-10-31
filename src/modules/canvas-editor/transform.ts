import type { CanvasItem, CanvasTransform } from '../../types/editor';

export const MIN_ITEM_SIZE = 24;

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SnapGuide {
  axis: 'x' | 'y';
  position: number;
}

export function normalizeTransform(transform: CanvasTransform, keepAspect = false, minSize = MIN_ITEM_SIZE): CanvasTransform {
  const width = Math.max(minSize, Math.abs(transform.width));
  const height = Math.max(minSize, Math.abs(transform.height));
  const aspect = transform.width === 0 ? 1 : Math.abs(transform.height / transform.width);
  const nextWidth = keepAspect ? Math.max(minSize, width) : width;
  const nextHeight = keepAspect ? Math.max(minSize, nextWidth * aspect) : height;
  return {
    ...transform,
    width: nextWidth,
    height: nextHeight,
    rotation: ((transform.rotation % 360) + 360) % 360,
    opacity: Math.min(1, Math.max(0, transform.opacity)),
  };
}

export function itemBounds(item: Pick<CanvasItem, 'transform'>): Bounds {
  return { x: item.transform.x, y: item.transform.y, width: item.transform.width, height: item.transform.height };
}

export function boundsOfItems(items: CanvasItem[]): Bounds | null {
  if (items.length === 0) return null;
  const left = Math.min(...items.map((item) => item.transform.x));
  const top = Math.min(...items.map((item) => item.transform.y));
  const right = Math.max(...items.map((item) => item.transform.x + item.transform.width));
  const bottom = Math.max(...items.map((item) => item.transform.y + item.transform.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function rectIntersects(a: Bounds, b: Bounds): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function snapPosition(
  active: Bounds,
  others: Bounds[],
  canvas: { width: number; height: number },
  threshold = 6,
): { x: number; y: number; guides: SnapGuide[] } {
  const xCandidates = [
    ...others.flatMap((item) => [item.x, item.x + item.width / 2, item.x + item.width]),
    0, canvas.width / 2, canvas.width,
  ];
  const yCandidates = [
    ...others.flatMap((item) => [item.y, item.y + item.height / 2, item.y + item.height]),
    0, canvas.height / 2, canvas.height,
  ];
  const xEdges = [active.x, active.x + active.width / 2, active.x + active.width];
  const yEdges = [active.y, active.y + active.height / 2, active.y + active.height];
  let bestX: { delta: number; candidate: number } | null = null;
  let bestY: { delta: number; candidate: number } | null = null;
  for (const edge of xEdges) for (const candidate of xCandidates) {
    const delta = candidate - edge;
    if (Math.abs(delta) <= threshold && (!bestX || Math.abs(delta) < Math.abs(bestX.delta))) bestX = { delta, candidate };
  }
  for (const edge of yEdges) for (const candidate of yCandidates) {
    const delta = candidate - edge;
    if (Math.abs(delta) <= threshold && (!bestY || Math.abs(delta) < Math.abs(bestY.delta))) bestY = { delta, candidate };
  }
  // When an item is between two peers, keep the two gaps equal when the
  // pointer is close to the calculated position. This is the same visual
  // rule used by common design tools and gives users a useful spacing cue.
  const sortedX = [...others].sort((a, b) => a.x - b.x);
  for (let index = 0; index < sortedX.length - 1; index += 1) {
    const left = sortedX[index];
    const right = sortedX[index + 1];
    const available = right.x - (left.x + left.width) - active.width;
    if (available < 0) continue;
    const target = left.x + left.width + available / 2;
    const delta = target - active.x;
    if (Math.abs(delta) <= threshold && (!bestX || Math.abs(delta) < Math.abs(bestX.delta))) bestX = { delta, candidate: target };
  }
  const sortedY = [...others].sort((a, b) => a.y - b.y);
  for (let index = 0; index < sortedY.length - 1; index += 1) {
    const top = sortedY[index];
    const bottom = sortedY[index + 1];
    const available = bottom.y - (top.y + top.height) - active.height;
    if (available < 0) continue;
    const target = top.y + top.height + available / 2;
    const delta = target - active.y;
    if (Math.abs(delta) <= threshold && (!bestY || Math.abs(delta) < Math.abs(bestY.delta))) bestY = { delta, candidate: target };
  }
  return {
    x: active.x + (bestX?.delta ?? 0),
    y: active.y + (bestY?.delta ?? 0),
    guides: [
      ...(bestX ? [{ axis: 'x' as const, position: bestX.candidate }] : []),
      ...(bestY ? [{ axis: 'y' as const, position: bestY.candidate }] : []),
    ],
  };
}

export function reorderItems(items: CanvasItem[], selectedIds: string[], direction: 'up' | 'down' | 'top' | 'bottom'): CanvasItem[] {
  const selected = new Set(selectedIds);
  const ordered = [...items].sort((a, b) => a.zIndex - b.zIndex);
  const moving = ordered.filter((item) => selected.has(item.id));
  if (!moving.length) return items;
  const stationary = ordered.filter((item) => !selected.has(item.id));
  let result: CanvasItem[];
  if (direction === 'top') result = [...stationary, ...moving];
  else if (direction === 'bottom') result = [...moving, ...stationary];
  else {
    result = [...ordered];
    const step = direction === 'up' ? 1 : -1;
    const indexes = direction === 'up' ? [...result.keys()].reverse() : [...result.keys()];
    for (const index of indexes) {
      if (!selected.has(result[index].id)) continue;
      const target = index + step;
      if (target < 0 || target >= result.length || selected.has(result[target].id)) continue;
      [result[index], result[target]] = [result[target], result[index]];
    }
  }
  return result.map((item, index) => ({ ...item, zIndex: index }));
}
