import { createBlurStroke, DEFAULT_BLUR_BRUSH } from '../../modules/canvas-editor/blurBrush';
import { renderProjectPixels } from '../../modules/canvas-editor/export';
import { createDrawingAnnotation, createTextAnnotation } from '../../modules/canvas-editor/drawing';
import { useEffect, useMemo, useRef, useState } from 'react';
import Konva from 'konva';
import { Arrow, Ellipse, Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text, Transformer } from 'react-konva';
import type { ClipItemSummary, Point } from '../../types/capture';
import { getClipImageBlob } from '../../modules/storage/clipStore';
import { diagnosticError, describeBlob, logImageDiagnostic } from '../../modules/media/imageDiagnostics';
import { loadBlobImage, revokeBlobObjectUrl } from '../../modules/media/imageLoader';
import { annotationSelectionId, redactionSelectionId, type Annotation, type AnnotationDraft, type AnnotationStyle, type BlurBrushSettings, type CanvasItem, type ClipProject, type EditorTool, type Redaction } from '../../types/editor';
import { itemBounds, rectIntersects, snapPosition, type SnapGuide } from '../../modules/canvas-editor/transform';

interface StudioViewportProps {
  blurBrush?: BlurBrushSettings;
  eraserWidth?: number;
  project: ClipProject;
  clips: ClipItemSummary[];
  selectedIds: string[];
  activeTool: EditorTool;
  toolStyle: AnnotationStyle;
  onTool: (tool: EditorTool) => void;
  onSelect: (ids: string[]) => void;
  onUpdateItems: (updates: Array<{ id: string; transform: Partial<CanvasItem['transform']> }>) => void;
  onAddAnnotation: (annotation: AnnotationDraft) => void;
  onUpdateAnnotation: (id: string, patch: Partial<Annotation>) => void;
  onUpdateAnnotations: (updates: Array<{ id: string; patch: Partial<Annotation> }>) => void;
  onAddRedaction: (redaction: Omit<Redaction, 'id' | 'zIndex'>) => void;
  onUpdateRedaction: (id: string, patch: Partial<Redaction>) => void;
  onUpdateRedactions: (updates: Array<{ id: string; patch: Partial<Redaction> }>) => void;
  onErase?: (ids: string[]) => void;
  onSetViewport: (zoom: number, pan: { x: number; y: number }) => void;
  onStageReady: (stage: Konva.Stage | null) => void;
}

function useBlobImages(clips: ClipItemSummary[], project: ClipProject): Map<string, HTMLImageElement> {
  const [images, setImages] = useState<Map<string, HTMLImageElement>>(new Map());
  const usedClipIds = [...new Set(project.items.filter((item) => item.type === 'image' && item.visible).map((item) => item.type === 'image' ? item.clipId : ''))].sort().join(',');
  useEffect(() => {
    let disposed = false;
    const urls: string[] = [];
    setImages(new Map());
    const usedIds = new Set(usedClipIds.split(','));
    for (const clip of clips.filter((item) => usedIds.has(item.id))) void getClipImageBlob(clip.id).then(async (blob) => {
      if (disposed || !blob) { if (!blob) logImageDiagnostic({ stage: 'studio-blob-missing', clipId: clip.id, exists: false }); return; }
      const loaded = await loadBlobImage(blob, clip.id);
      if (disposed) { revokeBlobObjectUrl(loaded.url, clip.id); return; }
      urls.push(loaded.url); setImages((current) => new Map(current).set(clip.id, loaded.image));
    }).catch((error) => logImageDiagnostic({ stage: 'studio-load-failed', clipId: clip.id, ...describeBlob(undefined), error: diagnosticError(error) }));
    return () => { disposed = true; urls.forEach((url) => revokeBlobObjectUrl(url)); };
  }, [clips, usedClipIds]);
  return images;
}

function selectionForAnnotation(annotation: Annotation): string { return annotationSelectionId(annotation.id); }
function selectionForRedaction(redaction: Redaction): string { return redactionSelectionId(redaction.id); }
function toCanvasPoint(stage: Konva.Stage, origin: Point, scale: number): Point { const pointer = stage.getPointerPosition(); return pointer ? { x: (pointer.x - origin.x) / scale, y: (pointer.y - origin.y) / scale } : { x: 0, y: 0 }; }

export function StudioViewport({ blurBrush = DEFAULT_BLUR_BRUSH, eraserWidth = 56, project, clips, selectedIds, activeTool, toolStyle, onTool, onSelect, onUpdateItems, onAddAnnotation, onUpdateAnnotation, onUpdateAnnotations, onAddRedaction, onUpdateRedaction, onUpdateRedactions, onErase = () => undefined, onSetViewport, onStageReady }: StudioViewportProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const nodeRefs = useRef(new Map<string, Konva.Node>());
  const selectionRef = useRef(selectedIds);
  const dragStartRef = useRef(new Map<string, { x: number; y: number }>());
  const activeDragId = useRef<string | null>(null);
  const panStartRef = useRef<{ pointer: Point; pan: Point } | null>(null);
  const selectionStartRef = useRef<Point | null>(null);
  const drawRef = useRef<{ start: Point; points: Point[] } | null>(null);
  const eraseRef = useRef<{ ids: Set<string> } | null>(null);
  const [viewport, setViewport] = useState({ width: 800, height: 600 });
  const [selectionRect, setSelectionRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [guides, setGuides] = useState<SnapGuide[]>([]);
  const [drawPreview, setDrawPreview] = useState<{ start: Point; points: Point[] } | null>(null);
  const [raster, setRaster] = useState<HTMLCanvasElement | null>(null);
  const [liveTransforms, setLiveTransforms] = useState<Record<string, Partial<CanvasItem['transform']>>>({});
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [brushPointer, setBrushPointer] = useState<Point | null>(null);
  const [pendingEraseIds, setPendingEraseIds] = useState<string[]>([]);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const images = useBlobImages(clips, project);
  selectionRef.current = selectedIds;

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const update = () => setViewport({ width: Math.max(1, element.clientWidth), height: Math.max(1, element.clientHeight) });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.defaultPrevented || target?.closest('input, textarea, select, button, [role="dialog"]') || target?.isContentEditable) return;
      if (event.code === 'Space' && !event.repeat) { event.preventDefault(); setSpaceHeld(true); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
        event.preventDefault(); onSelect([...project.items.filter((item) => item.visible).map((item) => item.id), ...project.annotations.filter((annotation) => annotation.visible).map(selectionForAnnotation), ...project.redactions.filter((redaction) => redaction.visible).map(selectionForRedaction)]);
      }
      if (event.key === 'Escape') { onSelect([]); setSelectionRect(null); setGuides([]); setDrawPreview(null); setPendingEraseIds([]); drawRef.current = null; eraseRef.current = null; onTool('select'); }
    };
    const keyUp = (event: KeyboardEvent) => { if (event.code === 'Space') setSpaceHeld(false); };
    window.addEventListener('keydown', keyDown); window.addEventListener('keyup', keyUp);
    return () => { window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp); };
  }, [onSelect, onTool, project.annotations, project.items, project.redactions]);

  const fitScale = useMemo(() => Math.max(.01, Math.min((viewport.width - 56) / project.canvas.width, (viewport.height - 56) / project.canvas.height)), [project.canvas.height, project.canvas.width, viewport.height, viewport.width]);
  const scale = fitScale * project.canvas.zoom;
  const origin = { x: (viewport.width - project.canvas.width * scale) / 2 + project.canvas.pan.x, y: (viewport.height - project.canvas.height * scale) / 2 + project.canvas.pan.y };
  const sortedLayers = [...project.items, ...project.annotations, ...project.redactions].filter((layer) => layer.visible).sort((a, b) => a.zIndex - b.zIndex);
  const clipNames = new Map(clips.map((clip) => [clip.id, clip.name]));

  useEffect(() => {
    const locked = new Set([...project.items.filter((item) => item.locked).map((item) => item.id), ...project.annotations.filter((annotation) => annotation.locked).map(selectionForAnnotation), ...project.redactions.filter((redaction) => redaction.locked).map(selectionForRedaction)]);
    const nodes = (activeTool === 'select' ? selectedIds : activeTool === 'text' ? selectedIds.filter((id) => project.annotations.some((a) => a.type === 'text' && selectionForAnnotation(a) === id)) : []).filter((id) => !locked.has(id)).map((id) => nodeRefs.current.get(id)).filter((node): node is Konva.Node => Boolean(node));
    transformerRef.current?.nodes(nodes); transformerRef.current?.getLayer()?.batchDraw();
  }, [activeTool, selectedIds, images, project.items, project.annotations, project.redactions]);

  useEffect(() => {
    const preview = activeTool === 'redact-blur' && drawPreview ? { ...createBlurStroke(drawPreview.points, blurBrush), id: 'brush-preview', zIndex: Math.max(0, ...project.items.map((l) => l.zIndex + 1), ...project.annotations.map((l) => l.zIndex + 1), ...project.redactions.map((l) => l.zIndex + 1)) } : undefined;
    if (!preview && !project.redactions.some((r) => r.visible)) { setRaster(null); return; }
    const frame = requestAnimationFrame(() => {
      const scene = { ...project,
        items: project.items.map((l) => ({ ...l, transform: { ...l.transform, ...liveTransforms[l.id] } })),
        redactions: [...project.redactions.filter((l) => !pendingEraseIds.includes(l.id)).map((l) => ({ ...l, transform: { ...l.transform, ...liveTransforms[selectionForRedaction(l)] } })), ...(preview ? [preview] : [])],
        annotations: project.annotations.filter((l) => !pendingEraseIds.includes(l.id)).map((l) => ({ ...l, transform: { ...l.transform, ...liveTransforms[selectionForAnnotation(l)] } })),
      };
      const previewScale = Math.min(1, 2048 / Math.max(project.canvas.width, project.canvas.height), Math.sqrt(4_000_000 / (project.canvas.width * project.canvas.height)));
      setRaster(renderProjectPixels(scene, images, previewScale));
    });
    return () => cancelAnimationFrame(frame);
  }, [project, images, drawPreview, blurBrush, activeTool, liveTransforms, pendingEraseIds]);

  const pointerInCanvas = () => stageRef.current ? toCanvasPoint(stageRef.current, origin, scale) : { x: 0, y: 0 };
  const updateViewportFromWheel = (event: Konva.KonvaEventObject<WheelEvent>) => {
    event.evt.preventDefault();
    const stage = stageRef.current; const pointer = stage?.getPointerPosition();
    if (!stage || !pointer) return;
    const nextZoom = Math.min(4, Math.max(.25, project.canvas.zoom * (event.evt.deltaY > 0 ? .9 : 1.1)));
    const nextScale = fitScale * nextZoom;
    const canvasPoint = { x: (pointer.x - origin.x) / scale, y: (pointer.y - origin.y) / scale };
    const centered = { x: (viewport.width - project.canvas.width * nextScale) / 2, y: (viewport.height - project.canvas.height * nextScale) / 2 };
    onSetViewport(nextZoom, { x: pointer.x - centered.x - canvasPoint.x * nextScale, y: pointer.y - centered.y - canvasPoint.y * nextScale });
  };
  const beginPan = () => { const pointer = stageRef.current?.getPointerPosition(); if (pointer) panStartRef.current = { pointer, pan: project.canvas.pan }; };
  const movePan = () => { if (!panStartRef.current) return; const pointer = stageRef.current?.getPointerPosition(); if (pointer) onSetViewport(project.canvas.zoom, { x: panStartRef.current.pan.x + pointer.x - panStartRef.current.pointer.x, y: panStartRef.current.pan.y + pointer.y - panStartRef.current.pointer.y }); };
  const endPan = () => { panStartRef.current = null; };

  const beginSelectRect = () => { selectionStartRef.current = pointerInCanvas(); };
  const moveSelectRect = () => { const start = selectionStartRef.current; if (!start) return; const point = pointerInCanvas(); setSelectionRect({ x: Math.min(start.x, point.x), y: Math.min(start.y, point.y), width: Math.abs(point.x - start.x), height: Math.abs(point.y - start.y) }); };
  const endSelectRect = (event: Konva.KonvaEventObject<MouseEvent>) => {
    const start = selectionStartRef.current; selectionStartRef.current = null; if (!start) return;
    const point = pointerInCanvas(); const rect = { x: Math.min(start.x, point.x), y: Math.min(start.y, point.y), width: Math.abs(point.x - start.x), height: Math.abs(point.y - start.y) };
    if (rect.width < 3 && rect.height < 3) { if (!event.evt.shiftKey) onSelect([]); setSelectionRect(null); return; }
    const ids = [...project.items.filter((item) => item.visible && rectIntersects(rect, itemBounds(item))).map((item) => item.id), ...project.annotations.filter((annotation) => annotation.visible && rectIntersects(rect, { x: annotation.transform.x, y: annotation.transform.y, width: annotation.transform.width, height: annotation.transform.height })).map(selectionForAnnotation), ...project.redactions.filter((redaction) => redaction.visible && rectIntersects(rect, { x: redaction.transform.x, y: redaction.transform.y, width: redaction.transform.width, height: redaction.transform.height })).map(selectionForRedaction)];
    onSelect(event.evt.shiftKey ? [...new Set([...selectionRef.current, ...ids])] : ids); setSelectionRect(null);
  };

  const beginDrag = (id: string) => {
    const ids = selectionRef.current.includes(id) ? selectionRef.current : [id];
    if (!selectionRef.current.includes(id)) { selectionRef.current = ids; onSelect(ids); }
    activeDragId.current = id;
    dragStartRef.current = new Map([...project.items.map((item) => [item.id, item.transform]), ...project.annotations.map((annotation) => [selectionForAnnotation(annotation), annotation.transform]), ...project.redactions.map((redaction) => [selectionForRedaction(redaction), redaction.transform])].filter(([key]) => ids.includes(key as string)).map(([key, transform]) => [key as string, { x: (transform as CanvasItem['transform']).x, y: (transform as CanvasItem['transform']).y }]));
  };
  const getLayerBySelection = (id: string) => id.startsWith('annotation:') ? project.annotations.find((annotation) => selectionForAnnotation(annotation) === id) : id.startsWith('redaction:') ? project.redactions.find((redaction) => selectionForRedaction(redaction) === id) : project.items.find((item) => item.id === id);
  const moveDrag = (id: string) => {
    const node = nodeRefs.current.get(id); const start = dragStartRef.current.get(id); const layer = getLayerBySelection(id); if (!node || !start || !layer) return;
    const x = node.x() - layer.transform.width / 2; const y = node.y() - layer.transform.height / 2; const delta = { x: x - start.x, y: y - start.y };
    if (!id.startsWith('annotation:') && !id.startsWith('redaction:') && snapEnabled) { const snapped = snapPosition({ x, y, width: layer.transform.width, height: layer.transform.height }, project.items.filter((candidate) => candidate.id !== id && candidate.visible).map(itemBounds), project.canvas); setGuides(snapped.guides); node.position({ x: snapped.x + layer.transform.width / 2, y: snapped.y + layer.transform.height / 2 }); }
    for (const [selectedId, selectedStart] of dragStartRef.current) { if (selectedId === id) continue; const selectedNode = nodeRefs.current.get(selectedId); const selectedLayer = getLayerBySelection(selectedId); if (selectedNode && selectedLayer) selectedNode.position({ x: selectedStart.x + delta.x + selectedLayer.transform.width / 2, y: selectedStart.y + delta.y + selectedLayer.transform.height / 2 }); }
    refreshLiveTransforms();
  };
  const refreshLiveTransforms = () => {
    const next: Record<string, Partial<CanvasItem['transform']>> = {};
    for (const id of selectionRef.current) {
      const node = nodeRefs.current.get(id); const layer = getLayerBySelection(id);
      if (node && layer) { const width = layer.transform.width * node.scaleX(), height = layer.transform.height * node.scaleY(); next[id] = { x: node.x() - width / 2, y: node.y() - height / 2, width, height, rotation: node.rotation() }; }
    }
    setLiveTransforms(next);
  };
  const endDrag = () => {
    const itemUpdates: Array<{ id: string; transform: Partial<CanvasItem['transform']> }> = []; const annotationUpdates: Array<{ id: string; transform: Partial<Annotation['transform']> }> = []; const redactionUpdates: Array<{ id: string; transform: Partial<Redaction['transform']> }> = [];
    for (const id of dragStartRef.current.keys()) { const node = nodeRefs.current.get(id); const layer = getLayerBySelection(id); if (!node || !layer) continue; const transform = { x: node.x() - layer.transform.width / 2, y: node.y() - layer.transform.height / 2 }; if (id.startsWith('annotation:')) annotationUpdates.push({ id: id.replace('annotation:', ''), transform }); else if (id.startsWith('redaction:')) redactionUpdates.push({ id: id.replace('redaction:', ''), transform }); else itemUpdates.push({ id, transform }); }
    if (itemUpdates.length) onUpdateItems(itemUpdates); const annotationBatch: Array<{ id: string; patch: Partial<Annotation> }> = []; annotationUpdates.forEach((update) => { const current = project.annotations.find((annotation) => annotation.id === update.id); if (current) annotationBatch.push({ id: update.id, patch: { transform: { ...current.transform, ...update.transform } } }); }); const redactionBatch: Array<{ id: string; patch: Partial<Redaction> }> = []; redactionUpdates.forEach((update) => { const current = project.redactions.find((redaction) => redaction.id === update.id); if (current) redactionBatch.push({ id: update.id, patch: { transform: { ...current.transform, ...update.transform } } }); }); onUpdateAnnotations(annotationBatch); onUpdateRedactions(redactionBatch);
    setLiveTransforms({});
    dragStartRef.current.clear(); activeDragId.current = null; setGuides([]);
  };
  const endTransform = () => {
    setLiveTransforms({});
    const transformer = transformerRef.current; if (!transformer) return;
    const itemUpdates: Array<{ id: string; transform: Partial<CanvasItem['transform']> }> = []; const annotationUpdates: Array<{ id: string; transform: Partial<Annotation['transform']> }> = []; const redactionUpdates: Array<{ id: string; transform: Partial<Redaction['transform']> }> = [];
    transformer.nodes().forEach((node) => { const id = node.id(); const layer = getLayerBySelection(id); if (!layer) return; const width = Math.max(24, node.width() * node.scaleX()); const height = Math.max(24, node.height() * node.scaleY()); node.scale({ x: 1, y: 1 }); const transform = { x: node.x() - width / 2, y: node.y() - height / 2, width, height, rotation: node.rotation() }; if (id.startsWith('annotation:')) annotationUpdates.push({ id: id.replace('annotation:', ''), transform }); else if (id.startsWith('redaction:')) redactionUpdates.push({ id: id.replace('redaction:', ''), transform }); else itemUpdates.push({ id, transform }); });
    if (itemUpdates.length) onUpdateItems(itemUpdates); const annotationBatch: Array<{ id: string; patch: Partial<Annotation> }> = []; annotationUpdates.forEach((update) => { const current = project.annotations.find((annotation) => annotation.id === update.id); if (current) annotationBatch.push({ id: update.id, patch: { transform: { ...current.transform, ...update.transform } } }); }); const redactionBatch: Array<{ id: string; patch: Partial<Redaction> }> = []; redactionUpdates.forEach((update) => { const current = project.redactions.find((redaction) => redaction.id === update.id); if (current) redactionBatch.push({ id: update.id, patch: { transform: { ...current.transform, ...update.transform } } }); }); onUpdateAnnotations(annotationBatch); onUpdateRedactions(redactionBatch);
  };

  const beginDrawing = () => { drawRef.current = { start: pointerInCanvas(), points: [pointerInCanvas()] }; setDrawPreview(drawRef.current); };
  const moveDrawing = () => { if (!drawRef.current) return; drawRef.current.points = [...drawRef.current.points, pointerInCanvas()]; setDrawPreview({ ...drawRef.current, points: [...drawRef.current.points] }); };
  const finishDrawing = () => {
    const drawing = drawRef.current; drawRef.current = null; setDrawPreview(null); if (!drawing) return;
    if (activeTool.startsWith('redact-')) { onAddRedaction(createBlurStroke(drawing.points, blurBrush)); return; }
    if (drawing.points.length < 2) return;
    const annotation = createDrawingAnnotation(activeTool, drawing, toolStyle);
    if (annotation) onAddAnnotation(annotation);
  };

  const eraseAt = (point: Point) => {
    const gesture = eraseRef.current;
    if (!gesture) return;
    const radius = eraserWidth / 2;
    const hit = (transform: { x: number; y: number; width: number; height: number }) => point.x >= transform.x - radius && point.x <= transform.x + transform.width + radius && point.y >= transform.y - radius && point.y <= transform.y + transform.height + radius;
    const ids = [...project.annotations.filter((annotation) => annotation.visible && !annotation.locked && hit(annotation.transform)).map(selectionForAnnotation), ...project.redactions.filter((redaction) => redaction.visible && !redaction.locked && hit(redaction.transform)).map(selectionForRedaction)];
    let changed = false;
    ids.forEach((id) => { if (!gesture.ids.has(id)) { gesture.ids.add(id); changed = true; } });
    if (changed) setPendingEraseIds([...gesture.ids]);
  };
  const beginErasing = () => { eraseRef.current = { ids: new Set() }; eraseAt(pointerInCanvas()); };
  const finishErasing = () => {
    const ids = eraseRef.current ? [...eraseRef.current.ids] : [];
    eraseRef.current = null;
    setPendingEraseIds([]);
    if (ids.length) onErase(ids);
  };

  const handleStageDown = (event: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = event.target.getStage(); if (!stage) return;
    if (spaceHeld || event.evt.button === 1) { event.cancelBubble = true; beginPan(); return; }
    const isCanvas = event.target === stage || event.target.name() === 'canvas-background';
    if (activeTool === 'text') {
      if (event.target.findAncestor('.transformer') || project.annotations.some((a) => a.type === 'text' && selectionForAnnotation(a) === event.target.id())) return;
      const point = pointerInCanvas(); const text = window.prompt('输入文字标注');
      if (text) onAddAnnotation(createTextAnnotation(text, point, toolStyle));
      return;
    }
    if (activeTool === 'eraser') { beginErasing(); return; }
    if (activeTool !== 'select') { beginDrawing(); return; }
    if (!isCanvas) return;
    if (!event.evt.shiftKey) onSelect([]); beginSelectRect();
  };
  const handleStageMove = () => { if (activeTool === 'redact-blur' || activeTool === 'eraser') setBrushPointer(pointerInCanvas()); if (panStartRef.current) movePan(); else if (eraseRef.current) { eraseAt(pointerInCanvas()); } else if (drawRef.current) moveDrawing(); else if (selectionStartRef.current) moveSelectRect(); else if (activeDragId.current) moveDrag(activeDragId.current); };
  const handleStageUp = (event: Konva.KonvaEventObject<MouseEvent>) => { if (panStartRef.current) endPan(); else if (eraseRef.current) finishErasing(); else if (drawRef.current) finishDrawing(); else if (selectionStartRef.current) endSelectRect(event); else if (activeDragId.current) endDrag(); };
  const resetView = (zoom: number) => onSetViewport(zoom, { x: 0, y: 0 });

  const registerNode = (id: string) => (node: Konva.Node | null) => { if (node) nodeRefs.current.set(id, node); else nodeRefs.current.delete(id); };
  const selectNode = (id: string, event: Konva.KonvaEventObject<MouseEvent>) => { if (spaceHeld || (activeTool !== 'select' && !(activeTool === 'text' && project.annotations.some((a) => a.type === 'text' && selectionForAnnotation(a) === id)))) return; const selected = selectedIds.includes(id); onSelect(event.evt.shiftKey ? (selected ? selectedIds.filter((value) => value !== id) : [...selectedIds, id]) : [id]); };
  const commonNode = (id: string, transform: CanvasItem['transform'] | Annotation['transform'] | Redaction['transform']) => ({ id, x: transform.x + transform.width / 2, y: transform.y + transform.height / 2, width: transform.width, height: transform.height, offsetX: transform.width / 2, offsetY: transform.height / 2, rotation: transform.rotation, opacity: transform.opacity, ref: registerNode(id), draggable: activeTool === 'select' && !spaceHeld });
  const renderAnnotation = (annotation: Annotation) => {
    const transform = annotation.transform; const common = { ...commonNode(selectionForAnnotation(annotation), transform), draggable: (activeTool === 'select' || (activeTool === 'text' && annotation.type === 'text')) && !annotation.locked && !spaceHeld }; const points = annotation.type === 'text' ? [] : annotation.points.flatMap((point) => [point.x, point.y]);
    const eventProps = { onMouseDown: (event: Konva.KonvaEventObject<MouseEvent>) => selectNode(selectionForAnnotation(annotation), event), onDragStart: () => beginDrag(selectionForAnnotation(annotation)), onDragMove: () => moveDrag(selectionForAnnotation(annotation)), onDragEnd: endDrag };
    if (annotation.type === 'text') return <Text key={annotation.id} {...common} {...eventProps} text={annotation.text} fill={annotation.style.fill} fontSize={annotation.style.fontSize} fontFamily={annotation.style.fontFamily} fontStyle={annotation.style.fontStyle} lineHeight={1.25} width={transform.width} height={transform.height} />;
    if (annotation.type === 'rectangle') return <Rect key={annotation.id} {...common} {...eventProps} stroke={annotation.style.stroke} strokeWidth={annotation.style.strokeWidth} fill={annotation.style.fill} />;
    if (annotation.type === 'ellipse') return <Ellipse key={annotation.id} {...common} {...eventProps} x={common.x} y={common.y} offsetX={0} offsetY={0} radiusX={transform.width / 2} radiusY={transform.height / 2} stroke={annotation.style.stroke} strokeWidth={annotation.style.strokeWidth} fill={annotation.style.fill} />;
    return annotation.type === 'arrow' ? <Arrow key={annotation.id} {...common} {...eventProps} points={points} stroke={annotation.style.stroke} strokeWidth={annotation.style.strokeWidth} fill={annotation.style.stroke} pointerLength={annotation.style.arrowSize} pointerWidth={annotation.style.arrowSize} /> : <Line key={annotation.id} {...common} {...eventProps} points={points} stroke={annotation.style.stroke} strokeWidth={annotation.style.strokeWidth} opacity={transform.opacity * (annotation.style.opacity ?? 1)} lineCap={annotation.style.lineCap} lineJoin={annotation.style.lineJoin} />;
  };

  const renderItem = (item: CanvasItem) => { const common = commonNode(item.id, item.transform); const selected = selectedIds.includes(item.id); const image = item.type === 'image' ? images.get(item.clipId) : undefined; const props = { onMouseDown: (event: Konva.KonvaEventObject<MouseEvent>) => selectNode(item.id, event), onDragStart: () => beginDrag(item.id), onDragMove: () => moveDrag(item.id), onDragEnd: endDrag };
          if (item.type === 'image') return image ? <KonvaImage key={item.id} {...common} {...props} image={image} cornerRadius={item.style.cornerRadius} stroke={item.style.border?.color} strokeWidth={item.style.border?.width} shadowColor={item.style.shadow?.color} shadowBlur={item.style.shadow?.blur} shadowOffsetX={item.style.shadow?.offsetX} shadowOffsetY={item.style.shadow?.offsetY} draggable={activeTool === 'select' && !item.locked && !spaceHeld} /> : <Group key={item.id} {...common} {...props}><Rect x={-item.transform.width / 2} y={-item.transform.height / 2} width={item.transform.width} height={item.transform.height} fill="#e2e8f0" /><Text text={clipNames.get(item.clipId) ?? '素材加载中'} x={-item.transform.width / 2 + 12} y={-item.transform.height / 2 + 12} fill="#64748b" />{selected && <Rect name="selection-overlay" x={-item.transform.width / 2 - 4} y={-item.transform.height / 2 - 4} width={item.transform.width + 8} height={item.transform.height + 8} stroke="#7c3aed" dash={[6, 4]} listening={false} />}</Group>;
          return <Text key={item.id} {...common} {...props} text={item.type === 'text' ? item.text : item.type} fill="#334155" />;
  };
  const renderRedaction = (r: Redaction) => {
          const common = commonNode(selectionForRedaction(r), r.transform);
          return <Group key={r.id} {...common} draggable={activeTool === 'select' && !r.locked && !spaceHeld} onMouseDown={(event) => selectNode(selectionForRedaction(r), event)} onDragStart={() => beginDrag(selectionForRedaction(r))} onDragMove={() => moveDrag(selectionForRedaction(r))} onDragEnd={endDrag}>{r.points?.length ? <Group scaleX={r.transform.width / r.bounds.width} scaleY={r.transform.height / r.bounds.height}>{r.points.length === 1 ? <Ellipse x={r.points[0].x} y={r.points[0].y} radiusX={(r.style.brushWidth ?? 80) / 2} radiusY={(r.style.brushWidth ?? 80) / 2} fill="#b85c3d" /> : <Line points={r.points.flatMap((p) => [p.x, p.y])} stroke="#b85c3d" strokeWidth={r.style.brushWidth ?? 80} lineCap="round" lineJoin="round" />}</Group> : <Rect width={r.transform.width} height={r.transform.height} fill="#b85c3d" />}</Group>;

  };

  return <div className={`studio-viewport tool-${activeTool}`} ref={containerRef}>
    <div className="viewport-badge"><span>{Math.round(scale * 100)}%</span><button onClick={() => resetView(1)}>适应</button><button onClick={() => resetView(Math.min(4, 1 / Math.max(.01, fitScale)))}>100%</button><button className={snapEnabled ? 'active' : ''} onClick={() => setSnapEnabled((value) => !value)}>吸附</button></div>
    <Stage width={viewport.width} height={viewport.height} ref={(stage) => { stageRef.current = stage; onStageReady(stage); }} onWheel={updateViewportFromWheel} onMouseDown={handleStageDown} onMouseMove={handleStageMove} onMouseLeave={() => setBrushPointer(null)} onMouseUp={handleStageUp}>
      <Layer><Group x={origin.x} y={origin.y} scaleX={scale} scaleY={scale}>
        <Rect name="canvas-background" width={project.canvas.width} height={project.canvas.height} fill={typeof project.canvas.background === 'string' ? project.canvas.background : undefined} fillLinearGradientStartPoint={{ x: 0, y: 0 }} fillLinearGradientEndPoint={{ x: project.canvas.width, y: project.canvas.height }} fillLinearGradientColorStops={typeof project.canvas.background === 'string' ? undefined : [0, '#f8fafc', 1, '#c4b5fd']} shadowColor="#292823" shadowBlur={18} shadowOpacity={.10} />
        <Group opacity={raster ? 0 : 1}>
        {sortedLayers.filter((layer) => !pendingEraseIds.includes(layer.id)).map((layer) => 'bounds' in layer ? renderRedaction(layer) : project.items.some((item) => item.id === layer.id) ? renderItem(layer as CanvasItem) : renderAnnotation(layer as Annotation))}
        </Group>
        {raster && <KonvaImage image={raster} width={project.canvas.width} height={project.canvas.height} listening={false} />}
        {activeTool === 'redact-blur' && brushPointer && !spaceHeld && <Ellipse name="selection-overlay" x={brushPointer.x} y={brushPointer.y} radiusX={blurBrush.width / 2} radiusY={blurBrush.width / 2} stroke="#706d64" strokeWidth={1 / scale} shadowColor="#fff" shadowBlur={2 / scale} listening={false} />}
        {activeTool === 'eraser' && brushPointer && !spaceHeld && <Ellipse name="selection-overlay" x={brushPointer.x} y={brushPointer.y} radiusX={eraserWidth / 2} radiusY={eraserWidth / 2} stroke="#706d64" strokeWidth={1 / scale} fill="rgba(255,255,255,.35)" shadowColor="#fff" shadowBlur={2 / scale} listening={false} />}

        {guides.map((guide, index) => guide.axis === 'x' ? <Line name="selection-overlay" key={`guide-x-${index}`} points={[guide.position, 0, guide.position, project.canvas.height]} stroke="#f472b6" strokeWidth={1 / scale} dash={[5 / scale, 4 / scale]} listening={false} /> : <Line name="selection-overlay" key={`guide-y-${index}`} points={[0, guide.position, project.canvas.width, guide.position]} stroke="#f472b6" strokeWidth={1 / scale} dash={[5 / scale, 4 / scale]} listening={false} />)}
        {selectionRect && <Rect name="selection-overlay" x={selectionRect.x} y={selectionRect.y} width={selectionRect.width} height={selectionRect.height} stroke="#b85c3d" strokeWidth={1 / scale} dash={[5 / scale, 4 / scale]} fill="rgba(184,92,61,.10)" listening={false} />}
        {drawPreview && activeTool !== 'text' && !activeTool.startsWith('redact-') && <Line name="selection-overlay" points={drawPreview.points.flatMap((point) => [point.x, point.y])} stroke={toolStyle.stroke ?? '#b85c3d'} opacity={toolStyle.opacity ?? 1} strokeWidth={toolStyle.strokeWidth ?? 3} lineCap="round" lineJoin="round" />}

        <Transformer name="selection-overlay transformer" ref={(node) => { transformerRef.current = node; }} borderStroke="#b85c3d" anchorStroke="#b85c3d" anchorFill="#ffffff" anchorCornerRadius={2} rotateEnabled enabledAnchors={['top-left', 'top-center', 'top-right', 'middle-right', 'bottom-right', 'bottom-center', 'bottom-left', 'middle-left']} keepRatio boundBoxFunc={(oldBox, newBox) => Math.abs(newBox.width) < 24 || Math.abs(newBox.height) < 24 ? oldBox : newBox} onTransform={refreshLiveTransforms} onTransformEnd={endTransform} shouldOverdrawWholeArea />
      </Group></Layer>
    </Stage>
  </div>;
}
