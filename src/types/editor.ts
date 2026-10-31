import type { ClipItemRecord, Point } from './capture';

export type ProjectLayoutMode = 'auto' | 'free';

export interface GradientBackground {
  type: 'linear-gradient';
  value: string;
}

export type ProjectBackground = string | GradientBackground;

export interface CanvasTransform {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
}

export interface CanvasStyle {
  cornerRadius: number;
  shadow?: { color: string; blur: number; offsetX: number; offsetY: number };
  border?: { color: string; width: number };
}

export interface CanvasItemBase {
  id: string;
  /** User-facing layer name. Older projects may omit this field. */
  name?: string;
  type: 'image' | 'text' | 'arrow' | 'shape' | 'drawing';
  transform: CanvasTransform;
  zIndex: number;
  visible: boolean;
  locked: boolean;
}

export interface ImageCanvasItem extends CanvasItemBase {
  type: 'image';
  clipId: string;
  style: CanvasStyle;
}

export interface TextCanvasItem extends CanvasItemBase {
  type: 'text';
  text: string;
  style: { fill: string; fontSize: number; fontFamily: string; fontStyle?: string };
}

export type CanvasItem = ImageCanvasItem | TextCanvasItem | (CanvasItemBase & {
  type: 'arrow' | 'shape' | 'drawing';
  points?: Point[];
  style?: Record<string, unknown>;
});

export type AnnotationType = 'text' | 'arrow' | 'line' | 'rectangle' | 'ellipse' | 'drawing' | 'highlight';

export interface AnnotationBase {
  id: string;
  type: AnnotationType;
  zIndex: number;
  visible: boolean;
  locked: boolean;
}

export interface TextAnnotation extends AnnotationBase {
  type: 'text';
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  style: { fill: string; fontSize: number; fontFamily: string; fontStyle?: string };
}

export interface PathAnnotation extends AnnotationBase {
  type: Exclude<AnnotationType, 'text'>;
  points: Point[];
  style: {
    stroke?: string;
    fill?: string;
    strokeWidth?: number;
    opacity?: number;
    maskMode?: 'solid' | 'pixelate' | 'blur';
  };
}

export type Annotation = TextAnnotation | PathAnnotation;

export interface ClipProject {
  id: string;
  name: string;
  canvas: {
    width: number;
    height: number;
    background: ProjectBackground;
    layoutMode: ProjectLayoutMode;
    zoom: number;
    pan: Point;
  };
  items: CanvasItem[];
  annotations: Annotation[];
  createdAt: number;
  updatedAt: number;
  schemaVersion: number;
}

export function createDefaultProject(name = '未命名项目', now = Date.now()): ClipProject {
  return {
    id: crypto.randomUUID(),
    name,
    canvas: {
      width: 1200,
      height: 800,
      background: '#f8fafc',
      layoutMode: 'auto',
      zoom: 1,
      pan: { x: 0, y: 0 },
    },
    items: [],
    annotations: [],
    createdAt: now,
    updatedAt: now,
    schemaVersion: 1,
  };
}

export function projectClipIds(project: ClipProject): string[] {
  return [...new Set(project.items.flatMap((item) => item.type === 'image' ? [item.clipId] : []))];
}

export type ProjectWithClips = {
  project: ClipProject;
  clips: Map<string, ClipItemRecord>;
};
