import type { Point, Rect, ViewportMetrics } from '../../types/capture';
import { clamp, clampRect } from './geometry';

export function cssToImagePoint(point: Point, metrics: ViewportMetrics): Point {
  return {
    x: point.x * (metrics.imageWidth / metrics.viewportWidth),
    y: point.y * (metrics.imageHeight / metrics.viewportHeight),
  };
}

export function imageToCssPoint(point: Point, metrics: ViewportMetrics): Point {
  return {
    x: point.x * (metrics.viewportWidth / metrics.imageWidth),
    y: point.y * (metrics.viewportHeight / metrics.imageHeight),
  };
}

export function cssRectToImageRect(rect: Rect, metrics: ViewportMetrics): Rect {
  const viewport = { x: 0, y: 0, width: metrics.viewportWidth, height: metrics.viewportHeight };
  const clipped = clampRect(rect, viewport);
  const scaleX = metrics.imageWidth / metrics.viewportWidth;
  const scaleY = metrics.imageHeight / metrics.viewportHeight;
  const x = clamp(clipped.x * scaleX, 0, metrics.imageWidth);
  const y = clamp(clipped.y * scaleY, 0, metrics.imageHeight);
  const right = clamp((clipped.x + clipped.width) * scaleX, 0, metrics.imageWidth);
  const bottom = clamp((clipped.y + clipped.height) * scaleY, 0, metrics.imageHeight);
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}

export function mapCssPointsToImage(points: readonly Point[], metrics: ViewportMetrics): Point[] {
  return points.map((point) => cssToImagePoint(point, metrics));
}

export function createViewportMetrics(imageWidth: number, imageHeight: number, dpr = window.devicePixelRatio || 1): ViewportMetrics {
  return {
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    imageWidth,
    imageHeight,
    dpr,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  };
}
