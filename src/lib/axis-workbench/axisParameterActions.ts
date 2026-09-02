import {
  createParameterWidgetsForZoneCommands,
  type JsonObject,
  type WorkbenchActionHandler,
  type WorkbenchController,
  type WorkbenchCommand,
  type WorkbenchParameterSource
} from '../workbench';
import { axisParameterSourcesFromCurrentEditor } from './axisParameterSources';
import {
  axisMyControlsPanel,
  axisMyControlsZone,
  AXIS_MY_CONTROLS_PANEL_ID,
  AXIS_MY_CONTROLS_ZONE,
  hasAxisMyControlsPanel
} from './myControlsPanel';
import { axisMyControlsSectionInsertIndex } from './myControlsSections';

export const AXIS_PIN_SELECTED_PARAMETERS_ACTION = 'axis.pinSelectedParameters';

export type AxisParameterSourceProvider = () => WorkbenchParameterSource[] | Promise<WorkbenchParameterSource[]>;

function numericParamId(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function sourceParamId(source: WorkbenchParameterSource): number | null {
  return numericParamId(source.binding.target.paramId);
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

/**
 * Self-heal commands for a document whose active layout has lost (or never had)
 * the My Controls panel, so a pin can never silently no-op. Normalization
 * (`ensureAxisMyControlsPanel`) puts it there on load; this is the belt.
 */
function ensurePanelCommands(controller: WorkbenchController): WorkbenchCommand[] {
  if (hasAxisMyControlsPanel(controller.document)) return [];
  return [
    { type: 'zone.ensure', zone: axisMyControlsZone() },
    { type: 'panel.add', panel: axisMyControlsPanel(), region: 'right' }
  ];
}

/**
 * Pin controls into My Controls — the ONE pin destination (see
 * `myControlsPanel.ts`). Pinning never creates a panel: `args.panelId` /
 * `args.title` are deliberately ignored, so no caller can reintroduce a second
 * pin target.
 *
 * `args.sectionId` is NOT such a target. It names a section header widget inside
 * the one panel and only moves the insert index — the controls still land in My
 * Controls. It exists because layout editing is retired, so the pin is the only
 * moment a user can say where in the panel a control belongs. An unknown or
 * absent id appends to the end, as before.
 */
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

      const setup = ensurePanelCommands(controller);
      if (setup.length) controller.dispatchMany(setup);

      const sectionId = typeof args?.sectionId === 'string' ? args.sectionId : null;
      const startIndex = axisMyControlsSectionInsertIndex(controller.document, sectionId);
      controller.dispatchMany([
        ...createParameterWidgetsForZoneCommands(controller.document, sources, {
          zone: AXIS_MY_CONTROLS_ZONE,
          index: startIndex
        }),
        // Bring the tab forward so the user sees where the control landed.
        { type: 'panel.activate', panelId: AXIS_MY_CONTROLS_PANEL_ID }
      ]);
    }
  };
}
