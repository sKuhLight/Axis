export interface AxisWorkbenchFeatureEnv {
  [key: string]: unknown;
  VITE_AXIS_WORKBENCH?: string;
}

export function isAxisWorkbenchFeatureEnabled(env: AxisWorkbenchFeatureEnv): boolean {
  // The workbench shell is the DEFAULT since 0.9.0-beta (layout rework went
  // public). VITE_AXIS_WORKBENCH=0 is the escape hatch back to the legacy
  // shell; anything else (unset, '1', ...) means workbench on.
  return env.VITE_AXIS_WORKBENCH !== '0';
}
