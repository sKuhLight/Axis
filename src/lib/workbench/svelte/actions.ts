import { selectActiveLayout, type DockRegionId, type WorkbenchCommand, type WorkbenchDocument } from '../core';

function cleanActionId(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9_.:-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown';
}

function uniquePanelId(base: string, doc: WorkbenchDocument): string {
  const layout = selectActiveLayout(doc);
  if (!layout || !layout.panels[base]) return base;
  for (let index = 1; ; index += 1) {
    const id = `${base}.copy${index}`;
    if (!layout.panels[id]) return id;
  }
}

export function createMissingActionPanelCommand(
  doc: WorkbenchDocument,
  command: string,
  options: { title?: string; region?: DockRegionId } = {}
): WorkbenchCommand {
  const safeCommand = cleanActionId(command);
  const id = uniquePanelId(`workbench.missingAction.${safeCommand}`, doc);
  return {
    type: 'panel.add',
    panel: {
      id,
      type: 'workbench.missingAction',
      title: options.title ?? command,
      state: { command }
    },
    region: options.region ?? 'main'
  };
}

export function createFailedActionPanelCommand(
  doc: WorkbenchDocument,
  command: string,
  message: string,
  options: { title?: string; region?: DockRegionId } = {}
): WorkbenchCommand {
  const safeCommand = cleanActionId(command);
  const id = uniquePanelId(`workbench.failedAction.${safeCommand}`, doc);
  return {
    type: 'panel.add',
    panel: {
      id,
      type: 'workbench.failedAction',
      title: options.title ?? `${command} failed`,
      state: { command, message }
    },
    region: options.region ?? 'main'
  };
}
