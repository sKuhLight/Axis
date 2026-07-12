import { describe, expect, it } from 'vitest';
import { createEmptyWorkbenchDocument, createWorkbenchController, selectActiveLayout } from '../../workbench';
import { createAxisNavigationPanelAction } from '../axisWorkbenchNavigationActions';

function newController() {
  return createWorkbenchController(createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' }));
}

describe('Axis navigation panel actions', () => {
  it('adds a docked panel on first activation (no dead no-op)', async () => {
    const controller = newController();
    const action = createAxisNavigationPanelAction({
      actionId: 'axis.openSetup',
      panelId: 'axis.setup',
      panelType: 'axis.virtualScreen',
      title: 'Setup',
      region: 'main',
      state: { slug: 'global' }
    });

    await action.run({ controller, source: 'navigation' });

    const layout = selectActiveLayout(controller.document)!;
    const panel = layout.panels['axis.setup'];
    expect(panel).toBeDefined();
    expect(panel.type).toBe('axis.virtualScreen');
    expect(panel.state).toEqual({ slug: 'global' });
  });

  it('focuses the existing panel on a second activation instead of duplicating it', async () => {
    const controller = newController();
    const action = createAxisNavigationPanelAction({
      actionId: 'axis.openScenes',
      panelId: 'axis.scenes',
      panelType: 'axis.placeholder',
      title: 'Scenes',
      region: 'main',
      state: { heading: 'Scenes' }
    });

    await action.run({ controller, source: 'navigation' });
    await action.run({ controller, source: 'navigation' });

    const layout = selectActiveLayout(controller.document)!;
    const scenePanels = Object.values(layout.panels).filter((panel) => panel.id === 'axis.scenes');
    expect(scenePanels).toHaveLength(1);
  });
});
