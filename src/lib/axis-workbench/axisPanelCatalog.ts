import type { CanonicalPanelSpec, PanelInstance } from '../workbench/core';
import { createAxisWorkbenchPanels } from './axisWorkbenchDefaults';
import { AXIS_SECONDARY_PAGE_SPECS, axisPagePanelInstance, createAxisConvertPanels } from './axisWorkbenchPages';

/**
 * Slice 3 — the Axis canonical panel list for the generic panel catalog
 * (`workbench/core/panelCatalog.ts`, registered in `axisWorkbenchRegistry.ts`).
 *
 * Every Axis panel can always be added again: the catalog lists an existing
 * instance where it lives (docked / parked) and offers each canonical panel
 * that has NO instance as "not placed" — so a panel a stored document lost
 * before panels were parked (old `page.remove` / Close Panel deleted them) is
 * created fresh from its spec here, with its singleton key.
 *
 * Derived from the roster (`createAxisWorkbenchPanels`) plus the secondary page
 * specs, deduped by singleton key. Excluded: the converter page's internal
 * panels (they live on the protected, nav-less Convert page), the runtime part
 * panels (never in the roster), and the Axis Account panel (reached through its
 * Axis Cloud nav action). Locked panels such as the Signal Grid stay canonical:
 * locked only means a panel cannot LEAVE the layout — it still moves between
 * docks and pages — so it is offered (only while absent) like any other. The
 * roster's Custom Panel becomes a `multiple` spec ("New custom panel"): every
 * add mints a NEW custom panel with its own widget zone.
 */

/** Converter page panel types: internal, never listed in the catalog. */
export const AXIS_PANEL_CATALOG_HIDDEN_TYPES: readonly string[] = Object.values(createAxisConvertPanels()).map((panel) => panel.type);

/** Preferred catalog order (page panels first, utility panels after); unlisted roster panels follow. */
const ORDER = [
  'axis.signalGrid',
  'axis.blockEditor',
  'axis.history',
  'axis.presetBrowser',
  'axis.fc',
  'axis.controllers',
  'axis.scenes',
  'axis.live',
  'axis.setup',
  'axis.deviceTools',
  'axis.account'
];

const CUSTOM_PANEL_TYPE = 'axis.customPanel';

/** Roster panels the catalog never offers (Axis Account opens from its nav action). */
const NOT_OFFERED = new Set(['axis.account']);

export function createAxisCanonicalPanels(): CanonicalPanelSpec[] {
  const roster = createAxisWorkbenchPanels();
  const convertIds = new Set(Object.keys(createAxisConvertPanels()));
  const candidates: PanelInstance[] = [
    ...ORDER.map((id) => roster[id]).filter((panel): panel is PanelInstance => !!panel),
    ...Object.values(roster).filter((panel) => !ORDER.includes(panel.id)),
    ...AXIS_SECONDARY_PAGE_SPECS.map(axisPagePanelInstance)
  ];
  const specs: CanonicalPanelSpec[] = [];
  const seen = new Set<string>();
  for (const panel of candidates) {
    if (convertIds.has(panel.id) || panel.type === CUSTOM_PANEL_TYPE) continue;
    if (NOT_OFFERED.has(panel.id)) continue;
    const key = panel.singletonKey ?? panel.id;
    if (seen.has(key)) continue;
    seen.add(key);
    specs.push({ key, panel });
  }
  specs.push({
    key: CUSTOM_PANEL_TYPE,
    panel: { id: CUSTOM_PANEL_TYPE, type: CUSTOM_PANEL_TYPE, title: 'Custom Panel', closable: true, collapsible: true },
    label: 'New custom panel',
    multiple: true,
    ownsWidgetZone: true
  });
  return specs;
}

/** Computed once: the specs are data, and catalog commands clone what they create. */
let cached: CanonicalPanelSpec[] | null = null;
export function axisCanonicalPanels(): CanonicalPanelSpec[] {
  cached ??= createAxisCanonicalPanels();
  return cached;
}
