export const DEFAULT_PROJECT_NAME = '未命名项目';

export function normalizeProjectName(value: string): string | undefined {
  const name = value.trim();
  return name.length > 0 ? name : undefined;
}

/** Native prompt keeps this dialog keyboard accessible: Enter confirms, Esc cancels. */
export function promptProjectName(initial = DEFAULT_PROJECT_NAME): string | undefined {
  if (typeof window === 'undefined') return DEFAULT_PROJECT_NAME;
  const value = window.prompt('项目名称', initial);
  if (value === null) return undefined;
  const name = normalizeProjectName(value);
  if (!name) {
    window.alert('项目名称不能为空');
    return undefined;
  }
  return name;
}
