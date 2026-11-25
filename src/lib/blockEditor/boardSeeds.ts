// Built-in default boards of a block: the current one, and the ones earlier versions (or the same version on an
// older server) built for it.
//
// A stored Default board that is still exactly one of the earlier ones was never changed by the user and follows
// the current default (boardPersistence `previousSeed`; they are built only when such a board is found):
//   1. rows only, before positions: cross-block refs bound by their bare paramId, no graph displays (the
//      released versions had neither the guard nor graph tiles);
//   2. positions and graph displays, before the fixed area: every control on its pages, the header's included
//      — or, for a block without a device layout, the curated board with the header's controls;
//   3. the default for a layout without its page-level controls (an older server);
//   4. the first Fixed layout, with its old page heights and width for More.
//   5. the Fixed layout with stacked mixers and height set by the tallest control in each row.
// A positioned board without its graphs is a user's choice (a removed graph) and stays; "Reset to device layout"
// brings the graphs back.
// Pure. Migration coverage lives in boardPersistence.test.ts.

import type { DeviceLayout } from '../types';
import type { BeBoard } from './boardModel';
import type { BeCtl } from './catalog';
import { buildCuratedBoardV2, buildDeviceLayoutBoardV2 } from './deviceLayoutBoardV2';
import type { HeaderBlockState } from './headerControls';

export interface SeedInput {
  layout: DeviceLayout | null | undefined;
  catalog: readonly BeCtl[];
  /** Effect id of the open block (the cross-block guard). */
  effectId?: number | null;
  /** The served block state; null = the server tags none. */
  blockState?: HeaderBlockState | null;
  /** Params the curated board puts on "Main". */
  mainParamIds: ReadonlySet<number>;
}

/** The current built-in default: from the device layout, else the curated one. */
export function builtInSeed(i: SeedInput): BeBoard {
  return (
    buildDeviceLayoutBoardV2(i.layout, i.catalog, { effectId: i.effectId, blockState: i.blockState }) ??
    buildCuratedBoardV2(i.catalog, i.mainParamIds, { blockState: i.blockState })
  );
}

/** A copy of a layout as a server without page-level controls serves it. */
const withoutPageControls = (l: DeviceLayout): DeviceLayout => ({ ...l, pages: (l.pages ?? []).map((pg) => (pg?.pageControls ? { ...pg, pageControls: undefined } : pg)) });

/** The defaults of earlier versions and servers (see above), in no particular order. */
export function previousSeeds(i: SeedInput): BeBoard[] {
  const noGraphs = i.catalog.filter((c) => c.kind !== 'graph');
  const out: (BeBoard | null)[] = [
    buildDeviceLayoutBoardV2(i.layout, noGraphs, { rowFlowOnly: true, legacyUnguarded: true }),
    buildDeviceLayoutBoardV2(i.layout, i.catalog, { effectId: i.effectId, withoutFixed: true }) ?? buildCuratedBoardV2(i.catalog, i.mainParamIds, { withHeader: true })
  ];
  const fixedOptions = { effectId: i.effectId, blockState: i.blockState, legacyFixedLayout: true };
  out.push(buildDeviceLayoutBoardV2(i.layout, i.catalog, fixedOptions));
  const stackedOptions = { ...fixedOptions, legacyFixedLayout: false, legacyStackedLayout: true };
  out.push(buildDeviceLayoutBoardV2(i.layout, i.catalog, stackedOptions));
  if (i.layout?.pages?.some((pg) => pg?.pageControls?.length)) {
    const layout = withoutPageControls(i.layout);
    out.push(builtInSeed({ ...i, layout }), buildDeviceLayoutBoardV2(layout, i.catalog, fixedOptions), buildDeviceLayoutBoardV2(layout, i.catalog, stackedOptions));
  }
  return out.filter((b): b is BeBoard => !!b);
}
