import type { WorkbenchTheme } from '../workbench';

export const axisWorkbenchTheme: WorkbenchTheme = {
  name: 'Axis Dark',
  className: 'axis-workbench-theme',
  vars: {
    // T21: bridge the app's iOS safe-area insets (defined in app.css from
    // env(safe-area-inset-*)) into the generic workbench `--aw-safe-*` tokens.
    // The generic renderer only ever references `--aw-safe-*`; this adapter is
    // the sole place the Axis-specific `--axis-safe-*` names are allowed.
    '--aw-safe-top': 'var(--axis-safe-top, 0px)',
    '--aw-safe-right': 'var(--axis-safe-right, 0px)',
    '--aw-safe-bottom': 'var(--axis-safe-bottom, 0px)',
    '--aw-safe-left': 'var(--axis-safe-left, 0px)'
  }
};
