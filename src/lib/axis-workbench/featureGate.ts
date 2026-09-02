export interface AxisWorkbenchFeatureEnv {
  [key: string]: unknown;
  VITE_AXIS_WORKBENCH?: string;
  VITE_AXIS_LAYOUT_EDIT?: string;
  VITE_AXIS_CONTROL_ARRANGE?: string;
}

export function isAxisWorkbenchFeatureEnabled(env: AxisWorkbenchFeatureEnv): boolean {
  // The workbench shell is the DEFAULT since 0.9.0-beta (layout rework went
  // public). VITE_AXIS_WORKBENCH=0 is the escape hatch back to the legacy
  // shell; anything else (unset, '1', ...) means workbench on.
  return env.VITE_AXIS_WORKBENCH !== '0';
}

export function isAxisLayoutEditingEnabled(env: AxisWorkbenchFeatureEnv): boolean {
  // Workbench layout editing — floating widgets, widget groups, layout
  // import/export, page/panel/dock customization, profiles and layout presets.
  // ALL of it hangs off `WorkbenchController.editMode`, so this one gate retires
  // the whole set. OFF by default (opposite polarity to the shell gate above):
  // the features still exist and stay e2e-covered, they are simply unreachable
  // unless VITE_AXIS_LAYOUT_EDIT=1 asks for them back.
  return env.VITE_AXIS_LAYOUT_EDIT === '1';
}

export function isAxisControlArrangeEnabled(env: AxisWorkbenchFeatureEnv): boolean {
  // ControlSurface's own "Arrange" mode — dragging/resizing controls on a block
  // page. Independent of the workbench gate above (ControlSurface is app-layer
  // and shared by both shells). Note this is also the only entry point for
  // swipe-control mapping (the ⚡ badge), so with it off the Signal Grid swipe
  // set becomes read-only. OFF by default.
  return env.VITE_AXIS_CONTROL_ARRANGE === '1';
}
