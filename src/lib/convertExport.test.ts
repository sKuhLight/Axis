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
  it('returns null when the base covered every converted block (nothing dropped)', () => {
    expect(exportFidelityToast({ sourceBlocks: 12, landedBlocks: 12, droppedForNoBaseBlock: 0 })).toBe(null);
  });
  it('warns "Exported N of M blocks" naming the base-coverage gap when blocks were dropped', () => {
    expect(exportFidelityToast({ sourceBlocks: 14, landedBlocks: 9, droppedForNoBaseBlock: 5 })).toBe(
      'Exported 9 of 14 blocks — the base template lacked the rest (pick a richer base for full coverage)'
    );
  });
});

describe('convertExport.exportErrorToast', () => {
  it('shows a "pick a different base" message for the validation-gate refusals (400 base / 422 authored)', () => {
    expect(exportErrorToast(400)).toBe('Export failed: base template invalid — pick a different base');
    expect(exportErrorToast(422, 'authored preset failed validation: invalid CRC')).toBe(
      'Export failed: base template invalid — pick a different base'
    );
  });
  it('falls back to the raw message for other failures, or a generic string when none', () => {
    expect(exportErrorToast(0, 'network unreachable')).toBe('Export failed: network unreachable');
    expect(exportErrorToast(503, '')).toBe('Export failed');
    expect(exportErrorToast(undefined, null)).toBe('Export failed');
  });
});
