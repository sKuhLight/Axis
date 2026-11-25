// Block Editor "Page ▾" menu (Arrange bar): what can be done to the current page, as workbench menu items
// (rendered by the workbench ContextMenu: an inline rename field, an inline delete confirm). Pure
// (pageMenu.test.ts).
//
//   <page>
//   Rename…               inline field (Enter saves; an empty or taken name keeps the field open)
//   Duplicate             a copy right after it (fresh ids), shown next
//   Pin page as panel     its controls into a new workbench custom panel (only with a workbench)
//   Move left / right     (up / down with the side navigation)
//   Delete page           asks first; never the last page
//   Add page

import type { WorkbenchMenuItem } from '../workbench';
import type { BeNav } from './boardGeometry';

export interface PageMenuState {
  page: string;
  pageOrder: readonly string[];
  nav: BeNav;
  /** A workbench with the pin action is around. */
  canPin: boolean;
  /** Controls on the page that can be pinned. */
  pinCount: number;
}

export interface PageMenuActions {
  /** Rename the page; false keeps the field open (empty / taken name). */
  rename(name: string): boolean;
  duplicate(): void;
  pin(): void;
  move(delta: -1 | 1): void;
  remove(): void;
  add(): void;
}

const cls = (id: string): string => `be-pm be-pm-${id}`;
const noop = () => {};

export function buildPageMenu(s: PageMenuState, a: PageMenuActions): WorkbenchMenuItem[] {
  const i = s.pageOrder.indexOf(s.page);
  const known = i >= 0;
  const side = s.nav === 'side';
  const rows: WorkbenchMenuItem[] = [
    { id: 'head', kind: 'header', label: s.page || 'Page', className: cls('head'), run: noop },
    {
      id: 'rename',
      kind: 'input',
      label: 'Rename…',
      value: s.page,
      placeholder: 'Page name',
      disabled: !known,
      className: cls('rename'),
      run: noop,
      onSubmit: (v) => a.rename(v)
    },
    { id: 'duplicate', label: 'Duplicate', disabled: !known, className: cls('duplicate'), run: () => a.duplicate() }
  ];
  if (s.canPin) {
    rows.push({
      id: 'pin',
      label: 'Pin page as panel',
      hint: s.pinCount ? `${s.pinCount} control${s.pinCount === 1 ? '' : 's'}` : 'nothing to pin',
      disabled: !known || s.pinCount === 0,
      className: cls('pin'),
      run: () => a.pin()
    });
  }
  rows.push(
    { id: 'earlier', label: side ? 'Move up' : 'Move left', disabled: !known || i === 0, separatorBefore: true, className: cls('earlier'), run: () => a.move(-1) },
    { id: 'later', label: side ? 'Move down' : 'Move right', disabled: !known || i === s.pageOrder.length - 1, className: cls('later'), run: () => a.move(1) },
    {
      id: 'delete',
      label: 'Delete page',
      danger: true,
      disabled: !known || s.pageOrder.length < 2,
      hint: s.pageOrder.length < 2 ? 'last page' : undefined,
      separatorBefore: true,
      className: cls('delete'),
      confirm: { prompt: `Delete “${s.page}” and every control on it?`, confirmLabel: 'Delete' },
      run: () => a.remove()
    },
    { id: 'add', label: 'Add page', separatorBefore: true, className: cls('add'), run: () => a.add() }
  );
  return rows;
}
