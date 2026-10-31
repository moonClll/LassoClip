export type SelectionType = 'freehand' | 'polygon' | 'rectangle' | 'ellipse' | 'element';

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ViewportMetrics {
  viewportWidth: number;
  viewportHeight: number;
  imageWidth: number;
  imageHeight: number;
  dpr: number;
  scrollX: number;
  scrollY: number;
}

export interface SelectionGeometry {
  type: SelectionType;
  points?: Point[];
  bounds: Rect;
}

export interface StoredSelectionGeometry extends SelectionGeometry {
  /** Persisted selections always use screenshot image pixels, never page CSS pixels. */
  coordinateSpace: 'image-px';
}

export interface ClipSource {
  url: string;
  title: string;
  domain: string;
  capturedAt: number;
  elementText?: string;
}

export interface ClipItemRecord {
  id: string;
  name: string;
  imageBlob: Blob;
  source: ClipSource;
  selection: StoredSelectionGeometry;
  metadata: {
    width: number;
    height: number;
    format: string;
    createdAt: number;
    updatedAt: number;
  };
  tags: string[];
  notes?: string;
  favorite: boolean;
}

export interface CaptureStartMessage {
  type: 'capture:start';
  dataUrl: string;
  capturedAt: number;
}

export interface CaptureCompleteMessage {
  type: 'capture:complete';
  imageBlob: Blob;
  selection: SelectionGeometry;
  metrics: ViewportMetrics;
  source: ClipSource;
}

export interface CaptureErrorMessage {
  type: 'capture:error';
  message: string;
}

export type CaptureMessage = CaptureStartMessage | CaptureCompleteMessage | CaptureErrorMessage;
