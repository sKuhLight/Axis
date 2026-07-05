import type { WorkbenchTheme } from '../workbench';

export const axisWorkbenchTheme: WorkbenchTheme = {
  name: 'Axis Dark',
  className: 'axis-workbench-theme',
  vars: {
    '--aw-safe-top': 'var(--axis-safe-top, 0px)',
    '--aw-safe-bottom': 'var(--axis-safe-bottom, 0px)'
  }
};
