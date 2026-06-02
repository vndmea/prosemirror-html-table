import { NodeSelection, Plugin, PluginKey, type Transaction } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import {
  addColumnAfter as addCoreColumnAfter,
  addRowAfter as addCoreRowAfter,
  createHtmlTableGrid,
} from 'prosemirror-html-table';

import type { HtmlTableTiptapOptions } from './options.js';
import {
  getHtmlTableContextActionMenuItemState,
  getHtmlTableContextActionShortcutState,
} from './html-table-actions.js';
import {
  getHtmlTableContextMenuState,
  type HtmlTableContextMenuState,
  getHtmlTableContextTriggerButtonState,
  type HtmlTableContextTriggerButtonState,
} from './html-table-context-menu.js';
import {
  getHtmlTableInteractionState,
  type HtmlTableInteractionState,
  htmlTableInteractionPluginKey,
} from './html-table-interaction.js';
import {
  HtmlTableMenuController,
  canRestoreHtmlTableContextMenuFocus,
  getHtmlTableCellContextTriggerRenderState,
  getHtmlTableContextMenuAccessibleState,
  getHtmlTableContextMenuActionRenderState,
  getHtmlTableContextMenuAriaControls,
  getHtmlTableContextMenuGroupAccessibleState,
  getHtmlTableContextMenuHeaderState,
  getHtmlTableContextMenuRenderState,
  getHtmlTableContextTriggerRenderState,
  getHtmlTableOverlayHandleText,
  getNextHtmlTableContextMenuActionIndex,
  getNextHtmlTableContextMenuTypeaheadIndex,
  isHtmlTableContextMenuDismissKey,
  isHtmlTableContextMenuExitKey,
  isHtmlTableContextMenuNavigationKey,
  isHtmlTableContextMenuTypeaheadKey,
  isHtmlTableKeyboardClick,
  shouldCloseHtmlTableContextMenuForTarget,
  type HtmlTableCellContextTriggerRenderState,
  type HtmlTableContextMenuAccessibleState,
  type HtmlTableContextMenuActionRenderState,
  type HtmlTableContextMenuGroupAccessibleState,
  type HtmlTableContextMenuHeaderState,
  type HtmlTableContextMenuRenderState,
  type HtmlTableContextTriggerRenderState,
  type HtmlTableOverlayHandleText,
} from './html-table-menu-controller.js';
import {
  getHtmlTableContextMenuPosition,
  getHtmlTableContextMenuTransformOrigin,
  getHtmlTableOverlayPositionState,
  getHtmlTableSelectionAnchor,
  getHtmlTableSelectionScope,
  getHtmlTableVisibleOverlayRect,
  getHtmlTableVisibleSelectionRect,
  type HtmlTableContextMenuPlacement,
  type HtmlTableContextMenuPosition,
  type HtmlTableSelectionAnchor,
  type HtmlTableSelectionScope,
} from './html-table-overlay-geometry.js';
import { getHtmlTableOverlayMount, HtmlTableOverlayHost } from './html-table-overlay-host.js';
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
let htmlTableContextMenuIdCounter = 0;

export const htmlTableHandlePluginKey = new PluginKey('html-table-handle-overlay');

export type {
  HtmlTableCellContextTriggerRenderState,
  HtmlTableContextMenuAccessibleState,
  HtmlTableContextMenuActionRenderState,
  HtmlTableContextMenuGroupAccessibleState,
  HtmlTableContextMenuHeaderState,
  HtmlTableContextMenuPlacement,
  HtmlTableContextMenuPosition,
  HtmlTableContextMenuRenderState,
  HtmlTableContextTriggerRenderState,
  HtmlTableOverlayHandleText,
  HtmlTableSelectionAnchor,
  HtmlTableSelectionScope,
};
export {
  canRestoreHtmlTableContextMenuFocus,
  getHtmlTableCellContextTriggerRenderState,
  getHtmlTableContextMenuAccessibleState,
  getHtmlTableContextMenuActionRenderState,
  getHtmlTableContextMenuAriaControls,
  getHtmlTableContextMenuGroupAccessibleState,
  getHtmlTableContextMenuHeaderState,
  getHtmlTableContextMenuPosition,
  getHtmlTableContextMenuRenderState,
  getHtmlTableContextMenuTransformOrigin,
  getHtmlTableContextTriggerRenderState,
  getHtmlTableOverlayHandleText,
  getNextHtmlTableContextMenuActionIndex,
  getNextHtmlTableContextMenuTypeaheadIndex,
  isHtmlTableContextMenuDismissKey,
  isHtmlTableContextMenuExitKey,
  isHtmlTableContextMenuNavigationKey,
  isHtmlTableContextMenuTypeaheadKey,
  isHtmlTableKeyboardClick,
  shouldCloseHtmlTableContextMenuForTarget,
  getHtmlTableSelectionAnchor,
  getHtmlTableSelectionScope,
};

export function isTableHandleVisible(
  allowTableNodeSelection: boolean,
  interaction: HtmlTableInteractionState,
  tablePos: number,
): boolean {
  return (
    allowTableNodeSelection &&
    interaction.activeTable?.tablePos === tablePos &&
    interaction.resizing?.tablePos !== tablePos
  );
}

export function isHtmlTableAxisHandleVisible(
  interaction: HtmlTableInteractionState,
  axis: 'row' | 'column',
  tablePos: number,
  index: number,
): boolean {
  const selected =
    Boolean(interaction.selectedAxisExplicit) &&
    interaction.selectedAxis.kind === axis &&
    interaction.selectedAxis.index === index &&
    interaction.selectedAxis.tablePos === tablePos;
  const hovered = isHtmlTableAxisHandleHovered(interaction, axis, tablePos, index);

  if (interaction.tableSelected || interaction.resizing?.tablePos === tablePos) {
    return false;
  }

  if (interaction.contextMenuOpen && !selected) {
    return false;
  }

  return hovered || selected;
}

export function isHtmlTableResizeHandleVisible(
  interaction: HtmlTableInteractionState,
  tablePos: number,
  columnIndex: number,
  resizable: boolean,
): boolean {
  if (!resizable) {
    return false;
  }

  if (interaction.contextMenuOpen) {
    return false;
  }

  if (interaction.resizing?.tablePos !== tablePos) {
    return true;
  }

  return interaction.resizing.columnIndex === columnIndex;
}

export function isHtmlTableCellHandleVisible(
  interaction: HtmlTableInteractionState,
  tablePos: number,
  selectionInfo: ReturnType<typeof getTableSelectionInfo> | null,
  renderVisible: boolean,
): boolean {
  if (!renderVisible) {
    return false;
  }

  if (interaction.tableSelected || interaction.resizing?.tablePos === tablePos) {
    return false;
  }

  if (!selectionInfo || selectionInfo.tablePos !== tablePos) {
    return false;
  }

  return !(Boolean(interaction.selectedAxisExplicit) && interaction.selectedAxis.kind);
}

export function shouldHideHtmlTableExtendButtons(
  interaction: HtmlTableInteractionState,
): boolean {
  return interaction.contextMenuOpen || Boolean(interaction.resizing);
}

export function isHtmlTableContextMenuExpandedForScope(
  menu: HtmlTableContextMenuState,
  scope: HtmlTableSelectionScope,
): boolean {
  return menu.open && menu.scope === scope;
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
  private readonly overlayHost: HtmlTableOverlayHost;
  private renderedTablePos: number | null = null;
  private renderedGeometry: ReturnType<typeof measureHtmlTableGeometry> | null = null;
  private rowHandles: HTMLButtonElement[] = [];
  private columnHandles: HTMLButtonElement[] = [];
  private resizeHandles: HTMLButtonElement[] = [];
  private readonly menuController: HtmlTableMenuController;
  private activeResize:
    | {
        tablePos: number;
        columnIndex: number;
        startX: number;
        startWidths: number[];
        currentWidths: number[];
      }
    | null = null;
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
    this.overlayHost = new HtmlTableOverlayHost(this.root);
    this.menuController = new HtmlTableMenuController({
      getView: () => this.view,
      root: this.root,
      contextMenuId: this.contextMenuId,
      contextMenu: this.contextMenu,
      contextTriggerButton: this.contextTriggerButton,
      cellSelectionHandle: this.cellSelectionHandle,
      suppressPointerClick: () => this.suppressPointerClick(),
    });
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
    this.menuController.destroy();
    this.root.ownerDocument.removeEventListener('mousedown', this.onDocumentMouseDown);
    this.root.ownerDocument.removeEventListener('mouseup', this.onDocumentMouseUpCapture, true);
    this.root.ownerDocument.removeEventListener('click', this.onDocumentClickCapture, true);
    this.root.ownerDocument.removeEventListener('keydown', this.onDocumentKeyDown);
    this.renderedTablePos = null;
    this.renderedGeometry = null;
    this.overlayHost.detach();
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

    const overlayMount = getHtmlTableOverlayMount(this.view);
    const overlayHost = this.overlayHost.attach(overlayMount);
    const hostRect = overlayHost.getBoundingClientRect();
    const overlayPositionState = getHtmlTableOverlayPositionState(
      geometry,
      hostRect,
      MIN_HANDLE_INSET,
      ROW_HANDLE_OFFSET,
      COLUMN_HANDLE_OFFSET,
    );
    const {
      tableLeft,
      tableTop,
      visibleTableLeft,
      visibleTableTop,
      visibleTableWidth,
      visibleTableHeight,
      rowHandleLeft,
      columnHandleTop,
    } = overlayPositionState;
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
    this.syncExtendButtons(interaction, visibleTableLeft, visibleTableTop, visibleTableWidth, visibleTableHeight);

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
      handle.hidden = !isHtmlTableAxisHandleVisible(interaction, 'row', activeTable.tablePos, row.index);
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
      handle.hidden = !isHtmlTableAxisHandleVisible(interaction, 'column', activeTable.tablePos, column.index);
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
      resizeHandle.style.top = `${visibleTableTop}px`;
      resizeHandle.style.height = `${visibleTableHeight}px`;
      resizeHandle.hidden = !isHtmlTableResizeHandleVisible(
        interaction,
        activeTable.tablePos,
        column.index,
        this.isColumnResizable(column.index, geometry.columns.length),
      );
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
      const rect = getHtmlTableVisibleSelectionRect(
        geometry,
        tableLeft,
        tableTop,
        0,
        Math.max(0, geometry.columns.length - 1),
        selectedRow.index,
        selectedRow.index,
      );
      if (!rect) {
        this.rowSelectionOverlay.hidden = true;
      } else {
        this.rowSelectionOverlay.hidden = false;
        this.rowSelectionOverlay.style.left = `${rect.left}px`;
        this.rowSelectionOverlay.style.top = `${rect.top}px`;
        this.rowSelectionOverlay.style.width = `${rect.width}px`;
        this.rowSelectionOverlay.style.height = `${rect.height}px`;
      }
    } else {
      this.rowSelectionOverlay.hidden = true;
    }

    if (selectedColumn) {
      const rect = getHtmlTableVisibleSelectionRect(
        geometry,
        tableLeft,
        tableTop,
        selectedColumn.index,
        selectedColumn.index,
        0,
        Math.max(0, geometry.rows.length - 1),
      );
      if (!rect) {
        this.columnSelectionOverlay.hidden = true;
      } else {
        this.columnSelectionOverlay.hidden = false;
        this.columnSelectionOverlay.style.left = `${rect.left}px`;
        this.columnSelectionOverlay.style.top = `${rect.top}px`;
        this.columnSelectionOverlay.style.width = `${rect.width}px`;
        this.columnSelectionOverlay.style.height = `${rect.height}px`;
      }
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
    this.menuController.sync(menu, hostRect, MIN_HANDLE_INSET);
  }

  private toggleContextMenuFromControl(
    interaction: HtmlTableInteractionState,
    focusTarget: HTMLButtonElement | null,
  ): void {
    this.menuController.toggleFromControl(interaction, focusTarget);
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
    if (!selectionInfo || selectionInfo.tablePos !== tablePos) {
      this.cellSelectionHandle.hidden = true;
      this.cellSelectionHandle.tabIndex = -1;
      return;
    }

    const rect = getHtmlTableVisibleSelectionRect(
      geometry,
      tableLeft,
      tableTop,
      selectionInfo.left,
      selectionInfo.right,
      selectionInfo.top,
      selectionInfo.bottom,
    );
    if (!rect) {
      this.cellSelectionHandle.hidden = true;
      this.cellSelectionHandle.tabIndex = -1;
      return;
    }

    const visible = isHtmlTableCellHandleVisible(interaction, tablePos, selectionInfo, renderState.visible);
    this.cellSelectionHandle.hidden = !visible;
    this.cellSelectionHandle.tabIndex = visible ? 0 : -1;
    this.cellSelectionHandle.style.left = `${rect.right - 1}px`;
    this.cellSelectionHandle.style.top = `${rect.top + rect.height / 2}px`;
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
    this.menuController.handleMenuMouseDown(event);
  }

  private handleContextMenuClick(event: MouseEvent): void {
    this.menuController.handleMenuClick(event);
  }

  private handleContextMenuKeyDown(event: KeyboardEvent): void {
    this.menuController.handleMenuKeyDown(event);
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
    this.menuController.handleDocumentMouseDown(event);
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
    this.menuController.handleDocumentKeyDown(event);
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

    const finalizedTransaction = this.applyExtendButtonSelection(
      axis,
      tablePos,
      geometry,
      targetRowIndex,
      commandState,
      commandTransaction,
    );

    this.view.focus();
    this.view.dispatch(finalizedTransaction);
  }

  private applyExtendButtonSelection(
    axis: 'row' | 'column',
    tablePos: number,
    geometry: ReturnType<typeof measureHtmlTableGeometry>,
    targetRowIndex: number,
    commandState: EditorView['state'],
    commandTransaction: Transaction,
  ): Transaction {
    const nextState = commandState.apply(commandTransaction);
    const nextTable = nextState.doc.nodeAt(tablePos);
    if (!nextTable || nextTable.type.name !== 'htmlTable') {
      return commandTransaction;
    }

    const nextIndex = axis === 'row' ? targetRowIndex + 1 : Math.max(0, geometry.columns.length);
    const selectionTransaction =
      axis === 'row'
        ? createRowSelectionTransaction(nextState, tablePos, nextTable, nextIndex)
        : createColumnSelectionTransaction(nextState, tablePos, nextTable, nextIndex);
    if (!selectionTransaction) {
      return commandTransaction;
    }

    commandTransaction.setSelection(selectionTransaction.selection);
    commandTransaction.setMeta(htmlTableInteractionPluginKey, {
      selectedAxis: {
        kind: axis,
        index: nextIndex,
        tablePos,
      },
      selectedAxisExplicit: true,
    });
    return commandTransaction;
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
    const geometry = measureHtmlTableGeometry(context.dom, context.wrapper);
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

    const resizedGeometry = measureHtmlTableGeometry(context.dom, context.wrapper);
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
    interaction: HtmlTableInteractionState,
    visibleTableLeft: number,
    visibleTableTop: number,
    visibleTableWidth: number,
    visibleTableHeight: number,
  ): void {
    const hidden = shouldHideHtmlTableExtendButtons(interaction);

    this.addRowButton.hidden = hidden;
    this.addRowButton.tabIndex = hidden ? -1 : 0;
    this.addRowButton.style.left = `${visibleTableLeft + visibleTableWidth / 2}px`;
    this.addRowButton.style.top = `${visibleTableTop + visibleTableHeight + EXTEND_BUTTON_OFFSET}px`;

    this.addColumnButton.hidden = hidden;
    this.addColumnButton.tabIndex = hidden ? -1 : 0;
    this.addColumnButton.style.left = `${visibleTableLeft + visibleTableWidth + EXTEND_BUTTON_OFFSET}px`;
    this.addColumnButton.style.top = `${visibleTableTop + visibleTableHeight / 2}px`;
  }

  private dispatchInteractionMeta(meta: {
    geometry?: ReturnType<typeof measureHtmlTableGeometry> | null;
    resizing?: { tablePos: number; columnIndex: number } | null;
  }): void {
    this.view.dispatch(this.view.state.tr.setMeta(htmlTableInteractionPluginKey, meta));
  }

  private detach(): void {
    this.root.hidden = true;
    this.overlayHost.detach();
    this.renderedTablePos = null;
    this.renderedGeometry = null;
  }

  private isColumnResizable(index: number, totalColumns: number): boolean {
    if (!this.options.resizable) return false;
    if (index < 0 || index >= totalColumns) return false;
    if (this.options.lastColumnResizable) return true;
    return index < totalColumns - 1;
  }

  private suppressPointerClick(): void {
    this.suppressNextDocumentClick = true;
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
