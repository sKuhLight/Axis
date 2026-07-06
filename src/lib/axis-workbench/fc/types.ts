// Registry-facing FC parts: each of these becomes an `axis.fc[.part]` panel type
// (axisWorkbenchRegistryManifest maps AXIS_FC_PARTS via axisFcPanelType).
export const AXIS_FC_PARTS = ['full', 'board', 'inspector', 'layouts', 'led', 'tap', 'hold'] as const;

// Renderable parts: the design's `fc-part="grid"` (04-fc-and-grid.md §1.1) additionally
// mounts the Signal Grid inside an FC panel via `panel.state.part = 'grid'`. It is NOT in
// AXIS_FC_PARTS on purpose — the grid already has its own singleton panel type
// (`axis.signalGrid`), so no second registry panel type is minted for it.
export const AXIS_FC_RENDER_PARTS = [...AXIS_FC_PARTS, 'grid'] as const;

export type AxisFcPart = (typeof AXIS_FC_RENDER_PARTS)[number];

export const AXIS_FC_PANEL_PREFIX = 'axis.fc';

export interface AxisFcSelection {
  layout: number;
  view: number;
  switchIndex: number | null;
  side: 'tap' | 'hold';
}

export function isAxisFcPart(value: string): value is AxisFcPart {
  return (AXIS_FC_RENDER_PARTS as readonly string[]).includes(value);
}

export function parseAxisFcPart(value: unknown, fallback: AxisFcPart = 'full'): AxisFcPart {
  return typeof value === 'string' && isAxisFcPart(value) ? value : fallback;
}

export function axisFcPanelType(part: AxisFcPart): string {
  return part === 'full' ? AXIS_FC_PANEL_PREFIX : `${AXIS_FC_PANEL_PREFIX}.${part}`;
}

export function axisFcPartFromPanelType(type: string): AxisFcPart {
  if (type === AXIS_FC_PANEL_PREFIX) return 'full';
  const part = type.slice(`${AXIS_FC_PANEL_PREFIX}.`.length);
  return parseAxisFcPart(part, 'full');
}
