export interface TagRecord {
  id: string;
  name: string;
  color: string;
  createdAt: number;
  updatedAt: number;
}

export interface CollectionRecord {
  id: string;
  name: string;
  description: string;
  coverClipId?: string;
  clipIds: string[];
  createdAt: number;
  updatedAt: number;
}

export const DEFAULT_TAG_COLORS = ['#a78bfa', '#38bdf8', '#34d399', '#fbbf24', '#fb7185', '#f472b6', '#94a3b8'];

export function normalizeTagName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}
