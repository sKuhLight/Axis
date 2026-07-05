import { AXIS_FC_PARTS, axisFcPanelType } from './fc/types';
import { AXIS_PRESET_BROWSER_PARTS, axisPresetBrowserPanelType } from './presetBrowser/types';
import { AXIS_PIN_SELECTED_PARAMETERS_ACTION } from './axisParameterActions';

export const AXIS_WORKBENCH_BASE_PANEL_TYPES = [
  'axis.signalGrid',
  'axis.blockEditor',
  'axis.presetBrowser',
  'axis.fc',
  'axis.history',
  'axis.account',
  'axis.deviceTools',
  'axis.customPanel'
] as const;

export const AXIS_WORKBENCH_PRESET_BROWSER_PANEL_TYPES = AXIS_PRESET_BROWSER_PARTS.map(axisPresetBrowserPanelType);
export const AXIS_WORKBENCH_FC_PANEL_TYPES = AXIS_FC_PARTS.map(axisFcPanelType);

export const AXIS_WORKBENCH_WIDGET_TYPES = [
  'axis.logo',
  'axis.preset',
  'axis.scenes',
  'axis.view',
  'axis.addBlock',
  'axis.tuner',
  'axis.tempo',
  'axis.cpu',
  'axis.save',
  'axis.search',
  'axis.history',
  'axis.gridMap',
  'axis.undoRedo',
  'axis.connection',
  'axis.account',
  'axis.gridMode',
  'axis.blockSize',
  'axis.fcDevice',
  'axis.fcLayouts',
  'axis.fcSwitchView',
  'axis.paramControl'
] as const;

export const AXIS_WORKBENCH_NAVIGATION_IDS = ['grid', 'library', 'fc', 'scenes', 'live', 'setup', 'account'] as const;

export const AXIS_WORKBENCH_ACTION_IDS = [
  'axis.openGrid',
  'axis.openPresetBrowser',
  'axis.openFc',
  'axis.openAccount',
  'axis.openScenes',
  'axis.openLive',
  'axis.openSetup',
  AXIS_PIN_SELECTED_PARAMETERS_ACTION
] as const;
