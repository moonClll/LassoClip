import type { ClipItemRecord, Point } from './capture';

export type ProjectLayoutMode = 'auto' | 'free';
export type EditorTool = 'select' | 'text' | 'arrow' | 'line' | 'rectangle' | 'ellipse' | 'drawing' | 'highlight' | 'redact-blur' | 'redact-pixelate' | 'redact-solid';

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
  margin?: number;
  shadow?: { color: string; blur: number; offsetX: number; offsetY: number };
  border?: { color: string; width: number };
}

export interface CanvasItemBase {
  id: string;
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

export interface AnnotationStyle {
  stroke?: string;
  fill?: string;
  strokeWidth?: number;
  opacity?: number;
  fontSize?: number;
  fontFamily?: string;
  fontStyle?: string;
  lineCap?: CanvasLineCap;
  lineJoin?: CanvasLineJoin;
  arrowSize?: number;
}

export interface AnnotationBase {
  id: string;
  name?: string;
  type: AnnotationType;
  transform: CanvasTransform;
  zIndex: number;
  visible: boolean;
  locked: boolean;
}

export interface TextAnnotation extends AnnotationBase {
  type: 'text';
  text: string;
  style: AnnotationStyle & { fill: string; fontSize: number; fontFamily: string };
}

export interface PathAnnotation extends AnnotationBase {
  type: Exclude<AnnotationType, 'text'>;
  points: Point[];
  style: AnnotationStyle & { maskMode?: never };
}

export type Annotation = TextAnnotation | PathAnnotation;
export type AnnotationDraft = Omit<TextAnnotation, 'id' | 'zIndex'> | Omit<PathAnnotation, 'id' | 'zIndex'>;

export type RedactionType = 'blur' | 'pixelate' | 'solid';

export interface Redaction {
  id: string;
  name?: string;
  type: RedactionType;
  zIndex: number;
  visible: boolean;
  locked: boolean;
  bounds: { x: number; y: number; width: number; height: number };
  transform: CanvasTransform;
  style: {
    color: string;
    opacity: number;
    blurRadius?: number;
    pixelSize?: number;
  };
}

export type ProjectLayer = CanvasItem | Annotation | Redaction;

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
  redactions: Redaction[];
  createdAt: number;
  updatedAt: number;
  schemaVersion: number;
}

export function createDefaultProject(name = '未命名项目', now = Date.now()): ClipProject {
  return {
    id: crypto.randomUUID(),
    name,
    canvas: { width: 1200, height: 800, background: '#f8fafc', layoutMode: 'auto', zoom: 1, pan: { x: 0, y: 0 } },
    items: [],
    annotations: [],
    redactions: [],
    createdAt: now,
    updatedAt: now,
    schemaVersion: 2,
  };
}

export function projectClipIds(project: ClipProject): string[] {
  return [...new Set(project.items.flatMap((item) => item.type === 'image' ? [item.clipId] : []))];
}

export function annotationSelectionId(id: string): string { return `annotation:${id}`; }
export function redactionSelectionId(id: string): string { return `redaction:${id}`; }
export function isAnnotationSelectionId(id: string): boolean { return id.startsWith('annotation:'); }
export function isRedactionSelectionId(id: string): boolean { return id.startsWith('redaction:'); }
export function entityIdFromSelection(id: string): string { return id.replace(/^(annotation|redaction):/, ''); }

export type ProjectWithClips = { project: ClipProject; clips: Map<string, ClipItemRecord> };
