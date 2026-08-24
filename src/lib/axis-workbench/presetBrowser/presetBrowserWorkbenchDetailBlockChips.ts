// Detail-pane block filter strip (§4 of docs/workbench-dc-parity/06-preset-browser.md). Pure
// derivation of the bare filter nodes rendered above the BLOCK PARAMETERS list, plus the click
// decision for toggling the focus filter. Extracted from the .svelte template because Vitest runs
// in the node environment with no DOM, and .svelte files are never unit-mounted — this logic needs
// a co-located test, so it lives in its own pure module.
import type { AxisPresetBrowserBlockSummary } from './presetBrowserWorkbenchData';
import { axisPbCatColor } from './presetBrowserWorkbenchRowChips';

export interface AxisPresetBrowserDetailBlockNode {
  key: string;
  label: string;
  color: string | null;
  effectId: number | null;
  active: boolean;
  selectable: boolean;
}

export function detailBlockNodes(
  blocks: AxisPresetBrowserBlockSummary[] | null | undefined,
  focusedEffectId: number | null
): AxisPresetBrowserDetailBlockNode[] {
  if (!blocks || !blocks.length) return [];

  const nodes: AxisPresetBrowserDetailBlockNode[] = [
    {
      key: 'all',
      label: 'All',
      color: null,
      effectId: null,
      active: focusedEffectId == null,
      selectable: true
    }
  ];

  blocks.forEach((block, index) => {
    const effectId = block.effectId ?? null;
    nodes.push({
      key: effectId != null ? `eid-${effectId}` : `idx-${index}`,
      label: block.name ?? block.slug ?? `Block ${index + 1}`,
      color: axisPbCatColor(block.slug ?? ''),
      effectId,
      active: focusedEffectId != null && effectId === focusedEffectId,
      selectable: effectId != null
    });
  });

  return nodes;
}

export function nextBlockFocus(
  node: AxisPresetBrowserDetailBlockNode,
  focusedEffectId: number | null
): number | null {
  if (node.key === 'all') return null;
  if (focusedEffectId != null && node.effectId === focusedEffectId) return null;
  return node.effectId;
}
