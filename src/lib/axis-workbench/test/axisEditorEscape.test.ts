import { describe, expect, it } from 'vitest';
import { axisEditorCloseIsVisible } from '../axisEditorEscape';

describe('axisEditorCloseIsVisible', () => {
  it('is visible in the legacy monolith shell, whatever the profile', () => {
    expect(axisEditorCloseIsVisible({ workbenchShell: false, profileBreakpoint: undefined })).toBe(true);
    expect(axisEditorCloseIsVisible({ workbenchShell: false, profileBreakpoint: 'desktop' })).toBe(true);
  });

  it('is visible in the workbench only on the phone profile (the mobile block flow)', () => {
    expect(axisEditorCloseIsVisible({ workbenchShell: true, profileBreakpoint: 'phone' })).toBe(true);
    expect(axisEditorCloseIsVisible({ workbenchShell: true, profileBreakpoint: 'tablet' })).toBe(false);
    expect(axisEditorCloseIsVisible({ workbenchShell: true, profileBreakpoint: 'desktop' })).toBe(false);
    expect(axisEditorCloseIsVisible({ workbenchShell: true, profileBreakpoint: undefined })).toBe(false);
  });
});
