export interface AxisWorkbenchFeatureEnv {
  [key: string]: unknown;
  VITE_AXIS_WORKBENCH?: string;
}

export function isAxisWorkbenchFeatureEnabled(env: AxisWorkbenchFeatureEnv): boolean {
  return env.VITE_AXIS_WORKBENCH === '1';
}
