// The device class the Block Editor runs as, tracked live: inside the workbench the active profile's
// breakpoint (a profile without one counts as desktop, as in the workbench), in the monolith shell the
// window width (deviceClassFrom). Every phone / desktop decision of the editor reads this one value —
// which board key loads, the phone chrome, whether Arrange is offered, the grid map's default fold — so
// a phone profile at a desktop window size (a large UI scale, a pinned profile preview) is a phone
// everywhere, and a desktop profile in a narrow window is a desktop everywhere.

import { get } from 'svelte/store';
import { getOptionalWorkbenchContext } from '../workbench';
import { deviceClassFrom, type DeviceClass } from './boardPersistence';

/** Track the device class. Call during component initialisation (it registers effects). */
export function trackDeviceClass(): { readonly current: DeviceClass } {
  const workbench = getOptionalWorkbenchContext();
  const breakpointOf = (c: { activeProfile?: { breakpoint?: string } | null }): string | null => c.activeProfile?.breakpoint ?? null;
  let vw = $state(typeof window !== 'undefined' ? window.innerWidth : 1100);
  // read synchronously first, so the first board load already uses the right class
  let bp = $state<string | null>(workbench ? breakpointOf(get(workbench.controller)) : null);
  $effect(() => {
    const onResize = () => (vw = window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  });
  $effect(() => {
    if (!workbench) return;
    const off = workbench.controller.subscribe((c) => {
      bp = breakpointOf(c);
    });
    return () => void off();
  });
  const cls = $derived(deviceClassFrom({ inWorkbench: !!workbench, workbenchBreakpoint: bp, viewportWidth: vw }));
  return {
    get current() {
      return cls;
    }
  };
}
