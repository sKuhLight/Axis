import { describe, expect, it } from 'vitest';
import { catFor, familyLabel, trustedBlockGlyph } from './catalog';
describe('block glyph catalog', () => {
  it('accepts only built-in SVG and rejects injected markup', () => {
    expect(trustedBlockGlyph(catFor('Amp').glyph)).toContain('<svg');
    expect(trustedBlockGlyph(catFor('Amp').glyph + '<script>alert(1)</script>')).toBeNull();
    expect(trustedBlockGlyph('<svg onload="alert(1)"></svg>')).toBeNull();
    expect(trustedBlockGlyph(undefined)).toBeNull();
  });
  it('preserves family colors, aliases and labels while offering distinct icons', () => {
    expect(catFor('Megatap').accent).toBe('#4a82e0');
    expect(catFor('TenTap').accent).toBe('#4a82e0');
    expect(catFor(null, 'Graphic EQ')).toBe(catFor('Geq'));
    expect(catFor('Geq').glyph).not.toBe(catFor('Peq').glyph);
    expect(familyLabel('MultiComp')).toBe('Multi Comp');
    expect(trustedBlockGlyph(catFor(null, 'Unknown').glyph)).toContain('<svg');
  });
});
