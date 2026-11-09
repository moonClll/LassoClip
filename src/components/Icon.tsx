import type { CSSProperties } from 'react';

const paths = {
  capture: 'M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m8 0h3a2 2 0 0 0 2-2v-3M8 8h8v8H8z',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  edit: 'm16 3 5 5M4 20l4-1L21 6l-5-5L3 14l-1 8z',
  arrowUpRight: 'M7 17 17 7M7 7h10v10',
  clock: 'M12 8v4l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8',
  folder: 'M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  layers: 'm12 3 10 5-10 5L2 8zM2 12l10 5 10-5M2 16l10 5 10-5',
  search: 'm21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  plus: 'M12 5v14M5 12h14',
  select: 'm4 3 7 18 2-8 8-2z',
  text: 'M4 5V3h16v2M12 3v18M8 21h8',
  arrow: 'M4 20 20 4M8 4h12v12',
  line: 'M4 20 20 4',
  rectangle: 'M3 5h18v14H3z',
  ellipse: 'M22 12a10 7 0 1 1-20 0 10 7 0 0 1 20 0',
  pen: 'm16 3 5 5M4 20l4-1L21 6l-5-5L3 14l-1 8z',
  highlight: 'm9 11 6-8 6 6-8 6zM9 11l4 4-4 4H5v-4zM3 22h18',
  shield: 'M12 3 3 7v6c0 5 9 9 9 9s9-4 9-9V7zM9 12l2 2 4-4',
  undo: 'M3 8h10a6 6 0 0 1 0 12H9M3 8l5-5M3 8l5 5',
  redo: 'M21 8H11a6 6 0 0 0 0 12h4M21 8l-5-5M21 8l-5 5',
  download: 'M12 3v12m-5-5 5 5 5-5M3 16v5h18v-5',
  eye: 'M2 12s4-8 10-8 10 8 10 8-4 8-10 8S2 12 2 12M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  eyeOff: 'M3 3l18 18M10 4c7-1 12 8 12 8s-1 3-4 5M6 6c-3 2-4 6-4 6s4 8 10 8c2 0 3 0 5-1',
  lock: 'M5 10h14v11H5zM8 10V6a4 4 0 0 1 8 0v4',
  unlock: 'M5 10h14v11H5zM8 10V6a4 4 0 0 1 8 0',
  copy: 'M8 8h13v13H8zM16 8V3H3v13h5',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
  up: 'm6 12 6-6 6 6M12 6v15',
  down: 'm6 12 6 6 6-6M12 3v15',
  top: 'M4 3h16m-14 10 6-6 6 6M12 7v14',
  bottom: 'M4 21h16m-14-10 6 6 6-6M12 3v14',
  check: 'm5 12 4 4L19 6',
  close: 'm6 6 12 12M6 18 18 6',
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, style }: { name: IconName; style?: CSSProperties }): React.JSX.Element {
  return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}><path d={paths[name]} /></svg>;
}
