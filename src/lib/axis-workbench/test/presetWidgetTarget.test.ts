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
  it('Grid → Preset Browser, "Find a preset"', () => {
    expect(resolvePresetWidgetTarget(AXIS_PAGE_GRID)).toEqual({
      pageId: AXIS_PAGE_PRESET_BROWSER,
      title: 'Find a preset'
    });
  });

  it('Preset Browser → Grid, "Go to Grid"', () => {
    expect(resolvePresetWidgetTarget(AXIS_PAGE_PRESET_BROWSER)).toEqual({
      pageId: AXIS_PAGE_GRID,
      title: 'Go to Grid'
    });
  });

  // Every other seed page returns to the Grid, not to itself and not to the Preset Browser.
  it.each([AXIS_PAGE_FC, AXIS_PAGE_SCENES, AXIS_PAGE_LIVE, AXIS_PAGE_SETUP, AXIS_PAGE_CONTROLLERS])(
    '%s → Grid',
    (pageId) => {
      expect(resolvePresetWidgetTarget(pageId)).toEqual({ pageId: AXIS_PAGE_GRID, title: 'Go to Grid' });
    }
  );

  // Safe default: undefined, null, and an unrecognized id all fall through to Grid, matching the
  // seed activePageId so a not-yet-loaded or unknown page is never a dead end.
  it('undefined → Grid', () => {
    expect(resolvePresetWidgetTarget(undefined)).toEqual({ pageId: AXIS_PAGE_GRID, title: 'Go to Grid' });
  });

  it('null → Grid', () => {
    expect(resolvePresetWidgetTarget(null)).toEqual({ pageId: AXIS_PAGE_GRID, title: 'Go to Grid' });
  });

  it('an unknown page id → Grid', () => {
    expect(resolvePresetWidgetTarget('axis.page.doesNotExist')).toEqual({
      pageId: AXIS_PAGE_GRID,
      title: 'Go to Grid'
    });
  });
});
