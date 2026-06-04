import { NodeSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

import {
  getHtmlTableContextTriggerButtonState,
  type HtmlTableContextMenuState,
  type HtmlTableContextTriggerButtonState,
} from './html-table-context-menu.js';
import {
  getHtmlTableInteractionState,
  type HtmlTableInteractionState,
  htmlTableInteractionPluginKey,
} from './html-table-interaction.js';
import {
  getHtmlTableContextMenuAriaControls,
  getHtmlTableContextTriggerRenderState,
  getHtmlTableOverlayHandleText,
  isHtmlTableKeyboardClick,
} from './html-table-menu-controller.js';
import type { HtmlTableOverlayPositionState, HtmlTableSelectionScope } from './html-table-overlay-geometry.js';
import { measureHtmlTableGeometry } from './table-dom.js';
import {
  createColumnSelectionTransaction,
  createRowSelectionTransaction,
} from './table-utils.js';

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
  const hoveredAxisIndex =
    interaction.hovered?.tablePos === tablePos
      ? axis === 'row'
        ? interaction.hovered.rowIndex
        : interaction.hovered.columnIndex
      : null;

  if (interaction.tableSelected || interaction.resizing?.tablePos === tablePos) {
    return false;
  }

  if (interaction.contextMenuOpen && !selected) {
    return false;
  }

  if (hoveredAxisIndex !== null) {
    return hovered;
  }

  return hovered || selected;
}

export interface HtmlTableHandleControllerOptions {
  allowTableNodeSelection: boolean;
  contextMenuId: string;
  getView: () => EditorView;
  handleCrossAxisSize: number;
  handleMainAxisInset: number;
  minHandleInset: number;
  root: HTMLDivElement;
  suppressPointerClick: () => void;
  toggleContextMenuFromControl: (
    interaction: HtmlTableInteractionState,
    focusTarget: HTMLButtonElement | null,
  ) => void;
}

export class HtmlTableHandleController {
  readonly contextTriggerButton: HTMLButtonElement;
  readonly tableHandle: HTMLButtonElement;

  private readonly root: HTMLDivElement;
  private readonly contextMenuId: string;
  private readonly allowTableNodeSelection: boolean;
  private readonly getView: () => EditorView;
  private readonly suppressPointerClick: () => void;
  private readonly toggleContextMenuFromControl: HtmlTableHandleControllerOptions['toggleContextMenuFromControl'];
  private readonly handleCrossAxisSize: number;
  private readonly handleMainAxisInset: number;
  private readonly minHandleInset: number;
  private readonly rowHandlesParent: HTMLDivElement;
  private readonly columnHandlesParent: HTMLDivElement;
  private rowHandles: HTMLButtonElement[] = [];
  private columnHandles: HTMLButtonElement[] = [];

  constructor(options: HtmlTableHandleControllerOptions) {
    this.root = options.root;
    this.contextMenuId = options.contextMenuId;
    this.allowTableNodeSelection = options.allowTableNodeSelection;
    this.getView = options.getView;
    this.suppressPointerClick = options.suppressPointerClick;
    this.toggleContextMenuFromControl = options.toggleContextMenuFromControl;
    this.handleCrossAxisSize = options.handleCrossAxisSize;
    this.handleMainAxisInset = options.handleMainAxisInset;
    this.minHandleInset = options.minHandleInset;

    this.contextTriggerButton = this.createContextTriggerButton();
    this.tableHandle = this.createTableHandle();
    this.rowHandlesParent = this.root.ownerDocument.createElement('div');
    this.rowHandlesParent.className = 'html-table-overlay__rows';
    this.columnHandlesParent = this.root.ownerDocument.createElement('div');
    this.columnHandlesParent.className = 'html-table-overlay__columns';

    this.root.append(
      this.contextTriggerButton,
      this.tableHandle,
      this.rowHandlesParent,
      this.columnHandlesParent,
    );
  }

  render(
    interaction: HtmlTableInteractionState,
    menu: HtmlTableContextMenuState,
    trigger: HtmlTableContextTriggerButtonState,
    tablePos: number,
    geometry: ReturnType<typeof measureHtmlTableGeometry>,
    positionState: Pick<HtmlTableOverlayPositionState, 'tableLeft' | 'tableTop' | 'rowHandleLeft' | 'columnHandleTop'>,
    hostRect: DOMRect,
  ): void {
    this.syncHandleCount('row', geometry.rows.length);
    this.syncHandleCount('column', geometry.columns.length);
    this.syncContextTriggerButton(trigger, hostRect);
    this.syncTableHandle(interaction, menu, tablePos, positionState.rowHandleLeft, positionState.columnHandleTop);

    for (const row of geometry.rows) {
      const handle = this.rowHandles[row.index];
      if (!handle) continue;

      handle.dataset.index = String(row.index);
      handle.style.left = `${positionState.rowHandleLeft}px`;
      handle.style.top = `${positionState.tableTop + row.top + row.height / 2}px`;
      handle.style.width = `${this.handleCrossAxisSize}px`;
      handle.style.height = `${Math.max(this.handleCrossAxisSize, row.height - this.handleMainAxisInset)}px`;
      const isRowHovered = isHtmlTableAxisHandleHovered(interaction, 'row', tablePos, row.index);
      const isRowSelected =
        Boolean(interaction.selectedAxisExplicit) &&
        interaction.selectedAxis.kind === 'row' &&
        interaction.selectedAxis.index === row.index &&
        interaction.selectedAxis.tablePos === tablePos;
      const isRowMenuOpen = isRowSelected && isHtmlTableContextMenuExpandedForScope(menu, 'row');
      const rowText = getHtmlTableOverlayHandleText(
        'row',
        row.index,
        isRowSelected,
        isRowMenuOpen,
        isRowMenuOpen ? menu.primaryAction?.label ?? null : null,
      );
      const rowControls = getHtmlTableContextMenuAriaControls(this.contextMenuId, isRowMenuOpen);
      handle.hidden = !isHtmlTableAxisHandleVisible(interaction, 'row', tablePos, row.index);
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
      handle.classList.toggle('is-hovered', isRowHovered);
      handle.classList.toggle('is-selected', isRowSelected);
      handle.classList.toggle('is-menu-open', isRowMenuOpen);
    }

    for (const column of geometry.columns) {
      const handle = this.columnHandles[column.index];
      if (!handle) continue;

      handle.dataset.index = String(column.index);
      handle.style.left = `${positionState.tableLeft + column.left + column.width / 2}px`;
      handle.style.top = `${positionState.columnHandleTop}px`;
      handle.style.width = `${Math.max(this.handleCrossAxisSize, column.width - this.handleMainAxisInset)}px`;
      handle.style.height = `${this.handleCrossAxisSize}px`;
      const isColumnHovered = isHtmlTableAxisHandleHovered(interaction, 'column', tablePos, column.index);
      const isColumnSelected =
        Boolean(interaction.selectedAxisExplicit) &&
        interaction.selectedAxis.kind === 'column' &&
        interaction.selectedAxis.index === column.index &&
        interaction.selectedAxis.tablePos === tablePos;
      const isColumnMenuOpen = isColumnSelected && isHtmlTableContextMenuExpandedForScope(menu, 'column');
      const columnText = getHtmlTableOverlayHandleText(
        'column',
        column.index,
        isColumnSelected,
        isColumnMenuOpen,
        isColumnMenuOpen ? menu.primaryAction?.label ?? null : null,
      );
      const columnControls = getHtmlTableContextMenuAriaControls(this.contextMenuId, isColumnMenuOpen);
      handle.hidden = !isHtmlTableAxisHandleVisible(interaction, 'column', tablePos, column.index);
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
      handle.classList.toggle('is-hovered', isColumnHovered);
      handle.classList.toggle('is-selected', isColumnSelected);
      handle.classList.toggle('is-menu-open', isColumnMenuOpen);
    }
  }

  private get view(): EditorView {
    return this.getView();
  }

  private syncHandleCount(axis: 'row' | 'column', count: number): void {
    const handles = axis === 'row' ? this.rowHandles : this.columnHandles;
    const parent = axis === 'row' ? this.rowHandlesParent : this.columnHandlesParent;

    while (handles.length < count) {
      const handle = this.createHandle(axis);
      handles.push(handle);
      parent.append(handle);
    }

    while (handles.length > count) {
      handles.pop()?.remove();
    }
  }

  private syncTableHandle(
    interaction: HtmlTableInteractionState,
    menu: HtmlTableContextMenuState,
    tablePos: number,
    left: number,
    top: number,
  ): void {
    const visible = isTableHandleVisible(this.allowTableNodeSelection, interaction, tablePos);
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
    this.tableHandle.style.width = `${this.handleCrossAxisSize}px`;
    this.tableHandle.style.height = `${this.handleCrossAxisSize}px`;
    this.tableHandle.classList.toggle('is-hovered', isHovered);
    this.tableHandle.classList.toggle('is-selected', isSelected);
    this.tableHandle.classList.toggle('is-menu-open', isMenuOpen);
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

    this.contextTriggerButton.style.left = `${Math.max(this.minHandleInset, renderState.left - hostRect.left)}px`;
    this.contextTriggerButton.style.top = `${Math.max(this.minHandleInset, renderState.top - hostRect.top)}px`;
  }

  private createHandle(axis: 'row' | 'column'): HTMLButtonElement {
    const handle = this.root.ownerDocument.createElement('button');
    handle.type = 'button';
    handle.className = `html-table-overlay__handle html-table-overlay__handle--${axis}`;
    handle.dataset.axis = axis;
    handle.dataset.testid = axis === 'row' ? 'pmht-row-handle' : 'pmht-column-handle';
    handle.tabIndex = -1;
    handle.addEventListener('mousedown', (event) => this.handleAxisMouseDown(event));
    handle.addEventListener('click', (event) => this.handleAxisClick(event));
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
    handle.addEventListener('mousedown', (event) => this.handleTableMouseDown(event));
    handle.addEventListener('click', (event) => this.handleTableClick(event));
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

  private handleAxisMouseDown(event: MouseEvent): void {
    const handle = event.currentTarget as HTMLButtonElement | null;
    const axis = handle?.dataset.axis;
    const index = Number(handle?.dataset.index);
    const interaction = getHtmlTableInteractionState(this.view.state);
    const activeTable = interaction.activeTable;
    if (
      !handle ||
      !activeTable ||
      (axis !== 'row' && axis !== 'column') ||
      !Number.isInteger(index) ||
      interaction.resizing?.tablePos === activeTable.tablePos
    ) {
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

  private handleAxisClick(event: MouseEvent): void {
    if (!isHtmlTableKeyboardClick(event)) {
      return;
    }

    const handle = event.currentTarget as HTMLButtonElement | null;
    const axis = handle?.dataset.axis;
    const index = Number(handle?.dataset.index);
    const interaction = getHtmlTableInteractionState(this.view.state);
    const activeTable = interaction.activeTable;
    if (
      !handle ||
      !activeTable ||
      (axis !== 'row' && axis !== 'column') ||
      !Number.isInteger(index) ||
      interaction.resizing?.tablePos === activeTable.tablePos
    ) {
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
    this.toggleContextMenuFromControl(getHtmlTableInteractionState(this.view.state), handle);
  }

  private handleTableMouseDown(event: MouseEvent): void {
    if (!this.allowTableNodeSelection) {
      return;
    }

    const interaction = getHtmlTableInteractionState(this.view.state);
    const activeTable = interaction.activeTable;
    if (!activeTable || interaction.resizing?.tablePos === activeTable.tablePos) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.suppressPointerClick();
    this.activateTableHandle(activeTable.tablePos, interaction, this.tableHandle);
  }

  private handleTableClick(event: MouseEvent): void {
    if (!isHtmlTableKeyboardClick(event) || !this.allowTableNodeSelection) {
      return;
    }

    const interaction = getHtmlTableInteractionState(this.view.state);
    const activeTable = interaction.activeTable;
    if (!activeTable || interaction.resizing?.tablePos === activeTable.tablePos) {
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

    const transaction = this.view.state.tr.setSelection(NodeSelection.create(this.view.state.doc, tablePos));
    this.view.focus();
    this.view.dispatch(transaction);
    this.toggleContextMenuFromControl(getHtmlTableInteractionState(this.view.state), handle);
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
    if (interaction.resizing?.tablePos === interaction.activeTable?.tablePos) {
      this.view.focus();
      return;
    }

    const trigger = getHtmlTableContextTriggerButtonState(this.view.state, interaction);
    if (!trigger.visible) {
      this.view.focus();
      return;
    }

    this.toggleContextMenuFromControl(interaction, this.contextTriggerButton);
  }
}
