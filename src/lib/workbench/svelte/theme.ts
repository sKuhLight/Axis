export interface WorkbenchTheme {
  name: string;
  className?: string;
  vars?: Record<`--${string}`, string>;
  density?: 'comfortable' | 'compact' | 'dense';
  radius?: 'sharp' | 'soft' | 'round';
}

export function workbenchThemeStyle(theme?: WorkbenchTheme): string {
  if (!theme?.vars) return '';
  return Object.entries(theme.vars)
    .map(([key, value]) => `${key}: ${value}`)
    .join('; ');
}
