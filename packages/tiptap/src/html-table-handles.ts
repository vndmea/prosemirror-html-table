import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { addColumnAfter as addCoreColumnAfter, addRowAfter as addCoreRowAfter } from 'prosemirror-html-table';

import type { HtmlTableTiptapOptions } from './options.js';
import {
  getHtmlTableInteractionState,
  htmlTableInteractionPluginKey,
} from './html-table-interaction.js';
import { getRenderedHtmlTableContext, measureHtmlTableGeometry } from './table-dom.js';
import {
  createAxisFocusTransaction,
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

export const htmlTableHandlePluginKey = new PluginKey('html-table-handle-overlay');

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
  private readonly rowSelectionOverlay: HTMLDivElement;
  private readonly columnSelectionOverlay: HTMLDivElement;
  private readonly cellSelectionHandle: HTMLButtonElement;
  private readonly addRowButton: HTMLButtonElement;
  private readonly addColumnButton: HTMLButtonElement;
  private currentWrapper: HTMLElement | null = null;
  private rowHandles: HTMLButtonElement[] = [];
  private columnHandles: HTMLButtonElement[] = [];
  private resizeHandles: HTMLButtonElement[] = [];
  private activeResize:
    | {
        tablePos: number;
        columnIndex: number;
        startX: number;
        startWidths: number[];
      }
    | null = null;
  private readonly onDocumentMouseMove = (event: MouseEvent) => this.handleResizeMove(event);
  private readonly onDocumentMouseUp = () => this.finishResize();

  constructor(view: EditorView, options: HtmlTableTiptapOptions) {
    this.view = view;
    this.options = options;
    this.root = view.dom.ownerDocument.createElement('div');
    this.root.className = 'html-table-overlay';
    this.root.dataset.htmlTableOverlay = 'true';
    this.root.setAttribute('role', 'presentation');
    this.root.hidden = true;
    this.rowSelectionOverlay = this.root.ownerDocument.createElement('div');
    this.rowSelectionOverlay.className = 'html-table-overlay__selection-band html-table-overlay__selection-band--row';
    this.columnSelectionOverlay = this.root.ownerDocument.createElement('div');
    this.columnSelectionOverlay.className =
      'html-table-overlay__selection-band html-table-overlay__selection-band--column';
    this.cellSelectionHandle = this.root.ownerDocument.createElement('button');
    this.cellSelectionHandle.type = 'button';
    this.cellSelectionHandle.className = 'html-table-overlay__cell-selection-handle';
    this.cellSelectionHandle.tabIndex = -1;
    this.cellSelectionHandle.hidden = true;
    this.cellSelectionHandle.setAttribute('aria-label', 'Selected cells handle');
    this.cellSelectionHandle.title = 'Selected cells handle';
    this.addRowButton = this.createExtendButton('row');
    this.addColumnButton = this.createExtendButton('column');
    this.root.append(
      this.rowSelectionOverlay,
      this.columnSelectionOverlay,
      this.cellSelectionHandle,
      this.addRowButton,
      this.addColumnButton,
    );
    this.render();
  }

  update(view: EditorView): void {
    this.view = view;
    this.render();
  }

  destroy(): void {
    this.clearActiveResize(false);
    this.currentWrapper = null;
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

    this.attach(context.wrapper);

    const wrapperRect = context.wrapper.getBoundingClientRect();
    const tableLeft = context.wrapper.scrollLeft + geometry.tableRect.left - wrapperRect.left;
    const tableTop = context.wrapper.scrollTop + geometry.tableRect.top - wrapperRect.top;
    const rowHandleLeft = Math.max(MIN_HANDLE_INSET, tableLeft - ROW_HANDLE_OFFSET);
    const columnHandleTop = Math.max(MIN_HANDLE_INSET, tableTop - COLUMN_HANDLE_OFFSET);

    this.syncHandleCount('row', geometry.rows.length);
    this.syncHandleCount('column', geometry.columns.length);
    this.syncResizeHandleCount(this.options.resizable ? geometry.columns.length : 0);
    this.syncSelectionOverlay(interaction, activeTable.tablePos, geometry, tableLeft, tableTop);
    this.syncCellSelectionHandle(activeTable.tablePos, geometry, tableLeft, tableTop);
    this.syncExtendButtons(tableLeft, tableTop, geometry);

    for (const row of geometry.rows) {
      const handle = this.rowHandles[row.index];
      if (!handle) continue;

      handle.dataset.index = String(row.index);
      handle.setAttribute('aria-label', `Select row ${row.index + 1}`);
      handle.title = `Select row ${row.index + 1}`;
      handle.style.left = `${rowHandleLeft}px`;
      handle.style.top = `${tableTop + row.top + row.height / 2}px`;
      handle.style.width = `${HANDLE_CROSS_AXIS_SIZE}px`;
      handle.style.height = `${Math.max(HANDLE_CROSS_AXIS_SIZE, row.height - HANDLE_MAIN_AXIS_INSET)}px`;
      const isRowHovered =
        interaction.hovered?.kind === 'cell' &&
        interaction.hovered.tablePos === activeTable.tablePos &&
        interaction.hovered.rowIndex === row.index;
      const isRowSelected =
        interaction.selectedAxis.kind === 'row' &&
        interaction.selectedAxis.index === row.index &&
        interaction.selectedAxis.tablePos === activeTable.tablePos;
      handle.hidden = !isRowHovered && !isRowSelected;
      handle.classList.toggle(
        'is-hovered',
        isRowHovered,
      );
      handle.classList.toggle(
        'is-selected',
        isRowSelected,
      );
    }

    for (const column of geometry.columns) {
      const handle = this.columnHandles[column.index];
      if (!handle) continue;

      handle.dataset.index = String(column.index);
      handle.setAttribute('aria-label', `Select column ${column.index + 1}`);
      handle.title = `Select column ${column.index + 1}`;
      handle.style.left = `${tableLeft + column.left + column.width / 2}px`;
      handle.style.top = `${columnHandleTop}px`;
      handle.style.width = `${Math.max(HANDLE_CROSS_AXIS_SIZE, column.width - HANDLE_MAIN_AXIS_INSET)}px`;
      handle.style.height = `${HANDLE_CROSS_AXIS_SIZE}px`;
      const isColumnHovered =
        interaction.hovered?.kind === 'cell' &&
        interaction.hovered.tablePos === activeTable.tablePos &&
        interaction.hovered.columnIndex === column.index;
      const isColumnSelected =
        interaction.selectedAxis.kind === 'column' &&
        interaction.selectedAxis.index === column.index &&
        interaction.selectedAxis.tablePos === activeTable.tablePos;
      handle.hidden = !isColumnHovered && !isColumnSelected;
      handle.classList.toggle(
        'is-hovered',
        isColumnHovered,
      );
      handle.classList.toggle(
        'is-selected',
        isColumnSelected,
      );

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
    const selectedAxis = interaction.selectedAxis.tablePos === tablePos ? interaction.selectedAxis : null;
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

  private syncCellSelectionHandle(
    tablePos: number,
    geometry: ReturnType<typeof measureHtmlTableGeometry>,
    tableLeft: number,
    tableTop: number,
  ): void {
    const selectionInfo = getTableSelectionInfo(this.view.state.doc, this.view.state.selection);
    if (!selectionInfo || selectionInfo.tablePos !== tablePos) {
      this.cellSelectionHandle.hidden = true;
      return;
    }

    const interaction = getHtmlTableInteractionState(this.view.state);
    if (interaction.selectedAxis.kind) {
      this.cellSelectionHandle.hidden = true;
      return;
    }

    const leftColumn = geometry.columns[selectionInfo.left];
    const rightColumn = geometry.columns[selectionInfo.right];
    const topRow = geometry.rows[selectionInfo.top];
    const bottomRow = geometry.rows[selectionInfo.bottom];
    if (!leftColumn || !rightColumn || !topRow || !bottomRow) {
      this.cellSelectionHandle.hidden = true;
      return;
    }

    const selectionTop = tableTop + topRow.top;
    const selectionBottom = tableTop + bottomRow.top + bottomRow.height;
    const selectionRight = tableLeft + rightColumn.left + rightColumn.width;

    this.cellSelectionHandle.hidden = false;
    this.cellSelectionHandle.style.left = `${selectionRight - 1}px`;
    this.cellSelectionHandle.style.top = `${selectionTop + (selectionBottom - selectionTop) / 2}px`;
  }

  private createHandle(axis: 'row' | 'column'): HTMLButtonElement {
    const handle = this.root.ownerDocument.createElement('button');
    handle.type = 'button';
    handle.className = `html-table-overlay__handle html-table-overlay__handle--${axis}`;
    handle.dataset.axis = axis;
    handle.tabIndex = -1;
    handle.addEventListener('mousedown', (event) => this.handleMouseDown(event));
    return handle;
  }

  private createResizeHandle(): HTMLButtonElement {
    const handle = this.root.ownerDocument.createElement('button');
    handle.type = 'button';
    handle.className = 'html-table-overlay__resize-handle';
    handle.tabIndex = -1;
    handle.addEventListener('mousedown', (event) => this.handleResizeStart(event));
    return handle;
  }

  private createExtendButton(axis: 'row' | 'column'): HTMLButtonElement {
    const button = this.root.ownerDocument.createElement('button');
    button.type = 'button';
    button.className = `html-table-overlay__extend-button html-table-overlay__extend-button--${axis}`;
    button.dataset.axis = axis;
    button.tabIndex = -1;
    button.textContent = '+';
    button.setAttribute('aria-label', axis === 'row' ? 'Add row after' : 'Add column after');
    button.title = axis === 'row' ? 'Add row after' : 'Add column after';
    button.addEventListener('mousedown', (event) => this.handleExtendButtonMouseDown(event));
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

    const transaction =
      axis === 'row'
        ? createRowSelectionTransaction(this.view.state, activeTable.tablePos, table, index)
        : createAxisFocusTransaction(this.view.state, activeTable.tablePos, table, 'column', index)?.setMeta(
            htmlTableInteractionPluginKey,
            {
              selectedAxis: {
                kind: 'column',
                index,
                tablePos: activeTable.tablePos,
              },
            },
          );

    if (!transaction) return;

    this.view.focus();
    this.view.dispatch(transaction);
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
    const interaction = getHtmlTableInteractionState(this.view.state);
    const activeTable = interaction.activeTable;
    const geometry = interaction.geometry;
    if (!button || !activeTable || !geometry || (axis !== 'row' && axis !== 'column')) {
      return;
    }

    const table = this.view.state.doc.nodeAt(activeTable.tablePos);
    if (!table || table.type.name !== 'htmlTable') {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const selectionTransaction =
      axis === 'row'
        ? createRowSelectionTransaction(this.view.state, activeTable.tablePos, table, Math.max(0, geometry.rows.length - 1))
        : createAxisFocusTransaction(
            this.view.state,
            activeTable.tablePos,
            table,
            'column',
            Math.max(0, geometry.columns.length - 1),
          )?.setMeta(htmlTableInteractionPluginKey, {
            selectedAxis: {
              kind: 'column',
              index: Math.max(0, geometry.columns.length - 1),
              tablePos: activeTable.tablePos,
            },
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
    const widths = resizedGeometry.columns.map((column) => Math.max(this.options.cellMinWidth, Math.round(column.width)));
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
    this.addRowButton.style.left = `${tableLeft + geometry.tableRect.width / 2}px`;
    this.addRowButton.style.top = `${tableTop + geometry.tableRect.height + EXTEND_BUTTON_OFFSET}px`;

    this.addColumnButton.hidden = false;
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
    if (this.currentWrapper === wrapper && this.root.parentElement === wrapper) {
      return;
    }

    this.detach();
    wrapper.append(this.root);
    this.currentWrapper = wrapper;
  }

  private detach(): void {
    this.root.hidden = true;
    this.root.remove();
    this.currentWrapper = null;
  }

  private isColumnResizable(index: number, totalColumns: number): boolean {
    if (!this.options.resizable) return false;
    if (index < 0 || index >= totalColumns) return false;
    if (this.options.lastColumnResizable) return true;
    return index < totalColumns - 1;
  }
}
