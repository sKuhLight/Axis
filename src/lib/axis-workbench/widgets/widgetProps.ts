import type { WidgetInstance, WidgetSize, WorkbenchCommand } from '../../workbench';

export interface AxisWorkbenchWidgetProps {
  widget: WidgetInstance;
  size: WidgetSize;
  dispatch: (command: WorkbenchCommand) => void;
  editMode: boolean;
}
