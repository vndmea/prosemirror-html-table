import type { EditorView } from '@tiptap/pm/view';

import type { HtmlTableTiptapOptions } from './options.js';
import { getHtmlTableInteractionState, type HtmlTableInteractionState, htmlTableInteractionPluginKey } from './html-table-interaction.js';
import { TableResizeLifecycle, applyTableColumnPreviewWidths } from './table-interaction/resize-lifecycle.js';
import { measureHtmlTableGeometry, getRenderedHtmlTableContext } from './table-dom.js';
import {
  createColumnResizeTransaction,
  getTableColumnWidths,
} from './table-utils.js';

export function isHtmlTableInteractionLockedByResize(
  interaction: HtmlTableInteractionState,
  tablePos: number | null,
): boolean {
  return tablePos !== null && interaction.resizing?.tablePos === tablePos;
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

export interface HtmlTableResizeHandleLayout {
  left: number;
  width: number;
}

export function getHtmlTableResizeHandleLayout(
  geometry: ReturnType<typeof measureHtmlTableGeometry>,
  tableLeft: number,
  columnIndex: number,
  handleWidth: number,
): HtmlTableResizeHandleLayout | null {
  const column = geometry.columns[columnIndex];
  if (!column) {
    return null;
  }

  const visibleLeft = tableLeft + (geometry.visibleTableRect.left - geometry.tableRect.left);
  const visibleRight = tableLeft + (geometry.visibleTableRect.right - geometry.tableRect.left);
  const boundary = tableLeft + column.left + column.width;
  if (boundary < visibleLeft || boundary > visibleRight) {
    return null;
  }

  const width = Math.max(1, handleWidth);
  const halfWidth = width / 2;
  const clampedCenter = Math.min(
    Math.max(boundary, visibleLeft + halfWidth),
    visibleRight - halfWidth,
  );

  return {
    left: clampedCenter,
    width,
  };
}

export interface HtmlTableResizeControllerOptions {
  getView: () => EditorView;
  handleWidth: number;
  lastColumnResizable: boolean;
  options: Pick<HtmlTableTiptapOptions, 'cellMinWidth' | 'resizable'>;
  root: HTMLDivElement;
}

export class HtmlTableResizeController {
  private readonly getView: () => EditorView;
  private readonly root: HTMLDivElement;
  private readonly options: Pick<HtmlTableTiptapOptions, 'cellMinWidth' | 'resizable'>;
  private readonly handleWidth: number;
  private readonly lastColumnResizable: boolean;
  private readonly resizersParent: HTMLDivElement;
  private readonly resizeLifecycle: TableResizeLifecycle;
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
  private readonly onDocumentMouseMove = (event: MouseEvent) => this.handleResizeMove(event);
  private readonly onDocumentMouseUp = () => this.finishResize();

  constructor(options: HtmlTableResizeControllerOptions) {
    this.getView = options.getView;
    this.root = options.root;
    this.options = options.options;
    this.handleWidth = options.handleWidth;
    this.lastColumnResizable = options.lastColumnResizable;
    this.resizersParent = this.root.ownerDocument.createElement('div');
    this.resizersParent.className = 'html-table-overlay__resizers';
    this.resizeLifecycle = new TableResizeLifecycle(
      this.root.ownerDocument,
      this.onDocumentMouseMove,
      this.onDocumentMouseUp,
    );
    this.root.append(this.resizersParent);
  }

  destroy(): void {
    this.clearActiveResize(false);
    this.resizeLifecycle.destroy();
    this.resizeHandles = [];
  }

  render(
    interaction: HtmlTableInteractionState,
    tablePos: number,
    geometry: ReturnType<typeof measureHtmlTableGeometry>,
    tableLeft: number,
    visibleTableTop: number,
    visibleTableHeight: number,
  ): void {
    const count = this.options.resizable ? geometry.columns.length : 0;
    this.syncResizeHandleCount(count);

    for (const column of geometry.columns) {
      const resizeHandle = this.resizeHandles[column.index];
      if (!resizeHandle) continue;
      const layout = getHtmlTableResizeHandleLayout(geometry, tableLeft, column.index, this.handleWidth);

      resizeHandle.dataset.index = String(column.index);
      resizeHandle.setAttribute('aria-label', `Resize column ${column.index + 1}`);
      resizeHandle.title = `Resize column ${column.index + 1}`;
      resizeHandle.style.width = `${layout?.width ?? Math.max(1, this.handleWidth)}px`;
      resizeHandle.style.left = `${layout?.left ?? tableLeft + column.left + column.width}px`;
      resizeHandle.style.top = `${visibleTableTop}px`;
      resizeHandle.style.height = `${visibleTableHeight}px`;
      resizeHandle.hidden =
        !layout
        || !isHtmlTableResizeHandleVisible(
          interaction,
          tablePos,
          column.index,
          this.isColumnResizable(column.index, geometry.columns.length),
        );
      resizeHandle.classList.toggle(
        'is-active',
        interaction.resizing?.tablePos === tablePos && interaction.resizing.columnIndex === column.index,
      );
    }

    this.root.classList.toggle('html-table-overlay--resizing', Boolean(interaction.resizing));
  }

  private get view(): EditorView {
    return this.getView();
  }

  private syncResizeHandleCount(count: number): void {
    while (this.resizeHandles.length < count) {
      const handle = this.createResizeHandle();
      this.resizeHandles.push(handle);
      this.resizersParent.append(handle);
    }

    while (this.resizeHandles.length > count) {
      this.resizeHandles.pop()?.remove();
    }
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

    this.resizeLifecycle.start();
    this.dispatchInteractionMeta({
      resizing: {
        tablePos: activeTable.tablePos,
        columnIndex: index,
      },
    });
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
    applyTableColumnPreviewWidths(context.dom, nextWidths, this.options.cellMinWidth);
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
        applyTableColumnPreviewWidths(context.dom, this.activeResize.startWidths, this.options.cellMinWidth);
      }
    }

    this.resizeLifecycle.stop();
    this.activeResize = null;
    this.root.classList.remove('html-table-overlay--resizing');

    if (clearInteractionState) {
      this.dispatchInteractionMeta({
        resizing: null,
      });
    }
  }

  private dispatchInteractionMeta(meta: {
    geometry?: ReturnType<typeof measureHtmlTableGeometry> | null;
    resizing?: { tablePos: number; columnIndex: number } | null;
  }): void {
    this.view.dispatch(this.view.state.tr.setMeta(htmlTableInteractionPluginKey, meta));
  }

  private isColumnResizable(index: number, totalColumns: number): boolean {
    if (!this.options.resizable) return false;
    if (index < 0 || index >= totalColumns) return false;
    if (this.lastColumnResizable) return true;
    return index < totalColumns - 1;
  }
}
