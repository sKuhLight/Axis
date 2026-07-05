export const AXIS_PRESET_BROWSER_PARTS = ['full', 'sources', 'list', 'detail'] as const;

export type AxisPresetBrowserPart = (typeof AXIS_PRESET_BROWSER_PARTS)[number];

export const AXIS_PRESET_BROWSER_PANEL_PREFIX = 'axis.presetBrowser';

export function isAxisPresetBrowserPart(value: string): value is AxisPresetBrowserPart {
  return (AXIS_PRESET_BROWSER_PARTS as readonly string[]).includes(value);
}

export function parseAxisPresetBrowserPart(value: unknown, fallback: AxisPresetBrowserPart = 'full'): AxisPresetBrowserPart {
  return typeof value === 'string' && isAxisPresetBrowserPart(value) ? value : fallback;
}

export function axisPresetBrowserPanelType(part: AxisPresetBrowserPart): string {
  return part === 'full' ? AXIS_PRESET_BROWSER_PANEL_PREFIX : `${AXIS_PRESET_BROWSER_PANEL_PREFIX}.${part}`;
}

export function axisPresetBrowserPartFromPanelType(type: string): AxisPresetBrowserPart {
  if (type === AXIS_PRESET_BROWSER_PANEL_PREFIX) return 'full';
  const part = type.slice(`${AXIS_PRESET_BROWSER_PANEL_PREFIX}.`.length);
  return parseAxisPresetBrowserPart(part, 'full');
}

export interface AxisPresetBrowserSelection {
  sourceId: string;
  entryId: string | null;
  focusedBlockEffectId: number | null;
}
