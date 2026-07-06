import {
  WORKBENCH_PARAMETER_SOURCE_EDGE_DROP_ACTION,
  createCustomPanelFromParameterSourcesCommands,
  createParameterWidgetsForZoneCommands,
  isDockRegionId,
  panelWidgetZoneId,
  parseWorkbenchParameterSource,
  selectActiveLayout,
  selectVisibleWidgetsByZone,
  type JsonObject,
  type WorkbenchActionHandler,
  type WorkbenchController,
  type WorkbenchParameterSource
} from '../workbench';
import { axisParameterSourcesFromCurrentEditor } from './axisParameterSources';

export const AXIS_PIN_SELECTED_PARAMETERS_ACTION = 'axis.pinSelectedParameters';
export const AXIS_PARAMETER_SOURCE_EDGE_DROP_ACTION = WORKBENCH_PARAMETER_SOURCE_EDGE_DROP_ACTION;

export type AxisParameterSourceProvider = () => WorkbenchParameterSource[] | Promise<WorkbenchParameterSource[]>;

function titleForSources(sources: WorkbenchParameterSource[]): string {
  if (sources.length === 1) return sources[0].label;
  return 'Pinned Parameters';
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
  return layout?.panels[panelId]?.type === 'axis.customPanel';
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
        const zone = panelWidgetZoneId(panelId);
        const startIndex = selectVisibleWidgetsByZone(controller.document, zone).length;
        controller.dispatchMany(
          createParameterWidgetsForZoneCommands(controller.document, sources, { zone, index: startIndex })
        );
        return;
      }

      controller.dispatchMany(
        createCustomPanelFromParameterSourcesCommands(controller.document, sources, {
          panelType: 'axis.customPanel',
          title: typeof args?.title === 'string' && args.title.trim() ? args.title.trim() : titleForSources(sources),
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
      controller.dispatchMany(
        createCustomPanelFromParameterSourcesCommands(controller.document, [source], {
          panelType: 'axis.customPanel',
          title: typeof args?.title === 'string' && args.title.trim() ? args.title.trim() : source.label,
          region
        })
      );
    }
  };
}
