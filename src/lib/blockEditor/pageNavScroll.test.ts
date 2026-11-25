import { describe, expect, it } from 'vitest';
import { revealOffset } from './pageNavScroll';
describe('active page reveal', () => {
  it('does not disturb the scroll when the active tab fits', () => {
    expect(revealOffset(100, 300, 150, 100)).toBe(100);
  });
  it('reveals a tab beyond either edge without scrolling ancestors', () => {
    expect(revealOffset(100, 300, 40, 80)).toBe(37);
    expect(revealOffset(100, 300, 380, 80)).toBe(163);
  });
  it('reveals the same active tab when its viewport shrinks', () => {
    expect(revealOffset(0, 400, 280, 90)).toBe(0);
    expect(revealOffset(0, 200, 280, 90)).toBe(173);
  });
  it('keeps an oversized tab leading edge visible and handles hidden navigation', () => {
    expect(revealOffset(0, 80, 200, 120)).toBe(197);
    expect(revealOffset(10, 80, 0, 120)).toBe(0);
    expect(revealOffset(100, 0, 200, 120)).toBe(100);
  });
});
