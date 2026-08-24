import { describe, expect, it } from 'vitest';
import { loadActionWarning } from '../presetBrowser/presetBrowserWorkbenchLoadWarning';

describe('loadActionWarning', () => {
  it('does not warn when the preset is clean', () => {
    expect(loadActionWarning(false, 'load').warn).toBe(false);
    expect(loadActionWarning(false, 'audition').warn).toBe(false);
  });

  it('warns for both actions when the preset is dirty', () => {
    expect(loadActionWarning(true, 'load').warn).toBe(true);
    expect(loadActionWarning(true, 'audition').warn).toBe(true);
  });

  it('explains the plain behaviour when clean', () => {
    expect(loadActionWarning(false, 'load').tooltip).toBe('Load this preset into the edit buffer');
    expect(loadActionWarning(false, 'audition').tooltip).toContain('without switching slots');
    expect(loadActionWarning(false, 'load').tooltip).not.toContain('⚠');
    expect(loadActionWarning(false, 'audition').tooltip).not.toContain('⚠');
  });

  it('states the unsaved-changes reason when dirty, identically for both actions', () => {
    for (const action of ['load', 'audition'] as const) {
      expect(loadActionWarning(true, action).tooltip).toBe(
        '⚠ You have unsaved changes in the current preset.'
      );
    }
  });
});
