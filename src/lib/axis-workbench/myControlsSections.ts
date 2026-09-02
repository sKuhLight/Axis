import {
  createWorkbenchId,
  selectVisibleWidgetsByZone,
  type WidgetInstance,
  type WorkbenchDocument
} from '../workbench';
import { AXIS_MY_CONTROLS_ZONE } from './myControlsPanel';

/**
 * Sections inside My Controls.
 *
 * A section is NOT a container: it is a marker widget in the panel's one widget
 * zone that claims a full grid row. Everything after it, up to the next marker,
 * reads as belonging to it. Nothing is nested, so ordering, persistence and
 * `Remove Widget` keep working exactly as they do for a pinned control — and
 * removing a header leaves its controls in place rather than deleting them.
 *
 * One widget type covers both affordances: with a label it renders as a titled
 * rule, without one as a bare divider bar.
 */
export const AXIS_SECTION_HEADER_TYPE = 'axis.sectionHeader';

/** Label a "＋ Section" starts life with, before the user renames it. */
export const AXIS_SECTION_DEFAULT_LABEL = 'Section';

export interface AxisMyControlsSection {
  /** The header widget itself — the id a pin targets. */
  headerWidgetId: string;
  label: string;
  /** Controls between this header and the next one. */
  controlCount: number;
  /**
   * Zone index just past the section's last widget — where a control pinned into
   * this section is inserted, i.e. immediately before the following header.
   */
  endIndex: number;
}

export function isAxisSectionHeader(widget: Pick<WidgetInstance, 'type'>): boolean {
  return widget.type === AXIS_SECTION_HEADER_TYPE;
}

/** A header's text. Blank (or absent) means "render as a plain divider". */
export function axisSectionHeaderLabel(widget: Pick<WidgetInstance, 'state'>): string {
  const label = widget.state?.label;
  return typeof label === 'string' ? label : '';
}

/**
 * A new header widget. `grid.colSpan: 'full'` is what makes it span the panel's
 * whole row whatever `panel.state.grid.columns` happens to be — see
 * `WidgetZone.gridCellStyle`.
 */
export function createAxisSectionHeaderWidget(label: string): WidgetInstance {
  return {
    id: createWorkbenchId('widget'),
    type: AXIS_SECTION_HEADER_TYPE,
    zone: AXIS_MY_CONTROLS_ZONE,
    order: 0,
    size: 'default',
    state: { label, grid: { colSpan: 'full' } }
  };
}

/**
 * How many CONTROLS are pinned — headers are chrome and must not inflate the
 * count the pin menu shows as its hint.
 */
export function axisMyControlsWidgetCount(doc: WorkbenchDocument): number {
  return selectVisibleWidgetsByZone(doc, AXIS_MY_CONTROLS_ZONE).filter((widget) => !isAxisSectionHeader(widget)).length;
}

/**
 * The sections currently in the panel, in zone order. Unlabelled headers (bare
 * dividers) are skipped: a divider names nothing, so it cannot be a pin target —
 * the controls after it fall to whichever named section precedes it, or to the
 * unnamed run at the top of the panel.
 */
export function axisMyControlsSections(doc: WorkbenchDocument): AxisMyControlsSection[] {
  const widgets = selectVisibleWidgetsByZone(doc, AXIS_MY_CONTROLS_ZONE);
  const sections: AxisMyControlsSection[] = [];
  let current: AxisMyControlsSection | null = null;

  widgets.forEach((widget, index) => {
    if (isAxisSectionHeader(widget)) {
      const label = axisSectionHeaderLabel(widget);
      current = label ? { headerWidgetId: widget.id, label, controlCount: 0, endIndex: index + 1 } : null;
      if (current) sections.push(current);
      return;
    }
    if (!current) return;
    current.controlCount += 1;
    current.endIndex = index + 1;
  });

  return sections;
}

/**
 * Where a pin lands. `null` (or a header that is no longer there) means the end
 * of the panel, which is the historical append behaviour.
 */
export function axisMyControlsSectionInsertIndex(doc: WorkbenchDocument, headerWidgetId: string | null): number {
  const widgets = selectVisibleWidgetsByZone(doc, AXIS_MY_CONTROLS_ZONE);
  if (!headerWidgetId) return widgets.length;
  const section = axisMyControlsSections(doc).find((entry) => entry.headerWidgetId === headerWidgetId);
  return section ? section.endIndex : widgets.length;
}
