import type { WidgetSize } from '../core';

export const WIDGET_SIZE_ORDER: readonly WidgetSize[] = ['mini', 'compact', 'default'];

export interface WidgetSizePolicy {
  mini: number;
  compact: number;
  default: number;
}

export const DEFAULT_WIDGET_SIZE_POLICY: WidgetSizePolicy = {
  mini: 44,
  compact: 88,
  default: 144
};

const rank = (size: WidgetSize): number => WIDGET_SIZE_ORDER.indexOf(size);

export function clampWidgetSize(size: WidgetSize, maxSize: WidgetSize): WidgetSize {
  return rank(size) <= rank(maxSize) ? size : maxSize;
}

export function pickWidgetSize(
  availableWidth: number,
  maxSize: WidgetSize = 'default',
  policy: WidgetSizePolicy = DEFAULT_WIDGET_SIZE_POLICY
): WidgetSize {
  const ceiling = clampWidgetSize('default', maxSize);
  const candidates = WIDGET_SIZE_ORDER.slice(0, rank(ceiling) + 1).reverse();
  return candidates.find((size) => availableWidth >= policy[size]) ?? 'mini';
}
