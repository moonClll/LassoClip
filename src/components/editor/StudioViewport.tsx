import { useEffect, useMemo, useRef, useState } from 'react';
import Konva from 'konva';
import { Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text, Transformer } from 'react-konva';
import type { ClipItemRecord } from '../../types/capture';
import type { CanvasItem, ClipProject } from '../../types/editor';
import { itemBounds, rectIntersects, snapPosition, type SnapGuide } from '../../modules/canvas-editor/transform';

interface StudioViewportProps {
  project: ClipProject;
  clips: ClipItemRecord[];
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  onUpdateItems: (updates: Array<{ id: string; transform: Partial<CanvasItem['transform']> }>) => void;
  onSetViewport: (zoom: number, pan: { x: number; y: number }) => void;
  onStageReady: (stage: Konva.Stage | null) => void;
}

function useBlobImages(clips: ClipItemRecord[]): Map<string, HTMLImageElement> {
  const [images, setImages] = useState<Map<string, HTMLImageElement>>(new Map());
  useEffect(() => {
    let disposed = false;
    const urls: string[] = [];
    setImages(new Map());
    for (const clip of clips) {
      const url = URL.createObjectURL(clip.imageBlob);
      urls.push(url);
      const image = new Image();
      image.onload = () => { if (!disposed) setImages((current) => new Map(current).set(clip.id, image)); };
      image.src = url;
    }
    return () => { disposed = true; urls.forEach((url) => URL.revokeObjectURL(url)); };
  }, [clips]);
  return images;
}

function toCanvasPoint(stage: Konva.Stage, stageX: number, stageY: number, origin: { x: number; y: number }, scale: number): { x: number; y: number } {
  return { x: (stageX - origin.x) / scale, y: (stageY - origin.y) / scale };
}

export function StudioViewport({ project, clips, selectedIds, onSelect, onUpdateItems, onSetViewport, onStageReady }: StudioViewportProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const nodeRefs = useRef(new Map<string, Konva.Node>());
  const selectionRef = useRef(selectedIds);
  const dragStartRef = useRef(new Map<string, { x: number; y: number }>());
  const activeDragId = useRef<string | null>(null);
  const panStartRef = useRef<{ pointer: { x: number; y: number }; pan: { x: number; y: number } } | null>(null);
  const selectionStartRef = useRef<{ x: number; y: number } | null>(null);
  const [viewport, setViewport] = useState({ width: 800, height: 600 });
  const [selectionRect, setSelectionRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [guides, setGuides] = useState<SnapGuide[]>([]);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const images = useBlobImages(clips);
  selectionRef.current = selectedIds;

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const update = () => setViewport({ width: Math.max(320, element.clientWidth), height: Math.max(320, element.clientHeight) });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !event.repeat) { event.preventDefault(); setSpaceHeld(true); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
        event.preventDefault(); onSelect(project.items.filter((item) => item.visible).map((item) => item.id));
      }
      if (event.key === 'Escape') { onSelect([]); setSelectionRect(null); setGuides([]); }
    };
    const keyUp = (event: KeyboardEvent) => { if (event.code === 'Space') setSpaceHeld(false); };
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    return () => { window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp); };
  }, [onSelect, project.items]);

  const fitScale = useMemo(() => Math.min((viewport.width - 56) / project.canvas.width, (viewport.height - 56) / project.canvas.height), [project.canvas.height, project.canvas.width, viewport.height, viewport.width]);
  const scale = fitScale * project.canvas.zoom;
  const stageOrigin = { x: (viewport.width - project.canvas.width * scale) / 2 + project.canvas.pan.x, y: (viewport.height - project.canvas.height * scale) / 2 + project.canvas.pan.y };
  const sortedItems = [...project.items].sort((a, b) => a.zIndex - b.zIndex);
  const clipNames = new Map(clips.map((clip) => [clip.id, clip.name]));

  useEffect(() => {
    const nodes = selectedIds.filter((id) => !project.items.find((item) => item.id === id)?.locked).map((id) => nodeRefs.current.get(id)).filter((node): node is Konva.Node => Boolean(node));
    transformerRef.current?.nodes(nodes);
    transformerRef.current?.getLayer()?.batchDraw();
  }, [selectedIds, images, project.items]);

  const pointerInCanvas = () => {
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    return stage && pointer ? toCanvasPoint(stage, pointer.x, pointer.y, stageOrigin, scale) : null;
  };

  const updateViewportFromWheel = (event: Konva.KonvaEventObject<WheelEvent>) => {
    event.evt.preventDefault();
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (!stage || !pointer) return;
    const oldScale = scale;
    const nextZoom = Math.min(4, Math.max(.25, project.canvas.zoom * (event.evt.deltaY > 0 ? .9 : 1.1)));
    const nextScale = fitScale * nextZoom;
    const canvasPoint = toCanvasPoint(stage, pointer.x, pointer.y, stageOrigin, oldScale);
    const centeredOrigin = { x: (viewport.width - project.canvas.width * nextScale) / 2, y: (viewport.height - project.canvas.height * nextScale) / 2 };
    onSetViewport(nextZoom, { x: pointer.x - centeredOrigin.x - canvasPoint.x * nextScale, y: pointer.y - centeredOrigin.y - canvasPoint.y * nextScale });
  };

  const beginPan = () => {
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (stage && pointer) panStartRef.current = { pointer, pan: project.canvas.pan };
  };
  const movePan = () => {
    if (!panStartRef.current) return;
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer) return;
    onSetViewport(project.canvas.zoom, { x: panStartRef.current.pan.x + pointer.x - panStartRef.current.pointer.x, y: panStartRef.current.pan.y + pointer.y - panStartRef.current.pointer.y });
  };
  const endPan = () => { panStartRef.current = null; };

  const beginSelection = () => {
    const point = pointerInCanvas();
    if (point) selectionStartRef.current = point;
  };
  const moveSelection = () => {
    const start = selectionStartRef.current;
    const point = pointerInCanvas();
    if (!start || !point) return;
    setSelectionRect({ x: Math.min(start.x, point.x), y: Math.min(start.y, point.y), width: Math.abs(point.x - start.x), height: Math.abs(point.y - start.y) });
  };
  const endSelection = (event: Konva.KonvaEventObject<MouseEvent>) => {
    const start = selectionStartRef.current;
    const point = pointerInCanvas();
    selectionStartRef.current = null;
    if (!start || !point) return;
    const rect = { x: Math.min(start.x, point.x), y: Math.min(start.y, point.y), width: Math.abs(point.x - start.x), height: Math.abs(point.y - start.y) };
    if (rect.width < 3 && rect.height < 3) { if (!event.evt.shiftKey) onSelect([]); setSelectionRect(null); return; }
    const selected = project.items.filter((item) => item.visible && rectIntersects(rect, itemBounds(item))).map((item) => item.id);
    onSelect(event.evt.shiftKey ? [...new Set([...selectionRef.current, ...selected])] : selected);
    setSelectionRect(null);
  };

  const beginDrag = (id: string) => {
    const clicked = project.items.find((item) => item.id === id);
    if (clicked?.locked) return;
    const ids = (selectionRef.current.includes(id) ? selectionRef.current : [id]).filter((selectedId) => !project.items.find((item) => item.id === selectedId)?.locked);
    if (!selectionRef.current.includes(id)) { selectionRef.current = ids; onSelect(ids); }
    activeDragId.current = id;
    dragStartRef.current = new Map(project.items.filter((item) => ids.includes(item.id)).map((item) => [item.id, { x: item.transform.x, y: item.transform.y }]));
  };
  const moveDrag = (id: string) => {
    const node = nodeRefs.current.get(id);
    const start = dragStartRef.current.get(id);
    const item = project.items.find((candidate) => candidate.id === id);
    if (!node || !start || !item) return;
    let x = node.x() - item.transform.width / 2;
    let y = node.y() - item.transform.height / 2;
    if (snapEnabled) {
      const snapped = snapPosition({ x, y, width: item.transform.width, height: item.transform.height }, project.items.filter((candidate) => candidate.id !== id && candidate.visible).map(itemBounds), project.canvas);
      x = snapped.x;
      y = snapped.y;
      setGuides(snapped.guides);
      node.position({ x: x + item.transform.width / 2, y: y + item.transform.height / 2 });
    }
    for (const [selectedId, selectedStart] of dragStartRef.current) {
      if (selectedId === id) continue;
      const selectedNode = nodeRefs.current.get(selectedId);
      const selectedItem = project.items.find((candidate) => candidate.id === selectedId);
      if (selectedNode && selectedItem) selectedNode.position({ x: selectedStart.x + (x - start.x) + selectedItem.transform.width / 2, y: selectedStart.y + (y - start.y) + selectedItem.transform.height / 2 });
    }
  };
  const endDrag = () => {
    const updates = [...dragStartRef.current.keys()].map((id) => {
      const node = nodeRefs.current.get(id);
      const item = project.items.find((candidate) => candidate.id === id);
      return node && item ? { id, transform: { x: node.x() - item.transform.width / 2, y: node.y() - item.transform.height / 2 } } : null;
    }).filter((update): update is { id: string; transform: { x: number; y: number } } => Boolean(update));
    if (updates.length) onUpdateItems(updates);
    dragStartRef.current.clear();
    activeDragId.current = null;
    setGuides([]);
  };
  const endTransform = () => {
    const transformer = transformerRef.current;
    if (!transformer) return;
    const updates = transformer.nodes().map((node): { id: string; transform: Partial<CanvasItem['transform']> } | null => {
      const id = node.id();
      const item = project.items.find((candidate) => candidate.id === id);
      if (!item) return null;
      const width = Math.max(24, node.width() * node.scaleX());
      const height = Math.max(24, node.height() * node.scaleY());
      node.scale({ x: 1, y: 1 });
      return { id, transform: { x: node.x() - width / 2, y: node.y() - height / 2, width, height, rotation: node.rotation() } };
    }).filter((update): update is { id: string; transform: Partial<CanvasItem['transform']> } => Boolean(update));
    if (updates.length) onUpdateItems(updates);
  };

  const handleStageDown = (event: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = event.target.getStage();
    if (!stage) return;
    if (spaceHeld || event.evt.button === 1) { event.cancelBubble = true; beginPan(); return; }
    const isCanvas = event.target === stage || event.target.name() === 'canvas-background';
    if (isCanvas) { if (!event.evt.shiftKey) onSelect([]); beginSelection(); }
  };
  const resetView = (zoom: number) => onSetViewport(zoom, { x: 0, y: 0 });

  return <div className="studio-viewport" ref={containerRef}>
    <div className="viewport-badge"><span>{Math.round(scale * 100)}%</span><button onClick={() => resetView(1)}>适应</button><button onClick={() => resetView(Math.min(4, 1 / Math.max(.01, fitScale)))}>100%</button><button className={snapEnabled ? 'active' : ''} onClick={() => setSnapEnabled((value) => !value)}>吸附</button></div>
    <Stage width={viewport.width} height={viewport.height} ref={(stage) => { stageRef.current = stage; onStageReady(stage); }} onWheel={updateViewportFromWheel} onMouseDown={handleStageDown} onMouseMove={() => { if (panStartRef.current) movePan(); else if (selectionStartRef.current) moveSelection(); else if (activeDragId.current) moveDrag(activeDragId.current); }} onMouseUp={(event) => { if (panStartRef.current) endPan(); else if (selectionStartRef.current) endSelection(event); else if (activeDragId.current) endDrag(); }}>
      <Layer>
        <Group x={stageOrigin.x} y={stageOrigin.y} scaleX={scale} scaleY={scale}>
          <Rect name="canvas-background" width={project.canvas.width} height={project.canvas.height} fill={typeof project.canvas.background === 'string' ? project.canvas.background : '#f8fafc'} shadowColor="#020617" shadowBlur={24} shadowOpacity={.2} />
          {sortedItems.filter((item) => item.visible).map((item) => {
            const x = item.transform.x + item.transform.width / 2;
            const y = item.transform.y + item.transform.height / 2;
            const common = { id: item.id, x, y, width: item.transform.width, height: item.transform.height, offsetX: item.transform.width / 2, offsetY: item.transform.height / 2, rotation: item.transform.rotation, opacity: item.transform.opacity, draggable: !item.locked && !spaceHeld, ref: (node: Konva.Node | null) => { if (node) nodeRefs.current.set(item.id, node); else nodeRefs.current.delete(item.id); }, onMouseDown: (event: Konva.KonvaEventObject<MouseEvent>) => { const selected = selectedIds.includes(item.id); onSelect(event.evt.shiftKey ? (selected ? selectedIds.filter((id) => id !== item.id) : [...selectedIds, item.id]) : [item.id]); }, onDragStart: () => beginDrag(item.id), onDragMove: () => moveDrag(item.id), onDragEnd: endDrag };
            if (item.type === 'image') {
              const image = images.get(item.clipId);
              return image ? <KonvaImage key={item.id} {...common} image={image} /> : <Group key={item.id} {...common}><Rect width={item.transform.width} height={item.transform.height} offsetX={item.transform.width / 2} offsetY={item.transform.height / 2} fill="#e2e8f0" /><Text text={clipNames.get(item.clipId) ?? '素材加载中'} x={-item.transform.width / 2 + 12} y={-item.transform.height / 2 + 12} fill="#64748b" /></Group>;
            }
            return <Text key={item.id} {...common} text={item.type === 'text' ? item.text : item.type} fill="#334155" />;
          })}
          {guides.map((guide, index) => guide.axis === 'x' ? <Line name="selection-overlay" key={`guide-x-${index}`} points={[guide.position, 0, guide.position, project.canvas.height]} stroke="#f472b6" strokeWidth={1 / scale} dash={[5 / scale, 4 / scale]} listening={false} /> : <Line name="selection-overlay" key={`guide-y-${index}`} points={[0, guide.position, project.canvas.width, guide.position]} stroke="#f472b6" strokeWidth={1 / scale} dash={[5 / scale, 4 / scale]} listening={false} />)}
          {selectionRect && <Rect name="selection-overlay" x={selectionRect.x} y={selectionRect.y} width={selectionRect.width} height={selectionRect.height} stroke="#c4b5fd" strokeWidth={1 / scale} dash={[5 / scale, 4 / scale]} fill="rgba(124,58,237,.12)" listening={false} />}
          <Transformer name="selection-overlay transformer" ref={(node) => { transformerRef.current = node; }} rotateEnabled enabledAnchors={['top-left', 'top-center', 'top-right', 'middle-right', 'bottom-right', 'bottom-center', 'bottom-left', 'middle-left']} keepRatio boundBoxFunc={(oldBox, newBox) => (Math.abs(newBox.width) < 24 || Math.abs(newBox.height) < 24 ? oldBox : newBox)} onTransformEnd={endTransform} shouldOverdrawWholeArea />
        </Group>
      </Layer>
    </Stage>
  </div>;
}
