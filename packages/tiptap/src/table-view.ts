import { mergeAttributes, type NodeViewRendererProps } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { ViewMutationRecord } from '@tiptap/pm/view';

import type { HtmlTableTiptapOptions } from './options.js';
import { applyColumnWidths, getTableColumnWidths } from './table-utils.js';

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
  private removeListeners: (() => void) | undefined;

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
    const target = event.target as HTMLElement | null;
    return Boolean(target?.closest('.html-table-node__resize-handle'));
  }

  ignoreMutation(mutation: ViewMutationRecord): boolean {
    if (mutation.type === 'selection') return false;
    return this.handles.contains(mutation.target);
  }

  destroy(): void {
    this.removeListeners?.();
  }

  private applyAttributes(): void {
    for (const [name, value] of Object.entries(this.htmlAttributes)) {
      if (value === null || value === undefined || value === false) continue;
      this.table.setAttribute(name, String(value));
    }
  }

  private syncViewState(): void {
    const widths = getTableColumnWidths(this.node, this.options.cellMinWidth);
    const totalWidth = widths.reduce((sum, width) => sum + width, 0);

    this.table.style.tableLayout = this.options.resizable ? 'fixed' : '';
    this.table.style.minWidth = `${Math.max(this.options.cellMinWidth, totalWidth)}px`;
    this.handles.style.display = this.options.resizable ? '' : 'none';

    requestAnimationFrame(() => {
      this.applyColumnStyles(widths);
      this.renderHandles(widths);
    });
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

  private renderHandles(widths: number[]): void {
    this.removeListeners?.();
    this.handles.replaceChildren();

    if (!this.options.resizable || widths.length === 0) return;

    this.handles.style.width = `${widths.reduce((sum, width) => sum + width, 0)}px`;
    const stopIndex = this.options.lastColumnResizable ? widths.length : widths.length - 1;
    let left = 0;
    const cleanup: Array<() => void> = [];

    for (let columnIndex = 0; columnIndex < stopIndex; columnIndex += 1) {
      left += widths[columnIndex] ?? 0;
      const handle = document.createElement('div');
      handle.className = 'html-table-node__resize-handle';
      handle.style.width = `${this.options.handleWidth}px`;
      handle.style.left = `${left - this.options.handleWidth / 2}px`;

      const onMouseDown = (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();

        const startX = event.clientX;
        const startWidth = widths[columnIndex] ?? this.options.cellMinWidth;
        const onMouseMove = (moveEvent: MouseEvent) => {
          const delta = moveEvent.clientX - startX;
          const nextWidths = [...widths];
          nextWidths[columnIndex] = Math.max(this.options.cellMinWidth, startWidth + delta);
          this.applyColumnStyles(nextWidths);
          this.handles.style.width = `${nextWidths.reduce((sum, width) => sum + width, 0)}px`;
          let nextLeft = 0;

          Array.from(this.handles.children).forEach((child, index) => {
            nextLeft += nextWidths[index] ?? 0;
            (child as HTMLElement).style.left = `${nextLeft - this.options.handleWidth / 2}px`;
          });
        };
        const onMouseUp = (upEvent: MouseEvent) => {
          const delta = upEvent.clientX - startX;
          const nextWidths = [...widths];
          nextWidths[columnIndex] = Math.max(this.options.cellMinWidth, startWidth + delta);
          this.commitWidths(nextWidths);
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp, { once: true });
      };

      handle.addEventListener('mousedown', onMouseDown);
      cleanup.push(() => handle.removeEventListener('mousedown', onMouseDown));
      this.handles.append(handle);
    }

    this.removeListeners = () => {
      cleanup.forEach((dispose) => dispose());
      this.removeListeners = undefined;
    };
  }

  private commitWidths(widths: number[]): void {
    const tablePos = this.getPos();
    if (typeof tablePos !== 'number') return;

    const resizedTable = applyColumnWidths(this.node, widths);
    this.view.dispatch(
      this.view.state.tr.replaceWith(tablePos, tablePos + this.node.nodeSize, resizedTable),
    );
  }
}
