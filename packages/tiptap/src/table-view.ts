import { mergeAttributes, type NodeViewRendererProps } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { ViewMutationRecord } from '@tiptap/pm/view';

import type { HtmlTableTiptapOptions } from './options.js';
import { createColumnResizeTransaction, getTableColumnWidths, measureRenderedColumnBoundaries } from './table-utils.js';

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
  private readonly handles: HTMLDivElement;
  private node: ProseMirrorNode;
  private readonly getPos: NodeViewRendererProps['getPos'];
  private readonly view: NodeViewRendererProps['view'];
  private readonly options: HtmlTableTiptapOptions;
  private readonly htmlAttributes: Record<string, unknown>;
  private removeHandleListeners: (() => void) | undefined;
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
    this.table = document.createElement('table');
    this.table.className = 'html-table-node__table';
    this.handles = document.createElement('div');
    this.handles.className = 'html-table-node__handles';

    const shouldWrap = this.options.renderWrapper || this.options.resizable;
    if (shouldWrap) {
      this.wrapper.append(this.table, this.handles);
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

    const target = event.target as HTMLElement | null;
    return Boolean(target?.closest('.html-table-node__resize-handle'));
  }

  ignoreMutation(mutation: ViewMutationRecord): boolean {
    if (this.activeResize) return true;
    if (mutation.type === 'selection') return false;
    return this.handles.contains(mutation.target);
  }

  destroy(): void {
    this.finishActiveResize(false);
    this.removeHandleListeners?.();
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
    this.handles.style.display = this.options.resizable ? '' : 'none';

    if (this.layoutFrame) {
      cancelAnimationFrame(this.layoutFrame);
    }

    this.layoutFrame = requestAnimationFrame(() => {
      this.layoutFrame = 0;
      this.applyRenderedWidths(widths);
      this.renderHandles(widths.length);
      this.syncHandlePositions();
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
    this.removeHandleListeners?.();
    this.handles.replaceChildren();

    if (!this.options.resizable || columnCount === 0) return;

    const stopIndex = this.options.lastColumnResizable ? columnCount : columnCount - 1;
    const cleanup: Array<() => void> = [];

    for (let columnIndex = 0; columnIndex < stopIndex; columnIndex += 1) {
      const handle = document.createElement('div');
      handle.className = 'html-table-node__resize-handle';
      handle.style.width = `${this.options.handleWidth}px`;
      const onPointerDown = (event: PointerEvent) => this.startResize(event, columnIndex, handle);

      handle.addEventListener('pointerdown', onPointerDown);
      cleanup.push(() => handle.removeEventListener('pointerdown', onPointerDown));
      this.handles.append(handle);
    }

    this.removeHandleListeners = () => {
      cleanup.forEach((dispose) => dispose());
      this.removeHandleListeners = undefined;
    };
  }

  private syncHandlePositions(): void {
    if (!this.options.resizable || this.handles.childElementCount === 0) return;

    const boundaries = measureRenderedColumnBoundaries(this.table);
    const totalWidth = boundaries[boundaries.length - 1] ?? 0;

    this.handles.style.width = `${totalWidth}px`;
    Array.from(this.handles.children).forEach((child, index) => {
      const boundary = boundaries[index + 1] ?? totalWidth;
      (child as HTMLElement).style.left = `${boundary - this.options.handleWidth / 2}px`;
    });
  }

  private startResize(event: PointerEvent, columnIndex: number, handle: HTMLDivElement): void {
    if (event.button !== 0 || this.activeResize) return;

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
