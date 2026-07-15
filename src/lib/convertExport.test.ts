import { describe, it, expect } from 'vitest';
import {
  canExportTarget,
  isFm3Model,
  syxFilename,
  exportToast,
  exportFidelityToast,
  exportErrorToast
} from './convertExport';

describe('convertExport.canExportTarget', () => {
  it('allows only the FM3 target', () => {
    expect(canExportTarget('fm3')).toBe(true);
  });
  it('rejects every other target and nullish input', () => {
    for (const t of ['fm9', 'axe-fx-iii', 'am4', 'vp4', 'axe-fx-ii', undefined, null, '']) {
      expect(canExportTarget(t)).toBe(false);
    }
  });
});

describe('convertExport.isFm3Model', () => {
  it('matches FM3 case-insensitively with surrounding whitespace', () => {
    expect(isFm3Model('FM3')).toBe(true);
    expect(isFm3Model('fm3')).toBe(true);
    expect(isFm3Model('  Fm3 ')).toBe(true);
  });
  it('rejects other device models and nullish input', () => {
    for (const m of ['FM9', 'Axe-Fx III', 'AM4', '', undefined, null]) {
      expect(isFm3Model(m)).toBe(false);
    }
  });
});

describe('convertExport.syxFilename', () => {
  it('sanitizes unsafe characters and appends .syx', () => {
    expect(syxFilename('My Cool Preset!')).toBe('My_Cool_Preset_.syx');
    expect(syxFilename('lead/rhythm:2')).toBe('lead_rhythm_2.syx');
  });
  it('falls back to "preset.syx" for blank/nullish names', () => {
    expect(syxFilename('')).toBe('preset.syx');
    expect(syxFilename('   ')).toBe('preset.syx');
    expect(syxFilename(undefined)).toBe('preset.syx');
    expect(syxFilename(null)).toBe('preset.syx');
  });
  it('keeps word chars and hyphens intact', () => {
    expect(syxFilename('clean-tone_1')).toBe('clean-tone_1.syx');
  });
});

describe('convertExport.exportToast', () => {
  it('pluralizes blocks and omits the skipped clause at zero', () => {
    expect(exportToast(1, 0)).toBe('Exported 1 block');
    expect(exportToast(8, 0)).toBe('Exported 8 blocks');
  });
  it('appends the skipped count when any were skipped', () => {
    expect(exportToast(8, 2)).toBe('Exported 8 blocks · 2 skipped');
    expect(exportToast(0, 3)).toBe('Exported 0 blocks · 3 skipped');
  });
});

describe('convertExport.exportFidelityToast', () => {
  it('returns null when every converted block was synthesized (nothing dropped)', () => {
    expect(exportFidelityToast({ sourceBlocks: 12, landedBlocks: 12, droppedNoTemplate: 0 })).toBe(null);
  });
  it('warns "Exported N of M blocks" naming the missing-template families when blocks were dropped', () => {
    expect(exportFidelityToast({ sourceBlocks: 9, landedBlocks: 7, droppedNoTemplate: 2 })).toBe(
      'Exported 7 of 9 blocks — 2 families have no FM3 template yet'
    );
  });
  it('uses the singular for a single dropped family', () => {
    expect(exportFidelityToast({ sourceBlocks: 8, landedBlocks: 7, droppedNoTemplate: 1 })).toBe(
      'Exported 7 of 8 blocks — 1 family has no FM3 template yet'
    );
  });
});

describe('convertExport.exportErrorToast', () => {
  it('refuses a synthesized preset that failed validation (422)', () => {
    expect(exportErrorToast(422, 'authored preset failed validation: invalid CRC')).toBe(
      'Export refused: the synthesized preset failed validation'
    );
  });
  it('names the optional-base-override problem for a 400', () => {
    expect(exportErrorToast(400)).toBe(
      'Export failed: base override invalid — remove it or pick a valid FM3 preset'
    );
  });
  it('falls back to the raw message for other failures, or a generic string when none', () => {
    expect(exportErrorToast(0, 'network unreachable')).toBe('Export failed: network unreachable');
    expect(exportErrorToast(503, '')).toBe('Export failed');
    expect(exportErrorToast(undefined, null)).toBe('Export failed');
  });
});
