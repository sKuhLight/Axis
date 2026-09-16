export interface AxisWorkbenchFeatureEnv {
  [key: string]: unknown;
  VITE_AXIS_LAYOUT_EDIT?: string;
}

export function isAxisLayoutEditingEnabled(env: AxisWorkbenchFeatureEnv): boolean {
  // Workbench layout editing — floating widgets, widget groups, layout
  // import/export, page/panel/dock customization, profiles and layout presets.
  // ALL of it hangs off `WorkbenchController.editMode`, so this one gate retires
  // the whole set. OFF by default: the features still exist and stay
  // e2e-covered, they are simply unreachable unless VITE_AXIS_LAYOUT_EDIT=1 asks
  // for them back.
  return env.VITE_AXIS_LAYOUT_EDIT === '1';
}
