<script lang="ts">
  import { getWorkbenchContext } from '../workbench';
  import {
    resolveAxisProfileSwitcherState,
    setAxisProfileOverride
  } from './axisWorkbenchLayoutActions';

  // PROFILE segmented control for the edit ribbon (design §5 "PROFILE": Desktop /
  // Tablet / Mobile, plus an Auto affordance). Selecting a profile *pins* it as
  // the document override — it always wins over the viewport resolver until
  // cleared. "Auto" clears the override so the profile re-resolves by viewport.
  // Active state reflects controller.profileOverride (pinned) vs the resolved
  // active profile (auto). Pure derivation lives in axisWorkbenchLayoutActions.ts.
  const { controller } = getWorkbenchContext();

  const state = $derived(
    resolveAxisProfileSwitcherState($controller.profileOverride, $controller.document.activeProfileId)
  );

  // Live viewport width so clearing the override re-resolves against the real
  // viewport instead of holding a stale profile id. Undefined during SSR.
  function viewportWidth(): number | undefined {
    return typeof window !== 'undefined' ? window.innerWidth : undefined;
  }

  function pin(profileId: string) {
    setAxisProfileOverride(controller, profileId, viewportWidth());
  }

  function auto() {
    setAxisProfileOverride(controller, null, viewportWidth());
  }
</script>

<span class="axis-profile-label">Profile</span>
<div class="axis-profile-tabs" role="group" aria-label="Device profile">
  <button
    class="axis-profile-tab"
    class:active={state.autoMode}
    type="button"
    aria-pressed={state.autoMode}
    title="Auto — follow the viewport size"
    onclick={auto}
  >
    Auto
  </button>
  {#each state.chips as chip (chip.id)}
    <button
      class="axis-profile-tab"
      class:active={chip.pinned}
      class:resolved={chip.autoActive}
      type="button"
      aria-pressed={chip.pinned}
      title={chip.pinned
        ? `${chip.label} — pinned`
        : chip.autoActive
          ? `${chip.label} — matched by viewport (pin to lock)`
          : `Pin ${chip.label} profile`}
      onclick={() => pin(chip.id)}
    >
      {chip.label}
    </button>
  {/each}
</div>

<style>
  .axis-profile-label {
    flex: 0 0 auto;
    color: var(--aw-text-faint);
    font: 700 10px/1 var(--aw-font-mono);
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  .axis-profile-tabs {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px;
    border: 1px solid var(--aw-border-2);
    border-radius: 9px;
    background: var(--aw-bg-2);
  }
  .axis-profile-tab {
    height: 28px;
    padding: 0 12px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--aw-text-muted);
    cursor: pointer;
    font: 600 11px/1 var(--aw-font-ui);
  }
  .axis-profile-tab:hover {
    color: var(--aw-text);
  }
  /* Auto mode: the viewport-resolved profile shows a lighter "resolved" hint so
     you can see which profile Auto picked without it reading as a manual pin. */
  .axis-profile-tab.resolved {
    color: var(--aw-text);
    box-shadow: inset 0 0 0 1px var(--aw-border-2);
  }
  /* Pinned (or Auto itself): the solid, filled active state. */
  .axis-profile-tab.active {
    background: var(--aw-accent);
    color: var(--aw-accent-ink);
  }
</style>
