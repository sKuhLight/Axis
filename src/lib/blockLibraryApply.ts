import type { DecodedBlockFile } from './types';

/** Forge's apply route accepts the raw writable subset of a decoded `.blk` preview: the
 * channel-blocked positional values, not the per-channel param mapping (the bulk write re-emits
 * the saved burst verbatim, so no value remap is needed). */
export function blockLibraryApplyPayload(block: DecodedBlockFile) {
  return {
    device: block.device,
    slug: block.slug,
    activeChannel: block.activeChannel,
    itemCount: block.itemCount,
    values: block.values
  };
}
