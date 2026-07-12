import {
  WORKBENCH_PARAMETER_SOURCE_EDGE_DROP_ACTION,
  createCustomPanelFromParameterSourcesCommands,
  createParameterWidgetsForZoneCommands,
  isDockRegionId,
  panelWidgetZoneId,
  parseWorkbenchParameterSource,
  selectActiveLayout,
  selectPanelLocation,
  selectVisibleWidgetsByZone,
  type DockRegionId,
  type JsonObject,
  type WorkbenchActionHandler,
  type WorkbenchController,
  type WorkbenchDocument,
  type WorkbenchParameterSource
} from '../workbench';
import { axisParameterSourcesFromCurrentEditor } from './axisParameterSources';

export const AXIS_PIN_SELECTED_PARAMETERS_ACTION = 'axis.pinSelectedParameters';
export const AXIS_PARAMETER_SOURCE_EDGE_DROP_ACTION = WORKBENCH_PARAMETER_SOURCE_EDGE_DROP_ACTION;
export const AXIS_CUSTOM_PANEL_TYPE = 'axis.customPanel';
/** Sensible default name for a fresh collect panel (renamable like any panel). */
export const AXIS_CONTROLS_PANEL_TITLE = 'Controls';

export type AxisParameterSourceProvider = () => WorkbenchParameterSource[] | Promise<WorkbenchParameterSource[]>;

// A dropped parameter no longer spawns a tab per param: a fresh panel gets the
// generic "Controls" name (renamable) so several blocks' key controls collect in
// ONE panel. An explicit `title` arg (e.g. the "pin this page" path) still wins.
function titleForSources(): string {
  return AXIS_CONTROLS_PANEL_TITLE;
}

/**
 * The custom panel an edge (empty dock space) drop should COLLECT into, or null
 * to create a fresh "Controls" panel. Prefers a custom panel already sitting in
 * the dropped region (drop near your controls panel → it grows); otherwise, when
 * exactly one custom panel exists anywhere, collect into that; else start fresh.
 * Pure so the collect rule is unit-tested.
 */
export function axisCollectPanelId(doc: WorkbenchDocument, region: DockRegionId): string | null {
  const layout = selectActiveLayout(doc);
  if (!layout) return null;
  const customPanels = Object.values(layout.panels)
    .filter((panel) => panel.type === AXIS_CUSTOM_PANEL_TYPE)
    .sort((a, b) => a.id.localeCompare(b.id));
  if (!customPanels.length) return null;
  const inRegion = customPanels.find((panel) => selectPanelLocation(doc, panel.id)?.region === region);
  if (inRegion) return inRegion.id;
  return customPanels.length === 1 ? customPanels[0].id : null;
}

/** Append parameter-source widgets to the end of a panel's widget zone. */
function appendSourcesCommands(controller: WorkbenchController, panelId: string, sources: WorkbenchParameterSource[]) {
  const zone = panelWidgetZoneId(panelId);
  const startIndex = selectVisibleWidgetsByZone(controller.document, zone).length;
  return createParameterWidgetsForZoneCommands(controller.document, sources, { zone, index: startIndex });
}

function numericParamId(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function sourceParamId(source: WorkbenchParameterSource): number | null {
  return numericParamId(source.binding.target.paramId);
}

function panelIdFromArgs(args: JsonObject | undefined): string | null {
  const value = args?.panelId;
  return typeof value === 'string' && value.trim() ? value : null;
}

function isAxisCustomPanel(controller: WorkbenchController, panelId: string): boolean {
  const layout = selectActiveLayout(controller.document);
  return layout?.panels[panelId]?.type === AXIS_CUSTOM_PANEL_TYPE;
}

function paramIdsFromArgs(args: JsonObject | undefined): number[] | null {
  const single = numericParamId(args?.paramId);
  if (single != null) return [single];
  const many = args?.paramIds;
  if (!Array.isArray(many)) return null;
  const out = many.map(numericParamId).filter((id): id is number => id != null);
  return out.length ? out : null;
}

function filterSourcesByParamIds(sources: WorkbenchParameterSource[], paramIds: number[] | null): WorkbenchParameterSource[] {
  if (!paramIds) return sources;
  const used = new Set<string>();
  const out: WorkbenchParameterSource[] = [];
  for (const paramId of paramIds) {
    for (const source of sources) {
      if (used.has(source.id) || sourceParamId(source) !== paramId) continue;
      used.add(source.id);
      out.push(source);
    }
  }
  return out;
}

export function createAxisPinSelectedParametersAction(
  getSources: AxisParameterSourceProvider = axisParameterSourcesFromCurrentEditor
): WorkbenchActionHandler {
  return {
    id: AXIS_PIN_SELECTED_PARAMETERS_ACTION,
    run: async ({ controller, args }) => {
      const allSources = await getSources();
      const filteredSources = filterSourcesByParamIds(allSources, paramIdsFromArgs(args));
      const limit = typeof args?.limit === 'number' && Number.isFinite(args.limit) ? Math.max(1, Math.floor(args.limit)) : undefined;
      const sources = limit ? filteredSources.slice(0, limit) : filteredSources;
      if (!sources.length) return;

      // When a target custom panel is named (touch/context-menu path), append the
      // sources into it instead of creating a new panel — mirrors the drag drop
      // onto an existing AxisCustomPanel. Falls back to new-panel creation if the
      // named panel isn't a live custom panel.
      const panelId = panelIdFromArgs(args);
      if (panelId && isAxisCustomPanel(controller, panelId)) {
        controller.dispatchMany(appendSourcesCommands(controller, panelId, sources));
        return;
      }

      controller.dispatchMany(
        createCustomPanelFromParameterSourcesCommands(controller.document, sources, {
          panelType: AXIS_CUSTOM_PANEL_TYPE,
          title: typeof args?.title === 'string' && args.title.trim() ? args.title.trim() : titleForSources(),
          region: 'right'
        })
      );
    }
  };
}

export function createAxisParameterSourceEdgeDropAction(): WorkbenchActionHandler {
  return {
    id: AXIS_PARAMETER_SOURCE_EDGE_DROP_ACTION,
    run: async ({ controller, args }) => {
      const raw = typeof args?.source === 'string' ? args.source : '';
      const source = parseWorkbenchParameterSource(raw);
      if (!source) return;
      const region = typeof args?.region === 'string' && isDockRegionId(args.region) ? args.region : 'right';

      // Collect into an existing controls panel (dropping into empty space near
      // one grows it) instead of spawning a new tab per parameter. Only when no
      // suitable panel exists do we create a fresh, generically-named "Controls"
      // panel that subsequent drops then collect into.
      const collectId = axisCollectPanelId(controller.document, region);
      if (collectId) {
        controller.dispatchMany(appendSourcesCommands(controller, collectId, [source]));
        return;
      }

      controller.dispatchMany(
        createCustomPanelFromParameterSourcesCommands(controller.document, [source], {
          panelType: AXIS_CUSTOM_PANEL_TYPE,
          title: typeof args?.title === 'string' && args.title.trim() ? args.title.trim() : titleForSources(),
          region
        })
      );
    }
  };
}
