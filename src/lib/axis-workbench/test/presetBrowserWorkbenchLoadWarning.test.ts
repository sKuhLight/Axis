import { describe, expect, it } from 'vitest';
import { loadActionWarning } from '../presetBrowser/presetBrowserWorkbenchLoadWarning';

describe('loadActionWarning', () => {
  it('does not warn when the preset is clean', () => {
    expect(loadActionWarning(false, 'load').warn).toBe(false);
    expect(loadActionWarning(false, 'audition').warn).toBe(false);
    expect(loadActionWarning(false, 'saveToDevice').warn).toBe(false);
  });

  it('warns for every buffer-replacing action when the preset is dirty', () => {
    expect(loadActionWarning(true, 'load').warn).toBe(true);
    expect(loadActionWarning(true, 'audition').warn).toBe(true);
    expect(loadActionWarning(true, 'saveToDevice').warn).toBe(true);
  });

  it('explains the plain behaviour when clean', () => {
    expect(loadActionWarning(false, 'load').tooltip).toBe(
      'Switch the device to this preset (the edit buffer is replaced)'
    );
    expect(loadActionWarning(false, 'audition').tooltip).toContain('without switching slots');
    expect(loadActionWarning(false, 'saveToDevice').tooltip).toContain('store this preset there');
    expect(loadActionWarning(false, 'load').tooltip).not.toContain('⚠');
    expect(loadActionWarning(false, 'audition').tooltip).not.toContain('⚠');
    expect(loadActionWarning(false, 'saveToDevice').tooltip).not.toContain('⚠');
  });

  it('states the unsaved-changes reason when dirty, identically for every action', () => {
    for (const action of ['load', 'audition', 'saveToDevice'] as const) {
      expect(loadActionWarning(true, action).tooltip).toBe(
        '⚠ You have unsaved changes in the current preset.'
      );
    }
  });
});
