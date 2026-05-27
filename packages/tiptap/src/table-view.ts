import { mergeAttributes, type NodeViewRendererProps } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { ViewMutationRecord } from '@tiptap/pm/view';

import type { HtmlTableTiptapOptions } from './options.js';
import {
  measureRenderedColumnBoundaries,
  measureRenderedRowBoundaries,
} from './table-dom.js';
import {
  createColumnResizeTransaction,
  createColumnSelectionTransaction,
  createRowSelectionTransaction,
  getTableColumnWidths,
} from './table-utils.js';

interface ActiveColumnResize {
  pointerId: number;
  columnIndex: number;
  startX: number;
  startWidth: number;
  baseWidths: number[];
  previewWidths: number[];
  handle: HTMLDivElement;
  dispose: () => void;
}

export class HtmlTableNodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  private readonly wrapper: HTMLElement;
  private readonly table: HTMLTableElement;
  private readonly resizeHandles: HTMLDivElement;
  private readonly rowHandles: HTMLDivElement;
  private readonly columnHandles: HTMLDivElement;
  private node: ProseMirrorNode;
  private readonly getPos: NodeViewRendererProps['getPos'];
  private readonly view: NodeViewRendererProps['view'];
  private readonly options: HtmlTableTiptapOptions;
  private readonly htmlAttributes: Record<string, unknown>;
  private removeResizeHandleListeners: (() => void) | undefined;
  private removeSelectionHandleListeners: (() => void) | undefined;
  private currentWidths: number[] = [];
  private activeResize: ActiveColumnResize | undefined;
  private layoutFrame = 0;
  private restoreDomState: (() => void) | undefined;

  constructor(props: NodeViewRendererProps, options: HtmlTableTiptapOptions) {
    this.node = props.node;
    this.getPos = props.getPos;
    this.view = props.view;
    this.options = options;
    this.htmlAttributes = mergeAttributes(this.options.HTMLAttributes, props.HTMLAttributes);

    this.wrapper = document.createElement('div');
    this.wrapper.className = this.options.wrapperClassName;
    this.wrapper.dataset.htmlTableWrapper = 'true';
    this.table = document.createElement('table');
    this.table.className = 'html-table-node__table';
    this.table.dataset.htmlTable = 'true';
    this.resizeHandles = document.createElement('div');
    this.resizeHandles.className = 'html-table-node__handles';
    this.rowHandles = document.createElement('div');
    this.rowHandles.className = 'html-table-node__row-handles';
    this.columnHandles = document.createElement('div');
    this.columnHandles.className = 'html-table-node__column-handles';

    const shouldWrap = this.options.renderWrapper || this.options.resizable || this.options.renderLegacyControls;
    if (shouldWrap) {
      this.wrapper.append(this.table, this.resizeHandles, this.rowHandles, this.columnHandles);
      this.dom = this.wrapper;
    } else {
      this.dom = this.table;
    }

    this.contentDOM = this.table;
    this.applyAttributes();
    this.syncViewState();
  }

  update(node: ProseMirrorNode): boolean {
    if (node.type !== this.node.type) return false;

    if (this.activeResize) {
      this.finishActiveResize(false);
    }

    this.node = node;
    this.applyAttributes();
    this.syncViewState();
    return true;
  }

  selectNode(): void {
    this.wrapper.classList.add(this.options.selectedTableClassName);
    this.table.classList.add(this.options.selectedTableClassName);
  }

  deselectNode(): void {
    this.wrapper.classList.remove(this.options.selectedTableClassName);
    this.table.classList.remove(this.options.selectedTableClassName);
  }

  stopEvent(event: Event): boolean {
    if (this.activeResize) return true;
    if (!this.options.renderLegacyControls) return false;

    const target = event.target as HTMLElement | null;
    return Boolean(target?.closest('.html-table-node__resize-handle, .html-table-node__selection-handle'));
  }

  ignoreMutation(mutation: ViewMutationRecord): boolean {
    if (this.activeResize) return true;
    if (mutation.type === 'selection') return false;
    if (!this.options.renderLegacyControls) return false;
    return (
      this.resizeHandles.contains(mutation.target)
      || this.rowHandles.contains(mutation.target)
      || this.columnHandles.contains(mutation.target)
    );
  }

  destroy(): void {
    this.finishActiveResize(false);
    this.removeResizeHandleListeners?.();
    this.removeSelectionHandleListeners?.();
    if (this.layoutFrame) {
      cancelAnimationFrame(this.layoutFrame);
      this.layoutFrame = 0;
    }
  }

  private applyAttributes(): void {
    for (const [name, value] of Object.entries(this.htmlAttributes)) {
      if (value === null || value === undefined || value === false) continue;
      this.table.setAttribute(name, String(value));
    }
  }

  private syncViewState(): void {
    const widths = getTableColumnWidths(this.node, this.options.cellMinWidth);
    this.currentWidths = widths;

    this.table.style.tableLayout = this.options.resizable ? 'fixed' : '';
    this.applyRenderedWidths(widths);
    this.resizeHandles.style.display = this.options.renderLegacyControls && this.options.resizable ? '' : 'none';
    this.rowHandles.style.display = this.options.renderLegacyControls ? '' : 'none';
    this.columnHandles.style.display = this.options.renderLegacyControls ? '' : 'none';

    if (this.layoutFrame) {
      cancelAnimationFrame(this.layoutFrame);
    }

    this.layoutFrame = requestAnimationFrame(() => {
      this.layoutFrame = 0;
      this.applyRenderedWidths(widths);
      if (this.options.renderLegacyControls) {
        this.renderHandles(widths.length);
        this.syncHandlePositions();
        this.renderSelectionHandles(widths.length, this.table.rows.length);
        this.syncSelectionHandlePositions();
      } else {
        this.removeResizeHandleListeners?.();
        this.removeSelectionHandleListeners?.();
        this.resizeHandles.replaceChildren();
        this.rowHandles.replaceChildren();
        this.columnHandles.replaceChildren();
      }
    });
  }

  private applyRenderedWidths(widths: number[]): void {
    const totalWidth = widths.reduce((sum, width) => sum + width, 0);

    this.table.style.minWidth = `${Math.max(this.options.cellMinWidth, totalWidth)}px`;
    this.table.style.width = this.options.resizable ? `${totalWidth}px` : '';
    this.applyColumnStyles(widths);
  }

  private applyColumnStyles(widths: number[]): void {
    const colElements = Array.from(this.table.querySelectorAll('col'));

    colElements.forEach((col, index) => {
      const width = widths[index];
      if (!width) return;

      col.setAttribute('width', String(width));
      (col as HTMLElement).style.width = `${width}px`;
    });
  }

  private renderHandles(columnCount: number): void {
    this.removeResizeHandleListeners?.();
    this.resizeHandles.replaceChildren();

    if (!this.options.renderLegacyControls || !this.options.resizable || columnCount === 0) return;

    const stopIndex = this.options.lastColumnResizable ? columnCount : columnCount - 1;
    const cleanup: Array<() => void> = [];

    for (let columnIndex = 0; columnIndex < stopIndex; columnIndex += 1) {
      const handle = document.createElement('div');
      handle.className = 'html-table-node__resize-handle';
      handle.style.width = `${this.options.handleWidth}px`;
      const onPointerDown = (event: PointerEvent) => this.startResize(event, columnIndex, handle);

      handle.addEventListener('pointerdown', onPointerDown);
      cleanup.push(() => handle.removeEventListener('pointerdown', onPointerDown));
      this.resizeHandles.append(handle);
    }

    this.removeResizeHandleListeners = () => {
      cleanup.forEach((dispose) => dispose());
      this.removeResizeHandleListeners = undefined;
    };
  }

  private syncHandlePositions(): void {
    if (!this.options.renderLegacyControls || !this.options.resizable || this.resizeHandles.childElementCount === 0) return;

    const boundaries = measureRenderedColumnBoundaries(this.table);
    const totalWidth = boundaries[boundaries.length - 1] ?? 0;

    this.resizeHandles.style.width = `${totalWidth}px`;
    Array.from(this.resizeHandles.children).forEach((child, index) => {
      const boundary = boundaries[index + 1] ?? totalWidth;
      (child as HTMLElement).style.left = `${boundary - this.options.handleWidth / 2}px`;
    });
  }

  private renderSelectionHandles(columnCount: number, rowCount: number): void {
    this.removeSelectionHandleListeners?.();
    this.rowHandles.replaceChildren();
    this.columnHandles.replaceChildren();

    if (!this.options.renderLegacyControls) return;
    if (columnCount === 0 && rowCount === 0) return;

    const cleanup: Array<() => void> = [];

    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      const handle = document.createElement('button');
      handle.type = 'button';
      handle.className = 'html-table-node__selection-handle html-table-node__row-select-handle';
      handle.setAttribute('aria-label', `Select row ${rowIndex + 1}`);
      const onPointerDown = (event: PointerEvent) => this.handleRowSelection(event, rowIndex);

      handle.addEventListener('pointerdown', onPointerDown);
      cleanup.push(() => handle.removeEventListener('pointerdown', onPointerDown));
      this.rowHandles.append(handle);
    }

    for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
      const handle = document.createElement('button');
      handle.type = 'button';
      handle.className = 'html-table-node__selection-handle html-table-node__column-select-handle';
      handle.setAttribute('aria-label', `Select column ${columnIndex + 1}`);
      const onPointerDown = (event: PointerEvent) => this.handleColumnSelection(event, columnIndex);

      handle.addEventListener('pointerdown', onPointerDown);
      cleanup.push(() => handle.removeEventListener('pointerdown', onPointerDown));
      this.columnHandles.append(handle);
    }

    this.removeSelectionHandleListeners = () => {
      cleanup.forEach((dispose) => dispose());
      this.removeSelectionHandleListeners = undefined;
    };
  }

  private syncSelectionHandlePositions(): void {
    if (!this.options.renderLegacyControls) return;

    const columnBoundaries = measureRenderedColumnBoundaries(this.table);
    const rowBoundaries = measureRenderedRowBoundaries(this.table);
    const tableTop = this.table.offsetTop;
    const tableLeft = this.table.offsetLeft;
    const tableHeight = rowBoundaries[rowBoundaries.length - 1] ?? 0;
    const tableWidth = columnBoundaries[columnBoundaries.length - 1] ?? 0;

    this.rowHandles.style.top = `${tableTop}px`;
    this.rowHandles.style.left = '0px';
    this.rowHandles.style.width = `${tableLeft}px`;
    this.rowHandles.style.height = `${tableHeight}px`;

    this.columnHandles.style.top = '0px';
    this.columnHandles.style.height = `${tableTop}px`;
    this.columnHandles.style.left = `${tableLeft}px`;
    this.columnHandles.style.width = `${tableWidth}px`;

    Array.from(this.rowHandles.children).forEach((child, index) => {
      const top = rowBoundaries[index] ?? 0;
      const bottom = rowBoundaries[index + 1] ?? top;
      const center = top + (bottom - top) / 2;
      (child as HTMLElement).style.top = `${center}px`;
    });

    Array.from(this.columnHandles.children).forEach((child, index) => {
      const left = columnBoundaries[index] ?? 0;
      const right = columnBoundaries[index + 1] ?? left;
      const center = left + (right - left) / 2;
      (child as HTMLElement).style.left = `${center}px`;
    });
  }

  private handleRowSelection(event: PointerEvent, rowIndex: number): void {
    if (!this.options.renderLegacyControls) return;
    event.preventDefault();
    event.stopPropagation();

    const tablePos = this.getPos();
    if (typeof tablePos !== 'number') return;

    const transaction = createRowSelectionTransaction(this.view.state, tablePos, this.node, rowIndex);
    if (!transaction) return;

    this.view.dispatch(transaction);
  }

  private handleColumnSelection(event: PointerEvent, columnIndex: number): void {
    if (!this.options.renderLegacyControls) return;
    event.preventDefault();
    event.stopPropagation();

    const tablePos = this.getPos();
    if (typeof tablePos !== 'number') return;

    const transaction = createColumnSelectionTransaction(this.view.state, tablePos, this.node, columnIndex);
    if (!transaction) return;

    this.view.dispatch(transaction);
  }

  private startResize(event: PointerEvent, columnIndex: number, handle: HTMLDivElement): void {
    if (!this.options.renderLegacyControls || event.button !== 0 || this.activeResize) return;

    event.preventDefault();
    event.stopPropagation();

    const baseWidths = [...this.currentWidths];
    const startWidth = baseWidths[columnIndex] ?? this.options.cellMinWidth;
    const dispose = this.bindActiveResizeEvents(handle);

    this.activeResize = {
      pointerId: event.pointerId,
      columnIndex,
      startX: event.clientX,
      startWidth,
      baseWidths,
      previewWidths: baseWidths,
      handle,
      dispose,
    };

    handle.setPointerCapture(event.pointerId);
    this.setDomResizeState(true);
  }

  private bindActiveResizeEvents(handle: HTMLDivElement): () => void {
    handle.addEventListener('pointermove', this.onActivePointerMove);
    handle.addEventListener('pointerup', this.onActivePointerUp);
    handle.addEventListener('pointercancel', this.onActivePointerCancel);
    handle.addEventListener('lostpointercapture', this.onLostPointerCapture);

    return () => {
      handle.removeEventListener('pointermove', this.onActivePointerMove);
      handle.removeEventListener('pointerup', this.onActivePointerUp);
      handle.removeEventListener('pointercancel', this.onActivePointerCancel);
      handle.removeEventListener('lostpointercapture', this.onLostPointerCapture);
    };
  }

  private readonly onActivePointerMove = (event: PointerEvent): void => {
    const activeResize = this.activeResize;
    if (!activeResize || event.pointerId !== activeResize.pointerId) return;

    event.preventDefault();
    event.stopPropagation();

    const delta = event.clientX - activeResize.startX;
    const nextWidths = [...activeResize.baseWidths];
    nextWidths[activeResize.columnIndex] = Math.max(this.options.cellMinWidth, activeResize.startWidth + delta);
    activeResize.previewWidths = nextWidths;
    this.previewWidths(nextWidths);
  };

  private readonly onActivePointerUp = (event: PointerEvent): void => {
    const activeResize = this.activeResize;
    if (!activeResize || event.pointerId !== activeResize.pointerId) return;

    event.preventDefault();
    event.stopPropagation();
    this.finishActiveResize(true);
  };

  private readonly onActivePointerCancel = (event: PointerEvent): void => {
    const activeResize = this.activeResize;
    if (!activeResize || event.pointerId !== activeResize.pointerId) return;

    event.preventDefault();
    event.stopPropagation();
    this.finishActiveResize(false);
  };

  private readonly onLostPointerCapture = (event: PointerEvent): void => {
    const activeResize = this.activeResize;
    if (!activeResize || event.pointerId !== activeResize.pointerId) return;

    this.finishActiveResize(false);
  };

  private previewWidths(widths: number[]): void {
    this.applyRenderedWidths(widths);
    this.syncHandlePositions();
  }

  private finishActiveResize(commit: boolean): void {
    const activeResize = this.activeResize;
    if (!activeResize) return;

    this.activeResize = undefined;
    activeResize.dispose();

    if (activeResize.handle.hasPointerCapture(activeResize.pointerId)) {
      activeResize.handle.releasePointerCapture(activeResize.pointerId);
    }

    this.setDomResizeState(false);

    if (commit) {
      this.commitWidths(activeResize.previewWidths);
      return;
    }

    this.syncViewState();
  }

  private setDomResizeState(active: boolean): void {
    const document = this.view.dom.ownerDocument;
    const body = document.body;
    const root = document.documentElement;

    if (active) {
      if (this.restoreDomState) return;

      const previousBodyUserSelect = body.style.userSelect;
      const previousBodyCursor = body.style.cursor;
      const previousRootUserSelect = root.style.userSelect;
      const previousRootCursor = root.style.cursor;

      body.style.userSelect = 'none';
      body.style.cursor = 'col-resize';
      root.style.userSelect = 'none';
      root.style.cursor = 'col-resize';
      this.wrapper.classList.add('html-table-node__wrapper--resizing');

      this.restoreDomState = () => {
        body.style.userSelect = previousBodyUserSelect;
        body.style.cursor = previousBodyCursor;
        root.style.userSelect = previousRootUserSelect;
        root.style.cursor = previousRootCursor;
        this.wrapper.classList.remove('html-table-node__wrapper--resizing');
        this.restoreDomState = undefined;
      };

      return;
    }

    this.restoreDomState?.();
  }

  private commitWidths(widths: number[]): void {
    const tablePos = this.getPos();
    if (typeof tablePos !== 'number') return;

    this.view.dispatch(createColumnResizeTransaction(this.view.state, tablePos, this.node, widths));
  }
}
