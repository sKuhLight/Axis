/**
 * Axis data for the Add palette (pure, unit-tested): the built-in widget types
 * the palette offers (registered through `registerWidgetCatalogProvider`), the
 * widget types that get a STATIC preview card, and the schematic glyph of a
 * panel card. The palette component is `AxisAddPalette.svelte`.
 */
import type { CanonicalWidgetSpec } from '../workbench/core';
import { AXIS_WORKBENCH_WIDGET_TYPES } from './axisWorkbenchRegistryManifest';

/** Card titles of the built-in widget types. */
export const AXIS_WIDGET_LABELS: Record<string, string> = {
  'axis.logo': 'Logo',
  'axis.preset': 'Preset',
  'axis.scenes': 'Scenes',
  'axis.view': 'View',
  'axis.addBlock': 'Add block',
  'axis.tuner': 'Tuner',
  'axis.tempo': 'Tempo',
  'axis.cpu': 'CPU load',
  'axis.meterToggle': 'Block meters',
  'axis.save': 'Save',
  'axis.search': 'Search',
  'axis.history': 'History',
  'axis.gridMap': 'Grid map',
  'axis.undoRedo': 'Undo / Redo',
  'axis.connection': 'Connection',
  'axis.account': 'Account',
  'axis.gridMode': 'Grid mode',
  'axis.blockSize': 'Block size',
  'axis.fcDevice': 'FC device',
  'axis.fcLayouts': 'FC layouts',
  'axis.fcSwitchView': 'FC switch view',
  'axis.paramControl': 'Parameter control',
  'axis.hint': 'Hint line',
  'axis.legal': 'Support & imprint',
  'axis.telemetry': 'Telemetry'
};

/**
 * Types the palette never offers as a fresh built-in: a parameter control is
 * made by pinning a parameter (a hidden one still shows as a card).
 */
const NOT_OFFERED = new Set(['axis.paramControl']);

/** Default state a fresh instance starts with (matches the default document's seeds). */
const DEFAULT_STATE: Record<string, CanonicalWidgetSpec['state']> = {
  'axis.gridMode': { mode: 'auto' },
  'axis.blockSize': { size: 'M' }
};

const KEYWORDS: Record<string, string[]> = {
  'axis.cpu': ['cpu', 'load'],
  'axis.meterToggle': ['meter'],
  'axis.undoRedo': ['undo', 'redo'],
  'axis.legal': ['kofi', 'imprint', 'legal'],
  'axis.fcDevice': ['footswitch', 'foot controller'],
  'axis.fcLayouts': ['footswitch', 'foot controller'],
  'axis.fcSwitchView': ['footswitch', 'foot controller'],
  'axis.telemetry': ['polling', 'traffic']
};

/** The built-in widget types the Add palette offers, in manifest order. */
export function axisCanonicalWidgets(): CanonicalWidgetSpec[] {
  return AXIS_WORKBENCH_WIDGET_TYPES.filter((type) => !NOT_OFFERED.has(type)).map((type) => {
    const kind = type.replace(/^axis\./, '');
    const state = DEFAULT_STATE[type];
    return {
      type,
      label: AXIS_WIDGET_LABELS[type] ?? kind,
      id: `axis.widget.${kind}`,
      ...(state ? { state: { ...state } } : {}),
      ...(KEYWORDS[type] ? { keywords: [...KEYWORDS[type]] } : {})
    };
  });
}

/**
 * Widget types whose component has side effects when it mounts (binding
 * resolution, foot-controller subscriptions, telemetry polling): their card is
 * a static preview instead of the live widget.
 */
export const AXIS_STATIC_PREVIEW_WIDGET_TYPES: ReadonlySet<string> = new Set([
  'axis.paramControl',
  'axis.fcDevice',
  'axis.fcLayouts',
  'axis.fcSwitchView',
  'axis.telemetry'
]);

export function axisWidgetPreviewIsStatic(type: string): boolean {
  return AXIS_STATIC_PREVIEW_WIDGET_TYPES.has(type);
}

/** Glyph of a static widget preview. */
export function axisWidgetGlyph(type: string): string {
  if (type === 'axis.paramControl') return '◔';
  if (type.startsWith('axis.fc')) return '⬚';
  if (type === 'axis.telemetry') return '⇅';
  return '▢';
}

const PANEL_GLYPHS: Record<string, string> = {
  'axis.signalGrid': '▦',
  'axis.blockEditor': '◧',
  'axis.presetBrowser': '≣',
  'axis.fc': '⬚',
  'axis.history': '↺',
  'axis.account': '◈',
  'axis.deviceTools': '⚒',
  'axis.customPanel': '✚',
  'axis.virtualScreen': '▭',
  'axis.placeholder': '◌'
};

/** The schematic glyph of a panel card (part panels follow their family). */
export function axisPanelGlyph(type: string): string {
  if (PANEL_GLYPHS[type]) return PANEL_GLYPHS[type];
  if (type.startsWith('axis.presetBrowser')) return PANEL_GLYPHS['axis.presetBrowser'];
  if (type.startsWith('axis.fc')) return PANEL_GLYPHS['axis.fc'];
  if (type.startsWith('axis.blockEditor')) return PANEL_GLYPHS['axis.blockEditor'];
  if (type.startsWith('axis.convert')) return '⇄';
  return '▢';
}

/**
 * The preview scale of a live widget card: a widget wider than the card's
 * preview area shrinks to fit (never grows).
 */
export function axisWidgetPreviewScale(estWidth: number, area = 176): number {
  if (!(estWidth > 0)) return 1;
  return Math.min(1, Math.round((area / estWidth) * 100) / 100);
}
