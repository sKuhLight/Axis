// Block-editor split parts (design `be-part`, 05-block-editor.md). Only the modifier part is a
// separate registered panel today ("full" is the classic embedded editor); the enum is kept as a
// list so the panel-type helpers mirror the FC / Preset Browser part conventions.
export const AXIS_BLOCK_EDITOR_PARTS = ['full', 'modifier'] as const;

export type AxisBlockEditorPart = (typeof AXIS_BLOCK_EDITOR_PARTS)[number];

export const AXIS_BLOCK_EDITOR_PANEL_PREFIX = 'axis.blockEditor';

export function isAxisBlockEditorPart(value: string): value is AxisBlockEditorPart {
  return (AXIS_BLOCK_EDITOR_PARTS as readonly string[]).includes(value);
}

export function parseAxisBlockEditorPart(
  value: unknown,
  fallback: AxisBlockEditorPart = 'full'
): AxisBlockEditorPart {
  return typeof value === 'string' && isAxisBlockEditorPart(value) ? value : fallback;
}

export function axisBlockEditorPanelType(part: AxisBlockEditorPart): string {
  return part === 'full' ? AXIS_BLOCK_EDITOR_PANEL_PREFIX : `${AXIS_BLOCK_EDITOR_PANEL_PREFIX}.${part}`;
}

export function axisBlockEditorPartFromPanelType(type: string): AxisBlockEditorPart {
  if (type === AXIS_BLOCK_EDITOR_PANEL_PREFIX) return 'full';
  const part = type.slice(`${AXIS_BLOCK_EDITOR_PANEL_PREFIX}.`.length);
  return parseAxisBlockEditorPart(part, 'full');
}

// The parameter the modifier panel is currently editing — the typed replacement for the design's
// shared `modParam` / `modBlock` bus keys plus the decoded device addressing (block eid + paramId)
// the flyout already uses to bind a modifier slot to a control.
export interface AxisModifierTarget {
  /** Display label of the parameter (e.g. "Gain"). */
  label: string;
  /** Owning block's display name (design `modBlock`), for the panel subtitle. */
  block: string;
  /** Target block effectId for the /mod/bind call, or null when not addressable. */
  targetEffectId: number | null;
  /** Target parameter id for the /mod/bind call, or null when not addressable. */
  targetParam: number | null;
  /** Modifier slot (1-based) to edit. */
  slot: number;
}
