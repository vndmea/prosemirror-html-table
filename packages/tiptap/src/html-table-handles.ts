import { NodeSelection, Plugin, PluginKey, type Transaction } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import {
  CellSelection,
  addColumnAfter as addCoreColumnAfter,
  addRowAfter as addCoreRowAfter,
  createHtmlTableGrid,
} from 'prosemirror-html-table';

import type { HtmlTableTiptapOptions } from './options.js';
import {
  getHtmlTableContextActionMenuItemState,
  getHtmlTableContextActionShortcutState,
  type HtmlTableContextActionId,
} from './html-table-actions.js';
import {
  getHtmlTableContextMenuState,
  runHtmlTableContextMenuAction,
  type HtmlTableContextMenuState,
  getHtmlTableContextTriggerButtonState,
  type HtmlTableContextTriggerButtonState,
} from './html-table-context-menu.js';
import {
  getHtmlTableInteractionState,
  type HtmlTableInteractionState,
  htmlTableInteractionPluginKey,
} from './html-table-interaction.js';
import { getRenderedHtmlTableContext, measureHtmlTableGeometry } from './table-dom.js';
import {
  createColumnSelectionTransaction,
  createColumnResizeTransaction,
  createRowSelectionTransaction,
  getTableColumnWidths,
  getTableSelectionInfo,
} from './table-utils.js';

const ROW_HANDLE_OFFSET = 10;
const COLUMN_HANDLE_OFFSET = 10;
const MIN_HANDLE_INSET = 8;
const EXTEND_BUTTON_OFFSET = 14;
const HANDLE_CROSS_AXIS_SIZE = 12;
const HANDLE_MAIN_AXIS_INSET = 8;
const CONTEXT_MENU_TYPEAHEAD_RESET_MS = 700;
let htmlTableContextMenuIdCounter = 0;
const MENU_SCOPE_LABELS: Record<HtmlTableSelectionScope, string> = {
  table: 'Table actions',
  row: 'Row actions',
  column: 'Column actions',
  cell: 'Cell actions',
};

export const htmlTableHandlePluginKey = new PluginKey('html-table-handle-overlay');

export type HtmlTableSelectionScope = 'table' | 'row' | 'column' | 'cell';

export interface HtmlTableSelectionAnchor {
  left: number;
  top: number;
}

export interface HtmlTableContextTriggerRenderState {
  visible: boolean;
  left: number | null;
  top: number | null;
  expanded: boolean;
  label: string | null;
  title: string | null;
  scope: HtmlTableSelectionScope | null;
  primaryActionId: string | null;
}

export interface HtmlTableContextMenuRenderState {
  visible: boolean;
  left: number | null;
  top: number | null;
  scope: HtmlTableSelectionScope | null;
  primaryActionId: string | null;
  groupCount: number;
}

export interface HtmlTableCellContextTriggerRenderState {
  visible: boolean;
  expanded: boolean;
  label: string | null;
  title: string | null;
  primaryActionId: string | null;
}

export interface HtmlTableOverlayHandleText {
  label: string;
  title: string;
}

export interface HtmlTableContextMenuActionRenderState {
  role: string;
  checked: 'true' | 'false' | null;
  current: 'true' | 'false';
  primary: boolean;
  destructive: boolean;
  active: boolean;
}

export interface HtmlTableContextMenuHeaderState {
  label: string | null;
  detail: string | null;
}

export interface HtmlTableContextMenuAccessibleState {
  labelledBy: string | null;
  describedBy: string | null;
}

export interface HtmlTableContextMenuGroupAccessibleState {
  labelId: string;
}

type HtmlTableMenuContext =
  | { scope: 'table'; tablePos: number }
  | { scope: 'row'; tablePos: number; rowIndex: number }
  | { scope: 'column'; tablePos: number; columnIndex: number }
  | { scope: 'cell'; tablePos: number; anchorCellPos: number; headCellPos: number };

export type HtmlTableContextMenuPlacement =
  | 'right-start'
  | 'right-center'
  | 'left-start'
  | 'left-center'
  | 'bottom-center'
  | 'top-center';

export interface HtmlTableContextMenuPosition {
  left: number;
  top: number;
  placement: HtmlTableContextMenuPlacement;
}

export function isTableHandleVisible(
  allowTableNodeSelection: boolean,
  interaction: HtmlTableInteractionState,
  tablePos: number,
): boolean {
  return allowTableNodeSelection && interaction.activeTable?.tablePos === tablePos;
}

export function getHtmlTableSelectionScope(
  interaction: HtmlTableInteractionState,
  tablePos: number,
  selectionInfo: ReturnType<typeof getTableSelectionInfo> | null,
): HtmlTableSelectionScope | null {
  if (interaction.tableSelected && interaction.activeTable?.tablePos === tablePos) {
    return 'table';
  }

  if (Boolean(interaction.selectedAxisExplicit) && interaction.selectedAxis.tablePos === tablePos) {
    if (interaction.selectedAxis.kind === 'row') return 'row';
    if (interaction.selectedAxis.kind === 'column') return 'column';
  }

  if (selectionInfo?.tablePos === tablePos) {
    return 'cell';
  }

  return null;
}

export function getHtmlTableSelectionAnchor(
  interaction: HtmlTableInteractionState,
  tablePos: number,
  geometry: ReturnType<typeof measureHtmlTableGeometry>,
  tableLeft: number,
  tableTop: number,
  selectionInfo: ReturnType<typeof getTableSelectionInfo> | null,
): HtmlTableSelectionAnchor | null {
  const scope = getHtmlTableSelectionScope(interaction, tablePos, selectionInfo);
  if (scope === 'table') {
    return {
      left: tableLeft,
      top: tableTop,
    };
  }

  if (scope === 'row' && interaction.selectedAxis.index !== null) {
    const row = geometry.rows[interaction.selectedAxis.index];
    if (!row) return null;
    return {
      left: tableLeft,
      top: tableTop + row.top + row.height / 2,
    };
  }

  if (scope === 'column' && interaction.selectedAxis.index !== null) {
    const column = geometry.columns[interaction.selectedAxis.index];
    if (!column) return null;
    return {
      left: tableLeft + column.left + column.width / 2,
      top: tableTop,
    };
  }

  if (scope === 'cell' && selectionInfo) {
    const leftColumn = geometry.columns[selectionInfo.left];
    const rightColumn = geometry.columns[selectionInfo.right];
    const topRow = geometry.rows[selectionInfo.top];
    const bottomRow = geometry.rows[selectionInfo.bottom];
    if (!leftColumn || !rightColumn || !topRow || !bottomRow) {
      return null;
    }

    const selectionTop = tableTop + topRow.top;
    const selectionBottom = tableTop + bottomRow.top + bottomRow.height;
    const selectionRight = tableLeft + rightColumn.left + rightColumn.width;

    return {
      left: selectionRight - 1,
      top: selectionTop + (selectionBottom - selectionTop) / 2,
    };
  }

  return null;
}

export function getHtmlTableContextTriggerRenderState(
  trigger: HtmlTableContextTriggerButtonState,
): HtmlTableContextTriggerRenderState {
  return {
    visible: trigger.visible,
    left: trigger.anchor?.left ?? null,
    top: trigger.anchor?.top ?? null,
    expanded: trigger.expanded,
    label: trigger.label,
    title: trigger.title,
    scope: trigger.scope,
    primaryActionId: trigger.primaryAction?.id ?? null,
  };
}

export function getHtmlTableContextMenuRenderState(
  menu: HtmlTableContextMenuState,
): HtmlTableContextMenuRenderState {
  return {
    visible: Boolean(menu.open && menu.anchor),
    left: menu.anchor?.left ?? null,
    top: menu.anchor?.top ?? null,
    scope: menu.scope,
    primaryActionId: menu.primaryAction?.id ?? null,
    groupCount: menu.groups.length,
  };
}

export function isHtmlTableContextMenuExpandedForScope(
  menu: HtmlTableContextMenuState,
  scope: HtmlTableSelectionScope,
): boolean {
  return menu.open && menu.scope === scope;
}

export function getHtmlTableContextMenuAriaControls(
  menuId: string,
  expanded: boolean,
): string | null {
  return expanded ? menuId : null;
}

export function getHtmlTableOverlayHandleText(
  kind: 'table' | 'row' | 'column',
  index: number | null,
  selected: boolean,
  expanded: boolean,
  primaryActionLabel: string | null,
): HtmlTableOverlayHandleText {
  const target =
    kind === 'table'
      ? 'Table'
      : kind === 'row'
        ? `Row ${index !== null ? index + 1 : ''}`.trim()
        : `Column ${index !== null ? index + 1 : ''}`.trim();
  const actionTarget =
    kind === 'table'
      ? 'table'
      : kind === 'row'
        ? `row ${index !== null ? index + 1 : ''}`.trim()
        : `column ${index !== null ? index + 1 : ''}`.trim();

  if (expanded) {
    const title = primaryActionLabel
      ? `${target} actions: ${primaryActionLabel}`
      : `${target} actions`;
    return {
      label: `${target} actions`,
      title,
    };
  }

  if (selected) {
    return {
      label: `${target} actions`,
      title: `Open actions for ${actionTarget}`,
    };
  }

  return {
    label: kind === 'table' ? 'Select table' : `Select ${actionTarget}`,
    title: kind === 'table' ? 'Select table' : `Select ${actionTarget}`,
  };
}

export function getHtmlTableContextMenuActionRenderState(
  action: {
    active?: boolean;
    destructive?: boolean;
  },
  menuItemState: {
    role: string;
    checked: boolean | null;
  },
  primary: boolean,
): HtmlTableContextMenuActionRenderState {
  return {
    role: menuItemState.role,
    checked:
      menuItemState.checked === null
        ? null
        : menuItemState.checked
          ? 'true'
          : 'false',
    current: primary ? 'true' : 'false',
    primary,
    destructive: Boolean(action.destructive),
    active: Boolean(action.active),
  };
}

export function getHtmlTableContextMenuPosition(
  scope: HtmlTableSelectionScope,
  anchorLeft: number,
  anchorTop: number,
  menuWidth: number,
  menuHeight: number,
  viewportLeft: number,
  viewportTop: number,
  viewportRight: number,
  viewportBottom: number,
): HtmlTableContextMenuPosition {
  const offset = HANDLE_CROSS_AXIS_SIZE;
  let left = anchorLeft + offset;
  let top = scope === 'column'
    ? anchorTop + offset
    : scope === 'table'
      ? anchorTop + offset
      : anchorTop - menuHeight / 2;
  let placement: HtmlTableContextMenuPlacement =
    scope === 'column' ? 'bottom-center' : scope === 'table' ? 'right-start' : 'right-center';

  if (scope === 'column') {
    left = anchorLeft - menuWidth / 2;
  }

  if (left + menuWidth > viewportRight) {
    if (scope === 'column') {
      left = viewportRight - menuWidth;
    } else {
      left = anchorLeft - offset - menuWidth;
      placement = scope === 'table' ? 'left-start' : 'left-center';
    }
  }

  if (left < viewportLeft) {
    left = viewportLeft;
  }

  if (scope === 'column' || scope === 'table') {
    if (top + menuHeight > viewportBottom) {
      top = anchorTop - offset - menuHeight;
      placement = 'top-center';
    }
  }

  if (top < viewportTop) {
    top = viewportTop;
  }

  if (top + menuHeight > viewportBottom) {
    top = Math.max(viewportTop, viewportBottom - menuHeight);
  }

  return {
    left,
    top,
    placement,
  };
}

export function getHtmlTableContextMenuTransformOrigin(
  placement: HtmlTableContextMenuPlacement,
): string {
  switch (placement) {
    case 'left-start':
      return 'right top';
    case 'left-center':
      return 'right center';
    case 'bottom-center':
      return 'center top';
    case 'top-center':
      return 'center bottom';
    case 'right-start':
      return 'left top';
    case 'right-center':
    default:
      return 'left center';
  }
}

export function getHtmlTableContextMenuHeaderState(
  menu: Pick<HtmlTableContextMenuState, 'scope' | 'primaryAction'>,
): HtmlTableContextMenuHeaderState {
  const label = menu.scope ? MENU_SCOPE_LABELS[menu.scope] : null;
  return {
    label,
    detail: menu.primaryAction?.label ?? null,
  };
}

export function getHtmlTableContextMenuAccessibleState(
  menuId: string,
  header: HtmlTableContextMenuHeaderState,
): HtmlTableContextMenuAccessibleState {
  return {
    labelledBy: header.label ? `${menuId}-title` : null,
    describedBy: header.detail ? `${menuId}-detail` : null,
  };
}

export function getHtmlTableContextMenuGroupAccessibleState(
  menuId: string,
  groupId: string,
): HtmlTableContextMenuGroupAccessibleState {
  return {
    labelId: `${menuId}-group-${groupId}`,
  };
}

export function shouldCloseHtmlTableContextMenuForTarget(
  target: EventTarget | null,
  ...elements: Array<Pick<Element, 'contains'> | null>
): boolean {
  return !elements.some((element) => element && containsEventTarget(element, target));
}

export function isHtmlTableContextMenuDismissKey(key: string): boolean {
  return key === 'Escape';
}

export function isHtmlTableContextMenuExitKey(key: string): boolean {
  return key === 'Tab';
}

export function isHtmlTableContextMenuNavigationKey(key: string): boolean {
  return key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End';
}

export function isHtmlTableContextMenuTypeaheadKey(event: {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
}): boolean {
  if (event.altKey || event.ctrlKey || event.metaKey) {
    return false;
  }

  return event.key.length === 1 && event.key.trim().length > 0;
}

export function getNextHtmlTableContextMenuActionIndex(
  currentIndex: number,
  total: number,
  key: string,
): number {
  if (total <= 0) {
    return -1;
  }

  if (key === 'Home') {
    return 0;
  }

  if (key === 'End') {
    return total - 1;
  }

  if (currentIndex < 0 || currentIndex >= total) {
    return key === 'ArrowUp' ? total - 1 : 0;
  }

  if (key === 'ArrowUp') {
    return (currentIndex - 1 + total) % total;
  }

  if (key === 'ArrowDown') {
    return (currentIndex + 1) % total;
  }

  return currentIndex;
}

export function getNextHtmlTableContextMenuTypeaheadIndex(
  labels: string[],
  currentIndex: number,
  query: string,
): number {
  if (!labels.length || !query.length) {
    return -1;
  }

  const normalizedQuery = query.toLowerCase();
  for (let offset = 1; offset <= labels.length; offset += 1) {
    const index = (Math.max(currentIndex, -1) + offset) % labels.length;
    const label = labels[index]?.trim().toLowerCase() ?? '';
    if (label.startsWith(normalizedQuery)) {
      return index;
    }
  }

  return -1;
}

export function isHtmlTableKeyboardClick(event: Pick<MouseEvent, 'detail'>): boolean {
  return event.detail === 0;
}

export function canRestoreHtmlTableContextMenuFocus(target: HTMLButtonElement | null): target is HTMLButtonElement {
  return Boolean(target && target.isConnected && !target.hidden && target.tabIndex >= 0);
}

export function getHtmlTableCellContextTriggerRenderState(
  menu: HtmlTableContextMenuState,
): HtmlTableCellContextTriggerRenderState {
  const visible = menu.scope === 'cell';
  return {
    visible,
    expanded: visible && menu.visible && menu.open,
    label: visible ? 'Cell actions' : null,
    title: visible && menu.primaryAction ? `Cell actions: ${menu.primaryAction.label}` : visible ? 'Cell actions' : null,
    primaryActionId: visible ? menu.primaryAction?.id ?? null : null,
  };
}

export function shouldToggleHtmlTableContextMenuFromAxisHandle(
  interaction: HtmlTableInteractionState,
  axis: 'row' | 'column',
  index: number,
  tablePos: number,
): boolean {
  return (
    Boolean(interaction.selectedAxisExplicit) &&
    interaction.selectedAxis.kind === axis &&
    interaction.selectedAxis.index === index &&
    interaction.selectedAxis.tablePos === tablePos
  );
}

export function shouldToggleHtmlTableContextMenuFromTableHandle(
  interaction: HtmlTableInteractionState,
  tablePos: number,
): boolean {
  return interaction.tableSelected && interaction.activeTable?.tablePos === tablePos;
}

export function isHtmlTableAxisHandleHovered(
  interaction: HtmlTableInteractionState,
  axis: 'row' | 'column',
  tablePos: number,
  index: number,
): boolean {
  if (interaction.hovered?.tablePos !== tablePos) {
    return false;
  }

  if (axis === 'row') {
    return interaction.hovered.rowIndex === index;
  }

  return interaction.hovered.columnIndex === index;
}

function containsEventTarget(
  element: Pick<Element, 'contains'>,
  target: EventTarget | null,
): boolean {
  if (!target) {
    return false;
  }

  if (target === (element as unknown as EventTarget)) {
    return true;
  }

  try {
    return element.contains(target as Node);
  } catch {
    return false;
  }
}

export function createHtmlTableHandlePlugin(options: HtmlTableTiptapOptions): Plugin {
  return new Plugin({
    key: htmlTableHandlePluginKey,
    view(view) {
      return new HtmlTableHandleOverlayView(view, options);
    },
  });
}

class HtmlTableHandleOverlayView {
  private view: EditorView;
  private readonly options: HtmlTableTiptapOptions;
  private readonly root: HTMLDivElement;
  private readonly contextMenuId: string;
  private readonly contextTriggerButton: HTMLButtonElement;
  private readonly contextMenu: HTMLDivElement;
  private readonly tableHandle: HTMLButtonElement;
  private readonly rowSelectionOverlay: HTMLDivElement;
  private readonly columnSelectionOverlay: HTMLDivElement;
  private readonly cellSelectionHandle: HTMLButtonElement;
  private readonly addRowButton: HTMLButtonElement;
  private readonly addColumnButton: HTMLButtonElement;
  private currentHost: HTMLElement | null = null;
  private currentHostPositionManaged = false;
  private renderedTablePos: number | null = null;
  private renderedGeometry: ReturnType<typeof measureHtmlTableGeometry> | null = null;
  private rowHandles: HTMLButtonElement[] = [];
  private columnHandles: HTMLButtonElement[] = [];
  private resizeHandles: HTMLButtonElement[] = [];
  private activeResize:
    | {
        tablePos: number;
        columnIndex: number;
        startX: number;
        startWidths: number[];
        currentWidths: number[];
      }
    | null = null;
  private lastContextMenuOpen = false;
  private contextMenuFocusTarget: HTMLButtonElement | null = null;
  private restoreContextMenuFocusOnClose = false;
  private contextMenuTypeaheadQuery = '';
  private contextMenuTypeaheadResetTimer: ReturnType<typeof setTimeout> | null = null;
  private contextMenuContext: HtmlTableMenuContext | null = null;
  private suppressNextDocumentClick = false;
  private readonly onDocumentMouseMove = (event: MouseEvent) => this.handleResizeMove(event);
  private readonly onDocumentMouseUp = () => this.finishResize();
  private readonly onDocumentMouseUpCapture = (event: MouseEvent) => this.handleDocumentMouseUpCapture(event);
  private readonly onDocumentClickCapture = (event: MouseEvent) => this.handleDocumentClickCapture(event);
  private readonly onDocumentMouseDown = (event: MouseEvent) => this.handleDocumentMouseDown(event);
  private readonly onDocumentKeyDown = (event: KeyboardEvent) => this.handleDocumentKeyDown(event);

  constructor(view: EditorView, options: HtmlTableTiptapOptions) {
    this.view = view;
    this.options = options;
    this.root = view.dom.ownerDocument.createElement('div');
    this.root.className = 'html-table-overlay';
    this.root.dataset.htmlTableOverlay = 'true';
    this.root.dataset.testid = 'pmht-overlay';
    this.root.setAttribute('role', 'presentation');
    this.root.hidden = true;
    this.contextMenuId = `html-table-overlay-menu-${htmlTableContextMenuIdCounter += 1}`;
    this.contextTriggerButton = this.createContextTriggerButton();
    this.contextMenu = this.createContextMenu();
    this.tableHandle = this.createTableHandle();
    this.rowSelectionOverlay = this.root.ownerDocument.createElement('div');
    this.rowSelectionOverlay.className = 'html-table-overlay__selection-band html-table-overlay__selection-band--row';
    this.rowSelectionOverlay.dataset.testid = 'pmht-selection-band-row';
    this.columnSelectionOverlay = this.root.ownerDocument.createElement('div');
    this.columnSelectionOverlay.className =
      'html-table-overlay__selection-band html-table-overlay__selection-band--column';
    this.columnSelectionOverlay.dataset.testid = 'pmht-selection-band-column';
    this.cellSelectionHandle = this.root.ownerDocument.createElement('button');
    this.cellSelectionHandle.type = 'button';
    this.cellSelectionHandle.className = 'html-table-overlay__cell-selection-handle';
    this.cellSelectionHandle.dataset.testid = 'pmht-cell-handle';
    this.cellSelectionHandle.tabIndex = -1;
    this.cellSelectionHandle.hidden = true;
    this.cellSelectionHandle.setAttribute('aria-label', 'Selected cells handle');
    this.cellSelectionHandle.title = 'Selected cells handle';
    this.cellSelectionHandle.addEventListener('mousedown', (event) => this.handleCellSelectionHandleMouseDown(event));
    this.cellSelectionHandle.addEventListener('click', (event) => this.handleCellSelectionHandleClick(event));
    this.addRowButton = this.createExtendButton('row');
    this.addColumnButton = this.createExtendButton('column');
    this.root.append(
      this.contextTriggerButton,
      this.contextMenu,
      this.tableHandle,
      this.rowSelectionOverlay,
      this.columnSelectionOverlay,
      this.cellSelectionHandle,
      this.addRowButton,
      this.addColumnButton,
    );
    this.root.ownerDocument.addEventListener('mousedown', this.onDocumentMouseDown);
    this.root.ownerDocument.addEventListener('mouseup', this.onDocumentMouseUpCapture, true);
    this.root.ownerDocument.addEventListener('click', this.onDocumentClickCapture, true);
    this.root.ownerDocument.addEventListener('keydown', this.onDocumentKeyDown);
    this.render();
  }

  update(view: EditorView): void {
    this.view = view;
    this.render();
  }

  destroy(): void {
    this.clearActiveResize(false);
    this.resetContextMenuTypeahead();
    this.root.ownerDocument.removeEventListener('mousedown', this.onDocumentMouseDown);
    this.root.ownerDocument.removeEventListener('mouseup', this.onDocumentMouseUpCapture, true);
    this.root.ownerDocument.removeEventListener('click', this.onDocumentClickCapture, true);
    this.root.ownerDocument.removeEventListener('keydown', this.onDocumentKeyDown);
    this.currentHost = null;
    this.currentHostPositionManaged = false;
    this.renderedTablePos = null;
    this.renderedGeometry = null;
    this.root.remove();
    this.rowHandles = [];
    this.columnHandles = [];
    this.resizeHandles = [];
  }

  private render(): void {
    const interaction = getHtmlTableInteractionState(this.view.state);
    const activeTable = interaction.activeTable;
    const geometry = interaction.geometry;
    if (!activeTable || !geometry) {
      this.detach();
      return;
    }

    const context = getRenderedHtmlTableContext(this.view, activeTable.tablePos);
    if (!context) {
      this.detach();
      return;
    }

    this.renderedTablePos = activeTable.tablePos;
    this.renderedGeometry = geometry;

    const overlayHost = this.getOverlayHost();
    this.attach(overlayHost);

    const hostRect = overlayHost.getBoundingClientRect();
    const tableLeft = geometry.tableRect.left - hostRect.left;
    const tableTop = geometry.tableRect.top - hostRect.top;
    const rowHandleLeft = Math.max(MIN_HANDLE_INSET, tableLeft - ROW_HANDLE_OFFSET);
    const columnHandleTop = Math.max(MIN_HANDLE_INSET, tableTop - COLUMN_HANDLE_OFFSET);
    const selectionInfo = getTableSelectionInfo(this.view.state.doc, this.view.state.selection);
    const contextTrigger = getHtmlTableContextTriggerButtonState(this.view.state, interaction);
    const contextMenu = getHtmlTableContextMenuState(this.view.state, interaction);

    this.syncHandleCount('row', geometry.rows.length);
    this.syncHandleCount('column', geometry.columns.length);
    this.syncResizeHandleCount(this.options.resizable ? geometry.columns.length : 0);
    this.syncSelectionContextState(interaction, activeTable.tablePos, geometry, tableLeft, tableTop, selectionInfo);
    this.syncContextTriggerButton(contextTrigger, hostRect);
    this.syncContextMenu(contextMenu, hostRect);
    this.syncTableHandle(interaction, contextMenu, activeTable.tablePos, rowHandleLeft, columnHandleTop);
    this.syncSelectionOverlay(interaction, activeTable.tablePos, geometry, tableLeft, tableTop);
    this.syncCellSelectionHandle(contextMenu, activeTable.tablePos, geometry, tableLeft, tableTop, selectionInfo);
    this.syncExtendButtons(tableLeft, tableTop, geometry);

    for (const row of geometry.rows) {
      const handle = this.rowHandles[row.index];
      if (!handle) continue;

      handle.dataset.index = String(row.index);
      handle.style.left = `${rowHandleLeft}px`;
      handle.style.top = `${tableTop + row.top + row.height / 2}px`;
      handle.style.width = `${HANDLE_CROSS_AXIS_SIZE}px`;
      handle.style.height = `${Math.max(HANDLE_CROSS_AXIS_SIZE, row.height - HANDLE_MAIN_AXIS_INSET)}px`;
      const isRowHovered = isHtmlTableAxisHandleHovered(interaction, 'row', activeTable.tablePos, row.index);
      const isRowSelected =
        Boolean(interaction.selectedAxisExplicit) &&
        interaction.selectedAxis.kind === 'row' &&
        interaction.selectedAxis.index === row.index &&
        interaction.selectedAxis.tablePos === activeTable.tablePos;
      const isRowMenuOpen = isRowSelected && isHtmlTableContextMenuExpandedForScope(contextMenu, 'row');
      const rowText = getHtmlTableOverlayHandleText(
        'row',
        row.index,
        isRowSelected,
        isRowMenuOpen,
        isRowMenuOpen ? contextMenu.primaryAction?.label ?? null : null,
      );
      const rowControls = getHtmlTableContextMenuAriaControls(this.contextMenuId, isRowMenuOpen);
      handle.hidden = interaction.tableSelected || (!isRowHovered && !isRowSelected);
      handle.tabIndex = handle.hidden ? -1 : 0;
      handle.setAttribute('aria-label', rowText.label);
      handle.title = rowText.title;
      handle.setAttribute('aria-haspopup', 'menu');
      handle.setAttribute('aria-expanded', isRowMenuOpen ? 'true' : 'false');
      if (rowControls) {
        handle.setAttribute('aria-controls', rowControls);
      } else {
        handle.removeAttribute('aria-controls');
      }
      handle.classList.toggle(
        'is-hovered',
        isRowHovered,
      );
      handle.classList.toggle(
        'is-selected',
        isRowSelected,
      );
      handle.classList.toggle('is-menu-open', isRowMenuOpen);
    }

    for (const column of geometry.columns) {
      const handle = this.columnHandles[column.index];
      if (!handle) continue;

      handle.dataset.index = String(column.index);
      handle.style.left = `${tableLeft + column.left + column.width / 2}px`;
      handle.style.top = `${columnHandleTop}px`;
      handle.style.width = `${Math.max(HANDLE_CROSS_AXIS_SIZE, column.width - HANDLE_MAIN_AXIS_INSET)}px`;
      handle.style.height = `${HANDLE_CROSS_AXIS_SIZE}px`;
      const isColumnHovered = isHtmlTableAxisHandleHovered(interaction, 'column', activeTable.tablePos, column.index);
      const isColumnSelected =
        Boolean(interaction.selectedAxisExplicit) &&
        interaction.selectedAxis.kind === 'column' &&
        interaction.selectedAxis.index === column.index &&
        interaction.selectedAxis.tablePos === activeTable.tablePos;
      const isColumnMenuOpen = isColumnSelected && isHtmlTableContextMenuExpandedForScope(contextMenu, 'column');
      const columnText = getHtmlTableOverlayHandleText(
        'column',
        column.index,
        isColumnSelected,
        isColumnMenuOpen,
        isColumnMenuOpen ? contextMenu.primaryAction?.label ?? null : null,
      );
      const columnControls = getHtmlTableContextMenuAriaControls(this.contextMenuId, isColumnMenuOpen);
      handle.hidden = interaction.tableSelected || (!isColumnHovered && !isColumnSelected);
      handle.tabIndex = handle.hidden ? -1 : 0;
      handle.setAttribute('aria-label', columnText.label);
      handle.title = columnText.title;
      handle.setAttribute('aria-haspopup', 'menu');
      handle.setAttribute('aria-expanded', isColumnMenuOpen ? 'true' : 'false');
      if (columnControls) {
        handle.setAttribute('aria-controls', columnControls);
      } else {
        handle.removeAttribute('aria-controls');
      }
      handle.classList.toggle(
        'is-hovered',
        isColumnHovered,
      );
      handle.classList.toggle(
        'is-selected',
        isColumnSelected,
      );
      handle.classList.toggle('is-menu-open', isColumnMenuOpen);

      const resizeHandle = this.resizeHandles[column.index];
      if (!resizeHandle) continue;

      resizeHandle.dataset.index = String(column.index);
      resizeHandle.setAttribute('aria-label', `Resize column ${column.index + 1}`);
      resizeHandle.title = `Resize column ${column.index + 1}`;
      resizeHandle.style.width = `${Math.max(4, this.options.handleWidth)}px`;
      resizeHandle.style.left = `${tableLeft + column.left + column.width}px`;
      resizeHandle.style.top = `${tableTop}px`;
      resizeHandle.style.height = `${geometry.tableRect.height}px`;
      resizeHandle.hidden = !this.isColumnResizable(column.index, geometry.columns.length);
      resizeHandle.classList.toggle(
        'is-active',
        interaction.resizing?.tablePos === activeTable.tablePos && interaction.resizing.columnIndex === column.index,
      );
    }

    this.root.classList.toggle('html-table-overlay--resizing', Boolean(interaction.resizing));
    this.root.hidden = false;
  }

  private syncHandleCount(axis: 'row' | 'column', count: number): void {
    const handles = axis === 'row' ? this.rowHandles : this.columnHandles;
    const parentClassName = axis === 'row' ? 'html-table-overlay__rows' : 'html-table-overlay__columns';
    let parent = this.root.querySelector(`.${parentClassName}`) as HTMLDivElement | null;

    if (!parent) {
      parent = this.root.ownerDocument.createElement('div');
      parent.className = parentClassName;
      this.root.append(parent);
    }

    while (handles.length < count) {
      const handle = this.createHandle(axis);
      handles.push(handle);
      parent.append(handle);
    }

    while (handles.length > count) {
      handles.pop()?.remove();
    }
  }

  private syncResizeHandleCount(count: number): void {
    let parent = this.root.querySelector('.html-table-overlay__resizers') as HTMLDivElement | null;
    if (!parent) {
      parent = this.root.ownerDocument.createElement('div');
      parent.className = 'html-table-overlay__resizers';
      this.root.append(parent);
    }

    while (this.resizeHandles.length < count) {
      const handle = this.createResizeHandle();
      this.resizeHandles.push(handle);
      parent.append(handle);
    }

    while (this.resizeHandles.length > count) {
      this.resizeHandles.pop()?.remove();
    }
  }

  private syncSelectionOverlay(
    interaction: ReturnType<typeof getHtmlTableInteractionState>,
    tablePos: number,
    geometry: ReturnType<typeof measureHtmlTableGeometry>,
    tableLeft: number,
    tableTop: number,
  ): void {
    if (interaction.tableSelected) {
      this.rowSelectionOverlay.hidden = true;
      this.columnSelectionOverlay.hidden = true;
      return;
    }

    const selectedAxis =
      Boolean(interaction.selectedAxisExplicit) && interaction.selectedAxis.tablePos === tablePos
        ? interaction.selectedAxis
        : null;
    const selectedRow =
      selectedAxis?.kind === 'row' && selectedAxis.index !== null ? geometry.rows[selectedAxis.index] : null;
    const selectedColumn =
      selectedAxis?.kind === 'column' && selectedAxis.index !== null ? geometry.columns[selectedAxis.index] : null;

    if (selectedRow) {
      this.rowSelectionOverlay.hidden = false;
      this.rowSelectionOverlay.style.left = `${tableLeft}px`;
      this.rowSelectionOverlay.style.top = `${tableTop + selectedRow.top}px`;
      this.rowSelectionOverlay.style.width = `${geometry.tableRect.width}px`;
      this.rowSelectionOverlay.style.height = `${selectedRow.height}px`;
    } else {
      this.rowSelectionOverlay.hidden = true;
    }

    if (selectedColumn) {
      this.columnSelectionOverlay.hidden = false;
      this.columnSelectionOverlay.style.left = `${tableLeft + selectedColumn.left}px`;
      this.columnSelectionOverlay.style.top = `${tableTop}px`;
      this.columnSelectionOverlay.style.width = `${selectedColumn.width}px`;
      this.columnSelectionOverlay.style.height = `${geometry.tableRect.height}px`;
    } else {
      this.columnSelectionOverlay.hidden = true;
    }
  }

  private syncTableHandle(
    interaction: HtmlTableInteractionState,
    menu: HtmlTableContextMenuState,
    tablePos: number,
    left: number,
    top: number,
  ): void {
    const visible = isTableHandleVisible(this.options.allowTableNodeSelection, interaction, tablePos);
    const isHovered = interaction.hovered?.kind === 'table' && interaction.hovered.tablePos === tablePos;
    const isSelected = interaction.tableSelected && interaction.activeTable?.tablePos === tablePos;
    const isMenuOpen = isSelected && isHtmlTableContextMenuExpandedForScope(menu, 'table');
    const tableText = getHtmlTableOverlayHandleText(
      'table',
      null,
      isSelected,
      isMenuOpen,
      isMenuOpen ? menu.primaryAction?.label ?? null : null,
    );
    const controls = getHtmlTableContextMenuAriaControls(this.contextMenuId, isMenuOpen);

    this.tableHandle.hidden = !visible;
    this.tableHandle.tabIndex = visible ? 0 : -1;
    this.tableHandle.setAttribute('aria-label', tableText.label);
    this.tableHandle.title = tableText.title;
    this.tableHandle.setAttribute('aria-haspopup', 'menu');
    this.tableHandle.setAttribute('aria-expanded', isMenuOpen ? 'true' : 'false');
    if (controls) {
      this.tableHandle.setAttribute('aria-controls', controls);
    } else {
      this.tableHandle.removeAttribute('aria-controls');
    }
    this.tableHandle.style.left = `${left}px`;
    this.tableHandle.style.top = `${top}px`;
    this.tableHandle.style.width = `${HANDLE_CROSS_AXIS_SIZE}px`;
    this.tableHandle.style.height = `${HANDLE_CROSS_AXIS_SIZE}px`;
    this.tableHandle.classList.toggle('is-hovered', isHovered);
    this.tableHandle.classList.toggle('is-selected', isSelected);
    this.tableHandle.classList.toggle('is-menu-open', isMenuOpen);
  }

  private syncSelectionContextState(
    interaction: HtmlTableInteractionState,
    tablePos: number,
    geometry: ReturnType<typeof measureHtmlTableGeometry>,
    tableLeft: number,
    tableTop: number,
    selectionInfo: ReturnType<typeof getTableSelectionInfo> | null,
  ): void {
    const scope = getHtmlTableSelectionScope(interaction, tablePos, selectionInfo);
    const anchor = getHtmlTableSelectionAnchor(interaction, tablePos, geometry, tableLeft, tableTop, selectionInfo);

    this.root.dataset.selectionScope = scope ?? 'none';

    if (!anchor) {
      this.root.style.removeProperty('--pmht-selection-anchor-left');
      this.root.style.removeProperty('--pmht-selection-anchor-top');
      return;
    }

    this.root.style.setProperty('--pmht-selection-anchor-left', `${anchor.left}px`);
    this.root.style.setProperty('--pmht-selection-anchor-top', `${anchor.top}px`);
  }

  private syncContextTriggerButton(
    trigger: HtmlTableContextTriggerButtonState,
    hostRect: DOMRect,
  ): void {
    const renderState = getHtmlTableContextTriggerRenderState(trigger);
    const hasDedicatedScopeHandle =
      renderState.scope === 'table' ||
      renderState.scope === 'row' ||
      renderState.scope === 'column' ||
      renderState.scope === 'cell';
    const visible = renderState.visible && !hasDedicatedScopeHandle;
    const controls = getHtmlTableContextMenuAriaControls(this.contextMenuId, renderState.expanded);

    this.contextTriggerButton.hidden = !visible;
    this.contextTriggerButton.tabIndex = visible ? 0 : -1;
    this.contextTriggerButton.dataset.scope = renderState.scope ?? '';
    this.contextTriggerButton.dataset.primaryAction = renderState.primaryActionId ?? '';
    this.contextTriggerButton.setAttribute('aria-expanded', renderState.expanded ? 'true' : 'false');
    if (controls) {
      this.contextTriggerButton.setAttribute('aria-controls', controls);
    } else {
      this.contextTriggerButton.removeAttribute('aria-controls');
    }
    this.contextTriggerButton.textContent = renderState.label ? '...' : '';
    this.contextTriggerButton.setAttribute('aria-label', renderState.label ?? 'Context actions');
    this.contextTriggerButton.title = renderState.title ?? renderState.label ?? '';
    this.root.dataset.contextMenuOpen = renderState.expanded ? 'true' : 'false';

    if (!visible || renderState.left === null || renderState.top === null) {
      this.contextTriggerButton.style.removeProperty('left');
      this.contextTriggerButton.style.removeProperty('top');
      return;
    }

    this.contextTriggerButton.style.left = `${Math.max(MIN_HANDLE_INSET, renderState.left - hostRect.left)}px`;
    this.contextTriggerButton.style.top = `${Math.max(MIN_HANDLE_INSET, renderState.top - hostRect.top)}px`;
  }

  private syncContextMenu(
    menu: HtmlTableContextMenuState,
    hostRect: DOMRect,
  ): void {
    const renderState = getHtmlTableContextMenuRenderState(menu);
    const focusedActionId = this.getFocusedContextMenuActionId();
    const headerState = getHtmlTableContextMenuHeaderState(menu);
    const accessibleState = getHtmlTableContextMenuAccessibleState(this.contextMenuId, headerState);

    this.contextMenu.hidden = !renderState.visible;
    this.contextMenu.dataset.scope = renderState.scope ?? '';
    this.contextMenu.dataset.primaryAction = renderState.primaryActionId ?? '';
    if (accessibleState.labelledBy) {
      this.contextMenu.setAttribute('aria-labelledby', accessibleState.labelledBy);
    } else {
      this.contextMenu.removeAttribute('aria-labelledby');
    }
    if (accessibleState.describedBy) {
      this.contextMenu.setAttribute('aria-describedby', accessibleState.describedBy);
    } else {
      this.contextMenu.removeAttribute('aria-describedby');
    }

    if (!renderState.visible || renderState.left === null || renderState.top === null) {
      this.resetContextMenuTypeahead();
      this.restoreContextMenuFocusIfNeeded();
      this.contextMenu.replaceChildren();
      this.contextMenu.dataset.placement = '';
      this.contextMenu.style.removeProperty('left');
      this.contextMenu.style.removeProperty('top');
      this.lastContextMenuOpen = false;
      return;
    }

    this.contextMenu.replaceChildren(...this.buildContextMenuGroups(menu));
    const menuWidth = this.contextMenu.offsetWidth;
    const menuHeight = this.contextMenu.offsetHeight;
    const viewportLeft = MIN_HANDLE_INSET - hostRect.left;
    const viewportTop = MIN_HANDLE_INSET - hostRect.top;
    const viewportRight = this.root.ownerDocument.defaultView!.innerWidth - hostRect.left - MIN_HANDLE_INSET;
    const viewportBottom = this.root.ownerDocument.defaultView!.innerHeight - hostRect.top - MIN_HANDLE_INSET;
    const availableHeight = Math.max(160, viewportBottom - viewportTop);
    const position = getHtmlTableContextMenuPosition(
      renderState.scope ?? 'table',
      renderState.left - hostRect.left,
      renderState.top - hostRect.top,
      menuWidth,
      menuHeight,
      viewportLeft,
      viewportTop,
      viewportRight,
      viewportBottom,
    );

    this.contextMenu.style.left = `${position.left}px`;
    this.contextMenu.style.top = `${position.top}px`;
    this.contextMenu.style.maxHeight = `${availableHeight}px`;
    this.contextMenu.dataset.placement = position.placement;
    this.contextMenu.style.transformOrigin = getHtmlTableContextMenuTransformOrigin(position.placement);
    this.restoreContextMenuFocus(menu, focusedActionId);
  }

  private toggleContextMenuFromControl(
    interaction: HtmlTableInteractionState,
    focusTarget: HTMLButtonElement | null,
  ): void {
    const nextOpen = !interaction.contextMenuOpen;
    this.contextMenuFocusTarget = focusTarget;
    this.restoreContextMenuFocusOnClose = !nextOpen;
    this.contextMenuContext = nextOpen ? this.captureContextMenuContext(interaction) : null;
    this.view.dispatch(
      this.view.state.tr.setMeta(htmlTableInteractionPluginKey, {
        contextMenuOpen: nextOpen,
      }),
    );
  }

  private syncCellSelectionHandle(
    menu: HtmlTableContextMenuState,
    tablePos: number,
    geometry: ReturnType<typeof measureHtmlTableGeometry>,
    tableLeft: number,
    tableTop: number,
    selectionInfo: ReturnType<typeof getTableSelectionInfo> | null,
  ): void {
    const interaction = getHtmlTableInteractionState(this.view.state);
    const renderState = getHtmlTableCellContextTriggerRenderState(menu);
    const controls = getHtmlTableContextMenuAriaControls(this.contextMenuId, renderState.expanded);
    if (interaction.tableSelected) {
      this.cellSelectionHandle.hidden = true;
      this.cellSelectionHandle.tabIndex = -1;
      return;
    }

    if (!selectionInfo || selectionInfo.tablePos !== tablePos) {
      this.cellSelectionHandle.hidden = true;
      this.cellSelectionHandle.tabIndex = -1;
      return;
    }

    if (Boolean(interaction.selectedAxisExplicit) && interaction.selectedAxis.kind) {
      this.cellSelectionHandle.hidden = true;
      this.cellSelectionHandle.tabIndex = -1;
      return;
    }

    const leftColumn = geometry.columns[selectionInfo.left];
    const rightColumn = geometry.columns[selectionInfo.right];
    const topRow = geometry.rows[selectionInfo.top];
    const bottomRow = geometry.rows[selectionInfo.bottom];
    if (!leftColumn || !rightColumn || !topRow || !bottomRow) {
      this.cellSelectionHandle.hidden = true;
      this.cellSelectionHandle.tabIndex = -1;
      return;
    }

    const selectionTop = tableTop + topRow.top;
    const selectionBottom = tableTop + bottomRow.top + bottomRow.height;
    const selectionRight = tableLeft + rightColumn.left + rightColumn.width;

    this.cellSelectionHandle.hidden = false;
    this.cellSelectionHandle.tabIndex = renderState.visible ? 0 : -1;
    this.cellSelectionHandle.style.left = `${selectionRight - 1}px`;
    this.cellSelectionHandle.style.top = `${selectionTop + (selectionBottom - selectionTop) / 2}px`;
    this.cellSelectionHandle.dataset.primaryAction = renderState.primaryActionId ?? '';
    this.cellSelectionHandle.setAttribute('aria-haspopup', 'menu');
    this.cellSelectionHandle.setAttribute('aria-expanded', renderState.expanded ? 'true' : 'false');
    if (controls) {
      this.cellSelectionHandle.setAttribute('aria-controls', controls);
    } else {
      this.cellSelectionHandle.removeAttribute('aria-controls');
    }
    this.cellSelectionHandle.setAttribute('aria-label', renderState.label ?? 'Cell actions');
    this.cellSelectionHandle.title = renderState.title ?? renderState.label ?? 'Cell actions';
    this.cellSelectionHandle.classList.toggle('is-menu-open', renderState.expanded);
  }

  private createHandle(axis: 'row' | 'column'): HTMLButtonElement {
    const handle = this.root.ownerDocument.createElement('button');
    handle.type = 'button';
    handle.className = `html-table-overlay__handle html-table-overlay__handle--${axis}`;
    handle.dataset.axis = axis;
    handle.dataset.testid = axis === 'row' ? 'pmht-row-handle' : 'pmht-column-handle';
    handle.tabIndex = -1;
    handle.addEventListener('mousedown', (event) => this.handleMouseDown(event));
    handle.addEventListener('click', (event) => this.handleHandleClick(event));
    return handle;
  }

  private createTableHandle(): HTMLButtonElement {
    const handle = this.root.ownerDocument.createElement('button');
    handle.type = 'button';
    handle.className = 'html-table-overlay__handle html-table-overlay__handle--table';
    handle.dataset.testid = 'pmht-table-handle';
    handle.tabIndex = -1;
    handle.hidden = true;
    handle.setAttribute('aria-label', 'Select table');
    handle.title = 'Select table';
    handle.setAttribute('aria-haspopup', 'menu');
    handle.addEventListener('mousedown', (event) => this.handleTableSelectionMouseDown(event));
    handle.addEventListener('click', (event) => this.handleTableSelectionClick(event));
    return handle;
  }

  private createContextTriggerButton(): HTMLButtonElement {
    const button = this.root.ownerDocument.createElement('button');
    button.type = 'button';
    button.className = 'html-table-overlay__context-trigger';
    button.dataset.testid = 'pmht-context-trigger';
    button.tabIndex = -1;
    button.hidden = true;
    button.setAttribute('aria-label', 'Context actions');
    button.setAttribute('aria-haspopup', 'menu');
    button.addEventListener('mousedown', (event) => this.handleContextTriggerMouseDown(event));
    button.addEventListener('click', (event) => this.handleContextTriggerClick(event));
    return button;
  }

  private createContextMenu(): HTMLDivElement {
    const menu = this.root.ownerDocument.createElement('div');
    menu.className = 'html-table-overlay__context-menu';
    menu.id = this.contextMenuId;
    menu.dataset.testid = 'pmht-context-menu';
    menu.hidden = true;
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-orientation', 'vertical');
    menu.addEventListener('mousedown', (event) => this.handleContextMenuMouseDown(event));
    menu.addEventListener('click', (event) => this.handleContextMenuClick(event));
    menu.addEventListener('keydown', (event) => this.handleContextMenuKeyDown(event));
    return menu;
  }

  private createResizeHandle(): HTMLButtonElement {
    const handle = this.root.ownerDocument.createElement('button');
    handle.type = 'button';
    handle.className = 'html-table-overlay__resize-handle';
    handle.dataset.testid = 'pmht-resize-handle';
    handle.tabIndex = -1;
    handle.addEventListener('mousedown', (event) => this.handleResizeStart(event));
    return handle;
  }

  private createExtendButton(axis: 'row' | 'column'): HTMLButtonElement {
    const button = this.root.ownerDocument.createElement('button');
    button.type = 'button';
    button.className = `html-table-overlay__extend-button html-table-overlay__extend-button--${axis}`;
    button.dataset.axis = axis;
    button.dataset.testid = axis === 'row' ? 'pmht-extend-row' : 'pmht-extend-column';
    button.tabIndex = -1;
    button.textContent = '+';
    button.setAttribute('aria-label', axis === 'row' ? 'Add row after' : 'Add column after');
    button.title = axis === 'row' ? 'Add row after' : 'Add column after';
    button.addEventListener('mousedown', (event) => this.handleExtendButtonMouseDown(event));
    button.addEventListener('click', (event) => this.handleExtendButtonClick(event));
    return button;
  }

  private handleMouseDown(event: MouseEvent): void {
    const handle = event.currentTarget as HTMLButtonElement | null;
    const axis = handle?.dataset.axis;
    const index = Number(handle?.dataset.index);
    const interaction = getHtmlTableInteractionState(this.view.state);
    const activeTable = interaction.activeTable;
    if (!handle || !activeTable || (axis !== 'row' && axis !== 'column') || !Number.isInteger(index)) {
      return;
    }

    const table = this.view.state.doc.nodeAt(activeTable.tablePos);
    if (!table || table.type.name !== 'htmlTable') {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.suppressPointerClick();
    this.activateAxisHandle(axis, index, activeTable.tablePos, table, interaction, handle);
  }

  private handleHandleClick(event: MouseEvent): void {
    if (!isHtmlTableKeyboardClick(event)) {
      return;
    }

    const handle = event.currentTarget as HTMLButtonElement | null;
    const axis = handle?.dataset.axis;
    const index = Number(handle?.dataset.index);
    const interaction = getHtmlTableInteractionState(this.view.state);
    const activeTable = interaction.activeTable;
    if (!handle || !activeTable || (axis !== 'row' && axis !== 'column') || !Number.isInteger(index)) {
      return;
    }

    const table = this.view.state.doc.nodeAt(activeTable.tablePos);
    if (!table || table.type.name !== 'htmlTable') {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.activateAxisHandle(axis, index, activeTable.tablePos, table, interaction, handle);
  }

  private activateAxisHandle(
    axis: 'row' | 'column',
    index: number,
    tablePos: number,
    table: NonNullable<ReturnType<EditorView['state']['doc']['nodeAt']>>,
    interaction: HtmlTableInteractionState,
    handle: HTMLButtonElement | null,
  ): void {
    if (shouldToggleHtmlTableContextMenuFromAxisHandle(interaction, axis, index, tablePos)) {
      this.toggleContextMenuFromControl(interaction, handle);
      return;
    }

    const transaction =
      axis === 'row'
        ? createRowSelectionTransaction(this.view.state, tablePos, table, index)?.setMeta(
            htmlTableInteractionPluginKey,
            {
              selectedAxis: {
                kind: 'row',
                index,
                tablePos,
              },
              selectedAxisExplicit: true,
            },
          )
        : createColumnSelectionTransaction(this.view.state, tablePos, table, index)?.setMeta(
            htmlTableInteractionPluginKey,
            {
              selectedAxis: {
                kind: 'column',
                index,
                tablePos,
              },
              selectedAxisExplicit: true,
            },
          );

    if (!transaction) return;

    this.view.focus();
    this.view.dispatch(transaction);
  }

  private handleTableSelectionMouseDown(event: MouseEvent): void {
    if (!this.options.allowTableNodeSelection) {
      return;
    }

    const interaction = getHtmlTableInteractionState(this.view.state);
    const activeTable = interaction.activeTable;
    if (!activeTable) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.suppressPointerClick();
    this.activateTableHandle(activeTable.tablePos, interaction, this.tableHandle);
  }

  private handleTableSelectionClick(event: MouseEvent): void {
    if (!isHtmlTableKeyboardClick(event) || !this.options.allowTableNodeSelection) {
      return;
    }

    const interaction = getHtmlTableInteractionState(this.view.state);
    const activeTable = interaction.activeTable;
    if (!activeTable) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.activateTableHandle(activeTable.tablePos, interaction, this.tableHandle);
  }

  private activateTableHandle(
    tablePos: number,
    interaction: HtmlTableInteractionState,
    handle: HTMLButtonElement | null,
  ): void {
    if (shouldToggleHtmlTableContextMenuFromTableHandle(interaction, tablePos)) {
      this.toggleContextMenuFromControl(interaction, handle);
      return;
    }

    const transaction = this.view.state.tr.setSelection(
      NodeSelection.create(this.view.state.doc, tablePos),
    );
    this.view.focus();
    this.view.dispatch(transaction);
  }

  private handleContextTriggerMouseDown(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.suppressPointerClick();
    this.toggleContextTriggerMenu();
  }

  private handleContextTriggerClick(event: MouseEvent): void {
    if (!isHtmlTableKeyboardClick(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.toggleContextTriggerMenu();
  }

  private toggleContextTriggerMenu(): void {
    const interaction = getHtmlTableInteractionState(this.view.state);
    const trigger = getHtmlTableContextTriggerButtonState(this.view.state, interaction);
    if (!trigger.visible) {
      this.view.focus();
      return;
    }

    this.toggleContextMenuFromControl(interaction, this.contextTriggerButton);
  }

  private handleContextMenuMouseDown(event: MouseEvent): void {
    this.suppressPointerClick();
    this.runContextMenuActionFromEvent(event);
  }

  private handleContextMenuClick(event: MouseEvent): void {
    if (!isHtmlTableKeyboardClick(event)) {
      return;
    }

    this.runContextMenuActionFromEvent(event);
  }

  private runContextMenuActionFromEvent(event: MouseEvent): void {
    const target =
      event.target instanceof HTMLElement ? event.target.closest('button[data-action-id]') as HTMLButtonElement | null : null;
    const actionId = target?.dataset.actionId;
    if (!actionId) {
      event.preventDefault();
      event.stopPropagation();
      this.view.focus();
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const { state, interaction } = this.getContextMenuActionInvocation();
    runHtmlTableContextMenuAction(state, interaction, actionId as HtmlTableContextActionId, (transaction) => {
      this.view.dispatch(transaction);
    });
    this.view.focus();
  }

  private handleContextMenuKeyDown(event: KeyboardEvent): void {
    const enabledButtons = this.getEnabledContextMenuActionButtons();
    if (isHtmlTableContextMenuExitKey(event.key)) {
      this.closeContextMenu(false);
      return;
    }

    if (enabledButtons.length === 0) {
      return;
    }

    if (isHtmlTableContextMenuNavigationKey(event.key)) {
      event.preventDefault();
      event.stopPropagation();

      const currentIndex = enabledButtons.findIndex((button) => button === this.root.ownerDocument.activeElement);
      const nextIndex = getNextHtmlTableContextMenuActionIndex(currentIndex, enabledButtons.length, event.key);
      enabledButtons[nextIndex]?.focus();
      return;
    }

    if (!isHtmlTableContextMenuTypeaheadKey(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const labels = enabledButtons.map((button) => button.textContent?.trim() ?? '');
    const currentIndex = enabledButtons.findIndex((button) => button === this.root.ownerDocument.activeElement);
    const nextCharacter = event.key.toLowerCase();
    const composedQuery = `${this.contextMenuTypeaheadQuery}${nextCharacter}`;
    let nextIndex = getNextHtmlTableContextMenuTypeaheadIndex(labels, currentIndex, composedQuery);
    let nextQuery = composedQuery;

    if (nextIndex < 0) {
      nextIndex = getNextHtmlTableContextMenuTypeaheadIndex(labels, currentIndex, nextCharacter);
      nextQuery = nextCharacter;
    }

    if (nextIndex < 0) {
      return;
    }

    this.contextMenuTypeaheadQuery = nextQuery;
    this.scheduleContextMenuTypeaheadReset();
    enabledButtons[nextIndex]?.focus();
  }

  private handleCellSelectionHandleMouseDown(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.suppressPointerClick();
    this.toggleCellSelectionMenu();
  }

  private handleCellSelectionHandleClick(event: MouseEvent): void {
    if (!isHtmlTableKeyboardClick(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.toggleCellSelectionMenu();
  }

  private toggleCellSelectionMenu(): void {
    const interaction = getHtmlTableInteractionState(this.view.state);
    const menu = getHtmlTableContextMenuState(this.view.state, interaction);
    const renderState = getHtmlTableCellContextTriggerRenderState(menu);
    if (!renderState.visible) {
      this.view.focus();
      return;
    }

    this.toggleContextMenuFromControl(interaction, this.cellSelectionHandle);
  }

  private handleDocumentMouseDown(event: MouseEvent): void {
    const interaction = getHtmlTableInteractionState(this.view.state);
    if (!interaction.contextMenuOpen) {
      return;
    }

    if (!shouldCloseHtmlTableContextMenuForTarget(
      event.target,
      this.contextTriggerButton,
      this.cellSelectionHandle,
      this.contextMenu,
    )) {
      return;
    }

    this.closeContextMenu(false);
  }

  private handleDocumentMouseUpCapture(event: MouseEvent): void {
    if (!this.suppressNextDocumentClick) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
  }

  private handleDocumentClickCapture(event: MouseEvent): void {
    if (!this.suppressNextDocumentClick) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.suppressNextDocumentClick = false;
  }

  private handleDocumentKeyDown(event: KeyboardEvent): void {
    const interaction = getHtmlTableInteractionState(this.view.state);
    if (!interaction.contextMenuOpen || !isHtmlTableContextMenuDismissKey(event.key)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.closeContextMenu(true);
  }

  private handleResizeStart(event: MouseEvent): void {
    const handle = event.currentTarget as HTMLButtonElement | null;
    const index = Number(handle?.dataset.index);
    const interaction = getHtmlTableInteractionState(this.view.state);
    const activeTable = interaction.activeTable;
    const totalColumns = interaction.geometry?.columns.length ?? 0;
    if (
      !handle ||
      !activeTable ||
      !Number.isInteger(index) ||
      !this.options.resizable ||
      !this.isColumnResizable(index, totalColumns)
    ) {
      return;
    }

    const table = this.view.state.doc.nodeAt(activeTable.tablePos);
    if (!table || table.type.name !== 'htmlTable') {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    this.activeResize = {
      tablePos: activeTable.tablePos,
      columnIndex: index,
      startX: event.clientX,
      startWidths: getTableColumnWidths(table, this.options.cellMinWidth),
      currentWidths: getTableColumnWidths(table, this.options.cellMinWidth),
    };

    this.root.ownerDocument.addEventListener('mousemove', this.onDocumentMouseMove);
    this.root.ownerDocument.addEventListener('mouseup', this.onDocumentMouseUp);
    this.dispatchInteractionMeta({
      resizing: {
        tablePos: activeTable.tablePos,
        columnIndex: index,
      },
    });
  }

  private handleExtendButtonMouseDown(event: MouseEvent): void {
    const button = event.currentTarget as HTMLButtonElement | null;
    const axis = button?.dataset.axis;
    const extendTarget = this.getExtendButtonTarget();
    if (!button || !extendTarget || (axis !== 'row' && axis !== 'column')) {
      return;
    }

    const table = this.view.state.doc.nodeAt(extendTarget.tablePos);
    if (!table || table.type.name !== 'htmlTable') {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.suppressPointerClick();
    this.activateExtendButton(axis, extendTarget.tablePos, extendTarget.geometry, table);
  }

  private handleExtendButtonClick(event: MouseEvent): void {
    if (!isHtmlTableKeyboardClick(event)) {
      return;
    }

    const button = event.currentTarget as HTMLButtonElement | null;
    const axis = button?.dataset.axis;
    const extendTarget = this.getExtendButtonTarget();
    if (!button || !extendTarget || (axis !== 'row' && axis !== 'column')) {
      return;
    }

    const table = this.view.state.doc.nodeAt(extendTarget.tablePos);
    if (!table || table.type.name !== 'htmlTable') {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.activateExtendButton(axis, extendTarget.tablePos, extendTarget.geometry, table);
  }

  private activateExtendButton(
    axis: 'row' | 'column',
    tablePos: number,
    geometry: ReturnType<typeof measureHtmlTableGeometry>,
    table: NonNullable<ReturnType<EditorView['state']['doc']['nodeAt']>>,
  ): void {
    const targetRowIndex = this.getExtendRowIndex(table);
    const selectionTransaction =
      axis === 'row'
        ? createRowSelectionTransaction(this.view.state, tablePos, table, targetRowIndex)
        : createColumnSelectionTransaction(
            this.view.state,
            tablePos,
            table,
            Math.max(0, geometry.columns.length - 1),
          )?.setMeta(htmlTableInteractionPluginKey, {
            selectedAxis: {
              kind: 'column',
              index: Math.max(0, geometry.columns.length - 1),
              tablePos,
            },
            selectedAxisExplicit: true,
          });
    if (!selectionTransaction) return;

    const commandState = this.view.state.apply(selectionTransaction);
    let commandTransaction: Transaction | undefined;
    const command =
      axis === 'row'
        ? addCoreRowAfter()
        : addCoreColumnAfter();

    const applied = command(commandState, (transaction) => {
      commandTransaction = transaction;
    });
    if (!applied || !commandTransaction) return;

    this.view.focus();
    this.view.dispatch(commandTransaction);
  }

  private handleResizeMove(event: MouseEvent): void {
    const activeResize = this.activeResize;
    if (!activeResize) return;

    const context = getRenderedHtmlTableContext(this.view, activeResize.tablePos);
    if (!context) return;

    const nextWidths = activeResize.startWidths.slice();
    const delta = event.clientX - activeResize.startX;
    nextWidths[activeResize.columnIndex] = Math.max(
      this.options.cellMinWidth,
      (nextWidths[activeResize.columnIndex] ?? this.options.cellMinWidth) + delta,
    );

    activeResize.currentWidths = nextWidths;
    this.applyPreviewWidths(context.dom, nextWidths);
    const geometry = measureHtmlTableGeometry(context.dom);
    this.dispatchInteractionMeta({
      geometry,
      resizing: {
        tablePos: activeResize.tablePos,
        columnIndex: activeResize.columnIndex,
      },
    });
  }

  private finishResize(): void {
    const activeResize = this.activeResize;
    if (!activeResize) return;

    const context = getRenderedHtmlTableContext(this.view, activeResize.tablePos);
    const table = this.view.state.doc.nodeAt(activeResize.tablePos);
    if (!context || !table || table.type.name !== 'htmlTable') {
      this.clearActiveResize(true, true);
      return;
    }

    const resizedGeometry = measureHtmlTableGeometry(context.dom);
    const widths = activeResize.currentWidths.map((width) => Math.max(this.options.cellMinWidth, Math.round(width)));
    const transaction = createColumnResizeTransaction(this.view.state, activeResize.tablePos, table, widths)
      .setMeta(htmlTableInteractionPluginKey, {
        geometry: resizedGeometry,
        resizing: null,
      });

    this.clearActiveResize(false, false);
    this.view.focus();
    this.view.dispatch(transaction);
  }

  private clearActiveResize(restoreWidths: boolean, clearInteractionState = false): void {
    if (restoreWidths && this.activeResize) {
      const context = getRenderedHtmlTableContext(this.view, this.activeResize.tablePos);
      if (context) {
        this.applyPreviewWidths(context.dom, this.activeResize.startWidths);
      }
    }

    this.root.ownerDocument.removeEventListener('mousemove', this.onDocumentMouseMove);
    this.root.ownerDocument.removeEventListener('mouseup', this.onDocumentMouseUp);
    this.activeResize = null;
    this.root.classList.remove('html-table-overlay--resizing');

    if (clearInteractionState) {
      this.dispatchInteractionMeta({
        resizing: null,
      });
    }
  }

  private applyPreviewWidths(table: HTMLTableElement, widths: number[]): void {
    const totalWidth = widths.reduce((sum, width) => sum + width, 0);
    table.style.tableLayout = 'fixed';
    table.style.minWidth = `${Math.max(this.options.cellMinWidth, totalWidth)}px`;
    table.style.width = `${totalWidth}px`;

    const colElements = Array.from(table.querySelectorAll('col'));
    colElements.forEach((col, index) => {
      const width = widths[index];
      if (!width) return;

      col.setAttribute('width', String(width));
      (col as HTMLElement).style.width = `${width}px`;
    });
  }

  private syncExtendButtons(
    tableLeft: number,
    tableTop: number,
    geometry: ReturnType<typeof measureHtmlTableGeometry>,
  ): void {
    this.addRowButton.hidden = false;
    this.addRowButton.tabIndex = 0;
    this.addRowButton.style.left = `${tableLeft + geometry.tableRect.width / 2}px`;
    this.addRowButton.style.top = `${tableTop + geometry.tableRect.height + EXTEND_BUTTON_OFFSET}px`;

    this.addColumnButton.hidden = false;
    this.addColumnButton.tabIndex = 0;
    this.addColumnButton.style.left = `${tableLeft + geometry.tableRect.width + EXTEND_BUTTON_OFFSET}px`;
    this.addColumnButton.style.top = `${tableTop + geometry.tableRect.height / 2}px`;
  }

  private dispatchInteractionMeta(meta: {
    geometry?: ReturnType<typeof measureHtmlTableGeometry> | null;
    resizing?: { tablePos: number; columnIndex: number } | null;
  }): void {
    this.view.dispatch(this.view.state.tr.setMeta(htmlTableInteractionPluginKey, meta));
  }

  private attach(wrapper: HTMLElement): void {
    if (this.currentHost === wrapper && this.root.parentElement === wrapper) {
      return;
    }

    this.detach();
    if (this.root.ownerDocument.defaultView?.getComputedStyle(wrapper).position === 'static') {
      wrapper.style.position = 'relative';
      this.currentHostPositionManaged = true;
    }
    wrapper.append(this.root);
    this.currentHost = wrapper;
  }

  private detach(): void {
    this.root.hidden = true;
    this.root.remove();
    this.renderedTablePos = null;
    this.renderedGeometry = null;
    if (this.currentHost && this.currentHostPositionManaged) {
      this.currentHost.style.removeProperty('position');
    }
    this.currentHost = null;
    this.currentHostPositionManaged = false;
  }

  private isColumnResizable(index: number, totalColumns: number): boolean {
    if (!this.options.resizable) return false;
    if (index < 0 || index >= totalColumns) return false;
    if (this.options.lastColumnResizable) return true;
    return index < totalColumns - 1;
  }

  private buildContextMenuGroups(menu: HtmlTableContextMenuState): HTMLElement[] {
    const headerState = getHtmlTableContextMenuHeaderState(menu);
    const elements: HTMLElement[] = [];

    if (headerState.label) {
      const header = this.root.ownerDocument.createElement('div');
      header.className = 'html-table-overlay__context-menu-header';

      const title = this.root.ownerDocument.createElement('div');
      title.className = 'html-table-overlay__context-menu-header-title';
      title.id = `${this.contextMenuId}-title`;
      title.textContent = headerState.label;
      header.append(title);

      if (headerState.detail) {
        const detail = this.root.ownerDocument.createElement('div');
        detail.className = 'html-table-overlay__context-menu-header-detail';
        detail.id = `${this.contextMenuId}-detail`;
        detail.textContent = headerState.detail;
        header.append(detail);
      }

      elements.push(header);
    }

    return elements.concat(menu.groups.map((group) => {
      const groupElement = this.root.ownerDocument.createElement('div');
      groupElement.className = 'html-table-overlay__context-menu-group';
      groupElement.dataset.group = group.id;
      groupElement.setAttribute('role', 'group');
      const accessibleGroupState = getHtmlTableContextMenuGroupAccessibleState(this.contextMenuId, group.id);
      groupElement.setAttribute('aria-labelledby', accessibleGroupState.labelId);

      const label = this.root.ownerDocument.createElement('div');
      label.className = 'html-table-overlay__context-menu-group-label';
      label.id = accessibleGroupState.labelId;
      label.textContent = group.label;
      groupElement.append(label);

      for (const action of group.actions) {
        const menuItemState = getHtmlTableContextActionMenuItemState(action);
        const shortcutState = getHtmlTableContextActionShortcutState(action);
        const renderState = getHtmlTableContextMenuActionRenderState(
          action,
          menuItemState,
          menu.primaryAction?.id === action.id,
        );
        const button = this.root.ownerDocument.createElement('button');
        button.type = 'button';
        button.className = 'html-table-overlay__context-menu-action';
        button.dataset.actionId = action.id;
        button.dataset.testid = 'pmht-context-menu-action';
        button.dataset.role = renderState.role;
        button.dataset.checked = renderState.checked ?? '';
        button.disabled = !action.enabled;
        button.textContent = action.label;
        button.setAttribute('role', renderState.role);
        if (shortcutState.ariaKeyshortcuts) {
          button.setAttribute('aria-keyshortcuts', shortcutState.ariaKeyshortcuts);
        } else {
          button.removeAttribute('aria-keyshortcuts');
        }
        if (renderState.checked === null) {
          button.removeAttribute('aria-checked');
        } else {
          button.setAttribute('aria-checked', renderState.checked);
        }
        button.setAttribute('aria-current', renderState.current);
        button.classList.toggle('is-active', renderState.active);
        button.classList.toggle('is-destructive', renderState.destructive);
        button.classList.toggle('is-primary', renderState.primary);
        groupElement.append(button);
      }

      return groupElement;
    }));
  }

  private getFocusedContextMenuActionId(): string | null {
    const activeElement = this.root.ownerDocument.activeElement;
    return activeElement instanceof HTMLButtonElement && this.contextMenu.contains(activeElement)
      ? activeElement.dataset.actionId ?? null
      : null;
  }

  private getEnabledContextMenuActionButtons(): HTMLButtonElement[] {
    return Array.from(this.contextMenu.querySelectorAll<HTMLButtonElement>('button[data-action-id]')).filter(
      (button) => !button.disabled,
    );
  }

  private scheduleContextMenuTypeaheadReset(): void {
    if (this.contextMenuTypeaheadResetTimer !== null) {
      clearTimeout(this.contextMenuTypeaheadResetTimer);
    }

    this.contextMenuTypeaheadResetTimer = setTimeout(() => {
      this.contextMenuTypeaheadQuery = '';
      this.contextMenuTypeaheadResetTimer = null;
    }, CONTEXT_MENU_TYPEAHEAD_RESET_MS);
  }

  private resetContextMenuTypeahead(): void {
    this.contextMenuTypeaheadQuery = '';
    if (this.contextMenuTypeaheadResetTimer !== null) {
      clearTimeout(this.contextMenuTypeaheadResetTimer);
      this.contextMenuTypeaheadResetTimer = null;
    }
  }

  private restoreContextMenuFocus(menu: HtmlTableContextMenuState, focusedActionId: string | null): void {
    const enabledButtons = this.getEnabledContextMenuActionButtons();
    if (enabledButtons.length === 0) {
      this.lastContextMenuOpen = menu.open;
      return;
    }

    if (focusedActionId) {
      const focusedButton = enabledButtons.find((button) => button.dataset.actionId === focusedActionId);
      if (focusedButton) {
        focusedButton.focus();
        this.lastContextMenuOpen = menu.open;
        return;
      }
    }

    if (menu.open && !this.lastContextMenuOpen) {
      const primaryActionId = menu.primaryAction?.id ?? null;
      const primaryButton =
        (primaryActionId
          ? enabledButtons.find((button) => button.dataset.actionId === primaryActionId)
          : null) ?? enabledButtons[0];
      primaryButton?.focus();
    }

    this.lastContextMenuOpen = menu.open;
  }

  private restoreContextMenuFocusIfNeeded(): void {
    if (!this.lastContextMenuOpen || !this.restoreContextMenuFocusOnClose) {
      this.restoreContextMenuFocusOnClose = false;
      return;
    }

    if (canRestoreHtmlTableContextMenuFocus(this.contextMenuFocusTarget)) {
      this.contextMenuFocusTarget.focus();
    }

    this.restoreContextMenuFocusOnClose = false;
  }

  private closeContextMenu(restoreFocus: boolean): void {
    const interaction = getHtmlTableInteractionState(this.view.state);
    if (!interaction.contextMenuOpen) {
      return;
    }

    this.restoreContextMenuFocusOnClose = restoreFocus;
    this.contextMenuContext = null;
    this.view.dispatch(
      this.view.state.tr.setMeta(htmlTableInteractionPluginKey, {
        contextMenuOpen: false,
      }),
    );
  }

  private getOverlayHost(): HTMLElement {
    return (this.view.dom.parentElement ?? this.view.dom) as HTMLElement;
  }

  private suppressPointerClick(): void {
    this.suppressNextDocumentClick = true;
  }

  private captureContextMenuContext(interaction: HtmlTableInteractionState): HtmlTableMenuContext | null {
    const tablePos = interaction.activeTable?.tablePos ?? null;
    if (tablePos === null) {
      return null;
    }

    const selectionInfo = getTableSelectionInfo(this.view.state.doc, this.view.state.selection);
    const scope = getHtmlTableSelectionScope(interaction, tablePos, selectionInfo);
    if (scope === 'table') {
      return { scope, tablePos };
    }

    if (scope === 'row' && interaction.selectedAxis.index !== null) {
      return {
        scope,
        tablePos,
        rowIndex: interaction.selectedAxis.index,
      };
    }

    if (scope === 'column' && interaction.selectedAxis.index !== null) {
      return {
        scope,
        tablePos,
        columnIndex: interaction.selectedAxis.index,
      };
    }

    if (scope === 'cell' && selectionInfo) {
      const anchorCellPos = selectionInfo.cellPositions.get(selectionInfo.anchorCell);
      const headCellPos = selectionInfo.cellPositions.get(selectionInfo.headCell);
      if (anchorCellPos === undefined || headCellPos === undefined) {
        return null;
      }

      return {
        scope,
        tablePos,
        anchorCellPos,
        headCellPos,
      };
    }

    return null;
  }

  private getContextMenuActionInvocation(): {
    state: EditorView['state'];
    interaction: HtmlTableInteractionState;
  } {
    const snapshot = this.contextMenuContext;
    if (!snapshot) {
      return {
        state: this.view.state,
        interaction: getHtmlTableInteractionState(this.view.state),
      };
    }

    const table = this.view.state.doc.nodeAt(snapshot.tablePos);
    if (!table || table.type.name !== 'htmlTable') {
      return {
        state: this.view.state,
        interaction: getHtmlTableInteractionState(this.view.state),
      };
    }

    const transaction =
      snapshot.scope === 'table'
        ? this.view.state.tr.setSelection(NodeSelection.create(this.view.state.doc, snapshot.tablePos))
        : snapshot.scope === 'row'
          ? createRowSelectionTransaction(this.view.state, snapshot.tablePos, table, snapshot.rowIndex)?.setMeta(
              htmlTableInteractionPluginKey,
              {
                selectedAxis: {
                  kind: 'row',
                  index: snapshot.rowIndex,
                  tablePos: snapshot.tablePos,
                },
                selectedAxisExplicit: true,
              },
            )
          : snapshot.scope === 'column'
            ? createColumnSelectionTransaction(this.view.state, snapshot.tablePos, table, snapshot.columnIndex)?.setMeta(
                htmlTableInteractionPluginKey,
                {
                  selectedAxis: {
                    kind: 'column',
                    index: snapshot.columnIndex,
                    tablePos: snapshot.tablePos,
                  },
                  selectedAxisExplicit: true,
                },
              )
            : this.view.state.tr.setSelection(
                CellSelection.create(this.view.state.doc, snapshot.anchorCellPos, snapshot.headCellPos),
              );

    if (!transaction) {
      return {
        state: this.view.state,
        interaction: getHtmlTableInteractionState(this.view.state),
      };
    }

    const state = this.view.state.apply(transaction);
    return {
      state,
      interaction: getHtmlTableInteractionState(state),
    };
  }

  private getExtendButtonTarget(): {
    tablePos: number;
    geometry: ReturnType<typeof measureHtmlTableGeometry>;
  } | null {
    const interaction = getHtmlTableInteractionState(this.view.state);
    if (interaction.activeTable && interaction.geometry) {
      return {
        tablePos: interaction.activeTable.tablePos,
        geometry: interaction.geometry,
      };
    }

    if (this.renderedTablePos !== null && this.renderedGeometry) {
      return {
        tablePos: this.renderedTablePos,
        geometry: this.renderedGeometry,
      };
    }

    return null;
  }

  private getExtendRowIndex(table: NonNullable<ReturnType<EditorView['state']['doc']['nodeAt']>>): number {
    const grid = createHtmlTableGrid(table);
    const lastBodyRow = [...grid.rows].reverse().find((row) => row.section === 'body');
    return lastBodyRow?.rowIndex ?? Math.max(0, grid.height - 1);
  }
}
