import type { CanvasItem } from '../../types/editor';

export interface LayoutOptions {
  gap?: number;
  padding?: number;
}

/** Deterministic row flow layout. It only changes image item transforms. */
export function autoLayoutItems(items: readonly CanvasItem[], canvasWidth: number, canvasHeight: number, options: LayoutOptions = {}): CanvasItem[] {
  const gap = options.gap ?? 24;
  const padding = options.padding ?? 40;
  const maxWidth = Math.max(1, canvasWidth - padding * 2);
  let x = padding;
  let y = padding;
  let rowHeight = 0;
  return items.map((item) => {
    if (item.type !== 'image') return item;
    let width = Math.max(1, item.transform.width);
    let height = Math.max(1, item.transform.height);
    if (width > maxWidth) {
      const scale = maxWidth / width;
      width = maxWidth;
      height *= scale;
    }
    if (x > padding && x + width > canvasWidth - padding) {
      x = padding;
      y += rowHeight + gap;
      rowHeight = 0;
    }
    const next = {
      ...item,
      transform: { ...item.transform, x, y, width, height },
    };
    x += width + gap;
    rowHeight = Math.max(rowHeight, height);
    if (y + rowHeight > canvasHeight - padding) {
      y = padding;
      x = padding;
      rowHeight = 0;
    }
    return next;
  });
}
