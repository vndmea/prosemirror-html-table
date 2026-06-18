import { NodeSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { moveColumnToIndex, moveRowToIndex } from 'prosemirror-html-table';

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
import {
  getHtmlTableVisibleSelectionRect,
  type HtmlTableOverlayPositionState,
  type HtmlTableSelectionScope,
} from './html-table-overlay-geometry.js';
import {
  isTableAxisHandleHovered,
  isTableAxisHandleVisible,
  shouldToggleTableContextMenuFromAxisHandle,
  shouldToggleTableContextMenuFromTableHandle,
} from './table-interaction/handle-state.js';
import { canToggleTableContextTriggerMenu } from './table-interaction/menu-controller.js';
import { measureHtmlTableGeometry } from './table-dom.js';
import {
  createColumnSelectionTransaction,
  createRowSelectionTransaction,
} from './table-utils.js';
import type { HtmlTableTiptapOptions } from './options.js';

export function isTableHandleVisible(
  _allowTableNodeSelection: boolean,
  _interaction: HtmlTableInteractionState,
  _tablePos: number,
): boolean {
  void _allowTableNodeSelection;
  void _interaction;
  void _tablePos;
  return false;
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
  return shouldToggleTableContextMenuFromAxisHandle(interaction, axis, tablePos, index);
}

export function shouldToggleHtmlTableContextMenuFromTableHandle(
  interaction: HtmlTableInteractionState,
  tablePos: number,
): boolean {
  return shouldToggleTableContextMenuFromTableHandle(interaction, tablePos);
}

export function isHtmlTableAxisHandleHovered(
  interaction: HtmlTableInteractionState,
  axis: 'row' | 'column',
  tablePos: number,
  index: number,
): boolean {
  return isTableAxisHandleHovered(interaction, axis, tablePos, index);
}

export function isHtmlTableAxisHandleVisible(
  interaction: HtmlTableInteractionState,
  axis: 'row' | 'column',
  tablePos: number,
  index: number,
): boolean {
  return isTableAxisHandleVisible(interaction, axis, tablePos, index);
}

export interface HtmlTableColumnHandleLayout {
  left: number;
  width: number;
}

export function getHtmlTableColumnHandleLayout(
  geometry: ReturnType<typeof measureHtmlTableGeometry>,
  tableLeft: number,
  tableTop: number,
  columnIndex: number,
  handleCrossAxisSize: number,
  handleMainAxisInset: number,
): HtmlTableColumnHandleLayout | null {
  const visibleColumnRect = getHtmlTableVisibleSelectionRect(
    geometry,
    tableLeft,
    tableTop,
    columnIndex,
    columnIndex,
    0,
    Math.max(0, geometry.rows.length - 1),
  );
  if (!visibleColumnRect || visibleColumnRect.width <= 0) {
    return null;
  }

  const width = Math.max(
    1,
    Math.min(
      visibleColumnRect.width,
      Math.max(handleCrossAxisSize, visibleColumnRect.width - handleMainAxisInset),
    ),
  );
  const minCenter = visibleColumnRect.left + width / 2;
  const maxCenter = visibleColumnRect.right - width / 2;
  const rawCenter = visibleColumnRect.left + visibleColumnRect.width / 2;
  const clampedCenter = Math.min(Math.max(rawCenter, minCenter), maxCenter);

  return {
    left: clampedCenter,
    width,
  };
}

export interface HtmlTableHandleControllerOptions {
  allowTableNodeSelection: boolean;
  allowCrossSectionRowDrag: boolean;
  contextMenuId: string;
  enableRowColumnDrag: boolean;
  getView: () => EditorView;
  handleCrossAxisSize: number;
  handleMainAxisInset: number;
  minHandleInset: number;
  root: HTMLDivElement;
  suppressPointerClick: () => void;
  tableOptions?: Pick<HtmlTableTiptapOptions, 'contextActionResolver'>;
  toggleContextMenuFromControl: (
    interaction: HtmlTableInteractionState,
    focusTarget: HTMLButtonElement | null,
  ) => void;
}

interface HtmlTableHandleRenderState {
  geometry: ReturnType<typeof measureHtmlTableGeometry>;
  hostRect: DOMRect;
  positionState: HtmlTableOverlayPositionState;
  tablePos: number;
}

interface HtmlTableAxisDragState {
  axis: 'row' | 'column';
  handle: HTMLButtonElement;
  hasDragged: boolean;
  index: number;
  isValidTarget: boolean;
  pointerId: number;
  startX: number;
  startY: number;
  tablePos: number;
  targetIndex: number | null;
}

export class HtmlTableHandleController {
  readonly contextTriggerButton: HTMLButtonElement;
  readonly tableHandle: HTMLButtonElement;

  private readonly allowCrossSectionRowDrag: boolean;
  private readonly root: HTMLDivElement;
  private readonly contextMenuId: string;
  private readonly allowTableNodeSelection: boolean;
  private readonly enableRowColumnDrag: boolean;
  private readonly getView: () => EditorView;
  private readonly suppressPointerClick: () => void;
  private readonly tableOptions: Pick<HtmlTableTiptapOptions, 'contextActionResolver'>;
  private readonly toggleContextMenuFromControl: HtmlTableHandleControllerOptions['toggleContextMenuFromControl'];
  private readonly handleCrossAxisSize: number;
  private readonly handleMainAxisInset: number;
  private readonly minHandleInset: number;
  private readonly dropIndicator: HTMLDivElement;
  private readonly rowHandlesParent: HTMLDivElement;
  private readonly columnHandlesParent: HTMLDivElement;
  private dragState: HtmlTableAxisDragState | null = null;
  private lastRenderState: HtmlTableHandleRenderState | null = null;
  private rowHandles: HTMLButtonElement[] = [];
  private columnHandles: HTMLButtonElement[] = [];
  private readonly onDocumentPointerMove = (event: PointerEvent) => this.handleDocumentPointerMove(event);
  private readonly onDocumentPointerUp = (event: PointerEvent) => this.handleDocumentPointerUp(event);
  private readonly onDocumentPointerCancel = (event: PointerEvent) => this.handleDocumentPointerCancel(event);
  private readonly onDocumentKeyDown = (event: KeyboardEvent) => this.handleDocumentKeyDown(event);

  constructor(options: HtmlTableHandleControllerOptions) {
    this.allowCrossSectionRowDrag = options.allowCrossSectionRowDrag;
    this.root = options.root;
    this.contextMenuId = options.contextMenuId;
    this.allowTableNodeSelection = options.allowTableNodeSelection;
    this.enableRowColumnDrag = options.enableRowColumnDrag;
    this.getView = options.getView;
    this.suppressPointerClick = options.suppressPointerClick;
    this.tableOptions = options.tableOptions ?? { contextActionResolver: null };
    this.toggleContextMenuFromControl = options.toggleContextMenuFromControl;
    this.handleCrossAxisSize = options.handleCrossAxisSize;
    this.handleMainAxisInset = options.handleMainAxisInset;
    this.minHandleInset = options.minHandleInset;

    this.contextTriggerButton = this.createContextTriggerButton();
    this.tableHandle = this.createTableHandle();
    this.dropIndicator = this.root.ownerDocument.createElement('div');
    this.dropIndicator.className = 'html-table-overlay__drop-indicator';
    this.dropIndicator.hidden = true;
    this.dropIndicator.setAttribute('aria-hidden', 'true');
    this.rowHandlesParent = this.root.ownerDocument.createElement('div');
    this.rowHandlesParent.className = 'html-table-overlay__rows';
    this.columnHandlesParent = this.root.ownerDocument.createElement('div');
    this.columnHandlesParent.className = 'html-table-overlay__columns';

    this.root.append(
      this.contextTriggerButton,
      this.tableHandle,
      this.dropIndicator,
      this.rowHandlesParent,
      this.columnHandlesParent,
    );
    this.root.ownerDocument.addEventListener('pointermove', this.onDocumentPointerMove);
    this.root.ownerDocument.addEventListener('pointerup', this.onDocumentPointerUp, true);
    this.root.ownerDocument.addEventListener('pointercancel', this.onDocumentPointerCancel, true);
    this.root.ownerDocument.addEventListener('keydown', this.onDocumentKeyDown);
  }

  render(
    interaction: HtmlTableInteractionState,
    menu: HtmlTableContextMenuState,
    trigger: HtmlTableContextTriggerButtonState,
    tablePos: number,
    geometry: ReturnType<typeof measureHtmlTableGeometry>,
    positionState: HtmlTableOverlayPositionState,
    hostRect: DOMRect,
  ): void {
    this.lastRenderState = {
      geometry,
      hostRect,
      positionState,
      tablePos,
    };
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
      handle.removeAttribute('title');
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

      const layout = getHtmlTableColumnHandleLayout(
        geometry,
        positionState.tableLeft,
        positionState.tableTop,
        column.index,
        this.handleCrossAxisSize,
        this.handleMainAxisInset,
      );
      handle.dataset.index = String(column.index);
      handle.style.left = `${layout?.left ?? positionState.tableLeft + column.left + column.width / 2}px`;
      handle.style.top = `${positionState.columnHandleTop}px`;
      handle.style.width = `${layout?.width ?? Math.max(this.handleCrossAxisSize, column.width - this.handleMainAxisInset)}px`;
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
      handle.hidden =
        !layout || !isHtmlTableAxisHandleVisible(interaction, 'column', tablePos, column.index);
      handle.tabIndex = handle.hidden ? -1 : 0;
      handle.setAttribute('aria-label', columnText.label);
      handle.removeAttribute('title');
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

    this.syncDragIndicator();
  }

  destroy(): void {
    this.cancelDrag();
    this.root.ownerDocument.removeEventListener('pointermove', this.onDocumentPointerMove);
    this.root.ownerDocument.removeEventListener('pointerup', this.onDocumentPointerUp, true);
    this.root.ownerDocument.removeEventListener('pointercancel', this.onDocumentPointerCancel, true);
    this.root.ownerDocument.removeEventListener('keydown', this.onDocumentKeyDown);
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
    this.tableHandle.removeAttribute('title');
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
    handle.style.touchAction = 'none';
    handle.addEventListener('pointerdown', (event) => this.handleAxisPointerDown(event));
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

  private handleAxisPointerDown(event: PointerEvent): void {
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
      event.button !== 0 ||
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
    this.dragState = {
      axis,
      handle,
      hasDragged: false,
      index,
      isValidTarget: false,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      tablePos: activeTable.tablePos,
      targetIndex: null,
    };
    handle.setPointerCapture?.(event.pointerId);
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

  private handleDocumentPointerMove(event: PointerEvent): void {
    if (!this.dragState || event.pointerId !== this.dragState.pointerId) {
      return;
    }

    const dragDistance = Math.hypot(event.clientX - this.dragState.startX, event.clientY - this.dragState.startY);
    if (!this.dragState.hasDragged) {
      if (!this.enableRowColumnDrag || dragDistance < 6) {
        return;
      }

      this.dragState.hasDragged = true;
      this.dragState.handle.classList.add('is-dragging');
      this.root.classList.add('html-table-overlay--dragging');
      this.root.ownerDocument.body.style.userSelect = 'none';
    }

    event.preventDefault();
    this.updateDragTarget(event.clientX, event.clientY);
  }

  private handleDocumentPointerUp(event: PointerEvent): void {
    if (!this.dragState || event.pointerId !== this.dragState.pointerId) {
      return;
    }

    const dragState = this.dragState;
    dragState.handle.releasePointerCapture?.(event.pointerId);

    if (dragState.hasDragged) {
      event.preventDefault();
      event.stopPropagation();
      this.finishDrag(dragState);
      return;
    }

    const interaction = getHtmlTableInteractionState(this.view.state);
    const table = this.view.state.doc.nodeAt(dragState.tablePos);
    this.cancelDrag();
    if (!table || table.type.name !== 'htmlTable') {
      return;
    }

    this.suppressPointerClick();
    this.activateAxisHandle(dragState.axis, dragState.index, dragState.tablePos, table, interaction, dragState.handle);
  }

  private handleDocumentPointerCancel(event: PointerEvent): void {
    if (!this.dragState || event.pointerId !== this.dragState.pointerId) {
      return;
    }

    this.dragState.handle.releasePointerCapture?.(event.pointerId);
    this.cancelDrag();
  }

  private handleDocumentKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !this.dragState) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.cancelDrag();
  }

  private updateDragTarget(clientX: number, clientY: number): void {
    if (!this.dragState || !this.lastRenderState || this.lastRenderState.tablePos !== this.dragState.tablePos) {
      return;
    }

    const targetIndex = this.findClosestAxisIndex(this.dragState.axis, clientX, clientY, this.lastRenderState.hostRect);
    this.dragState.targetIndex = targetIndex;
    this.dragState.isValidTarget = this.canDropAtIndex(this.dragState, targetIndex);
    this.syncDragIndicator();
  }

  private findClosestAxisIndex(
    axis: 'row' | 'column',
    clientX: number,
    clientY: number,
    hostRect: DOMRect,
  ): number | null {
    const handles = axis === 'row' ? this.rowHandles : this.columnHandles;
    const pointerCoordinate = axis === 'row' ? clientY - hostRect.top : clientX - hostRect.left;
    let bestIndex: number | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const handle of handles) {
      const index = Number(handle.dataset.index);
      const center = Number(axis === 'row' ? handle.style.top.replace('px', '') : handle.style.left.replace('px', ''));
      if (!Number.isInteger(index) || Number.isNaN(center)) {
        continue;
      }

      const distance = Math.abs(center - pointerCoordinate);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }

    return bestIndex;
  }

  private canDropAtIndex(dragState: HtmlTableAxisDragState, targetIndex: number | null): boolean {
    if (targetIndex === null || targetIndex === dragState.index) {
      return false;
    }

    return dragState.axis === 'row'
      ? moveRowToIndex({
          allowCrossSectionMove: this.allowCrossSectionRowDrag,
          fromRowIndex: dragState.index,
          tablePos: dragState.tablePos,
          toRowIndex: targetIndex,
        })(this.view.state)
      : moveColumnToIndex({
          fromColumnIndex: dragState.index,
          tablePos: dragState.tablePos,
          toColumnIndex: targetIndex,
        })(this.view.state);
  }

  private finishDrag(dragState: HtmlTableAxisDragState): void {
    const targetIndex = dragState.targetIndex;
    const canDrop = this.canDropAtIndex(dragState, targetIndex);

    if (canDrop && targetIndex !== null) {
      this.view.focus();
      const command =
        dragState.axis === 'row'
          ? moveRowToIndex({
              allowCrossSectionMove: this.allowCrossSectionRowDrag,
              fromRowIndex: dragState.index,
              tablePos: dragState.tablePos,
              toRowIndex: targetIndex,
            })
          : moveColumnToIndex({
              fromColumnIndex: dragState.index,
              tablePos: dragState.tablePos,
              toColumnIndex: targetIndex,
            });
      command(this.view.state, this.view.dispatch);
    }

    this.cancelDrag();
  }

  private cancelDrag(): void {
    if (this.dragState?.handle) {
      this.dragState.handle.classList.remove('is-dragging');
    }

    this.dragState = null;
    this.root.classList.remove('html-table-overlay--dragging');
    this.root.ownerDocument.body.style.removeProperty('user-select');
    this.dropIndicator.hidden = true;
    this.dropIndicator.className = 'html-table-overlay__drop-indicator';
  }

  private syncDragIndicator(): void {
    const dragState = this.dragState;
    const renderState = this.lastRenderState;
    if (!dragState?.hasDragged || !renderState || dragState.targetIndex === null) {
      this.dropIndicator.hidden = true;
      this.dropIndicator.className = 'html-table-overlay__drop-indicator';
      return;
    }

    const { geometry, positionState } = renderState;
    if (dragState.axis === 'row') {
      const row = geometry.rows[dragState.targetIndex];
      if (!row) {
        this.dropIndicator.hidden = true;
        return;
      }

      this.dropIndicator.hidden = false;
      this.dropIndicator.className = `html-table-overlay__drop-indicator html-table-overlay__drop-indicator--row${dragState.isValidTarget ? '' : ' html-table-overlay__drop-indicator--invalid'}`;
      this.dropIndicator.style.left = `${positionState.visibleTableLeft}px`;
      this.dropIndicator.style.top = `${positionState.tableTop + row.top + row.height / 2}px`;
      this.dropIndicator.style.width = `${positionState.visibleTableWidth}px`;
      this.dropIndicator.style.height = '';
      return;
    }

    const column = geometry.columns[dragState.targetIndex];
    if (!column) {
      this.dropIndicator.hidden = true;
      return;
    }

    this.dropIndicator.hidden = false;
    this.dropIndicator.className = `html-table-overlay__drop-indicator html-table-overlay__drop-indicator--column${dragState.isValidTarget ? '' : ' html-table-overlay__drop-indicator--invalid'}`;
    this.dropIndicator.style.left = `${positionState.tableLeft + column.left + column.width / 2}px`;
    this.dropIndicator.style.top = `${positionState.visibleTableTop}px`;
    this.dropIndicator.style.width = '';
    this.dropIndicator.style.height = `${positionState.visibleTableHeight}px`;
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
    const trigger = getHtmlTableContextTriggerButtonState(this.view.state, interaction, this.tableOptions);
    if (!canToggleTableContextTriggerMenu(trigger.visible, {
      blockedByResize: interaction.resizing?.tablePos === interaction.activeTable?.tablePos,
    })) {
      this.view.focus();
      return;
    }

    this.toggleContextMenuFromControl(interaction, this.contextTriggerButton);
  }
}
