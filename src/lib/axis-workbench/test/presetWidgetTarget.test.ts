import { describe, expect, it } from 'vitest';
import { resolvePresetWidgetTarget } from '../widgets/presetWidgetTarget';
import {
  AXIS_PAGE_CONTROLLERS,
  AXIS_PAGE_FC,
  AXIS_PAGE_GRID,
  AXIS_PAGE_LIVE,
  AXIS_PAGE_PRESET_BROWSER,
  AXIS_PAGE_SCENES,
  AXIS_PAGE_SETUP
} from '../axisWorkbenchPages';

describe('resolvePresetWidgetTarget', () => {
  it('Grid → open the preset search overlay, "Find a preset"', () => {
    expect(resolvePresetWidgetTarget(AXIS_PAGE_GRID)).toEqual({
      type: 'openPresetSearch',
      title: 'Find a preset'
    });
  });

  it('Preset Browser → navigate to Grid, "Go to Grid"', () => {
    expect(resolvePresetWidgetTarget(AXIS_PAGE_PRESET_BROWSER)).toEqual({
      type: 'navigate',
      pageId: AXIS_PAGE_GRID,
      title: 'Go to Grid'
    });
  });

  // Every other seed page navigates to the Grid, not to itself and not to the Preset Browser.
  it.each([AXIS_PAGE_FC, AXIS_PAGE_SCENES, AXIS_PAGE_LIVE, AXIS_PAGE_SETUP, AXIS_PAGE_CONTROLLERS])(
    '%s → navigate to Grid',
    (pageId) => {
      expect(resolvePresetWidgetTarget(pageId)).toEqual({ type: 'navigate', pageId: AXIS_PAGE_GRID, title: 'Go to Grid' });
    }
  );

  // Safe default: undefined, null, and an unrecognized id all fall through to Grid, matching the
  // seed activePageId so a not-yet-loaded or unknown page is never a dead end.
  it('undefined → navigate to Grid', () => {
    expect(resolvePresetWidgetTarget(undefined)).toEqual({ type: 'navigate', pageId: AXIS_PAGE_GRID, title: 'Go to Grid' });
  });

  it('null → navigate to Grid', () => {
    expect(resolvePresetWidgetTarget(null)).toEqual({ type: 'navigate', pageId: AXIS_PAGE_GRID, title: 'Go to Grid' });
  });

  it('an unknown page id → navigate to Grid', () => {
    expect(resolvePresetWidgetTarget('axis.page.doesNotExist')).toEqual({
      type: 'navigate',
      pageId: AXIS_PAGE_GRID,
      title: 'Go to Grid'
    });
  });
});
