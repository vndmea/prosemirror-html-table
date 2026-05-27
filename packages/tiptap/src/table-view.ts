import { mergeAttributes, type NodeViewRendererProps } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { ViewMutationRecord } from '@tiptap/pm/view';

import type { HtmlTableTiptapOptions } from './options.js';
import { getTableColumnWidths } from './table-utils.js';

export class HtmlTableNodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  private readonly wrapper: HTMLElement;
  private readonly table: HTMLTableElement;
  private node: ProseMirrorNode;
  private readonly options: HtmlTableTiptapOptions;
  private readonly htmlAttributes: Record<string, unknown>;

  constructor(props: NodeViewRendererProps, options: HtmlTableTiptapOptions) {
    this.node = props.node;
    this.options = options;
    this.htmlAttributes = mergeAttributes(this.options.HTMLAttributes, props.HTMLAttributes);

    this.wrapper = document.createElement('div');
    this.wrapper.className = this.options.wrapperClassName;
    this.wrapper.dataset.htmlTableWrapper = 'true';

    this.table = document.createElement('table');
    this.table.className = 'html-table-node__table';
    this.table.dataset.htmlTable = 'true';

    this.wrapper.append(this.table);
    this.dom = this.wrapper;
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

  stopEvent(_event: Event): boolean {
    if (!(_event.target instanceof Node)) return false;
    return this.wrapper.contains(_event.target) && !this.table.contains(_event.target);
  }

  ignoreMutation(mutation: ViewMutationRecord): boolean {
    if (mutation.type === 'selection' || !(mutation.target instanceof Node)) {
      return false;
    }

    return this.wrapper.contains(mutation.target) && !this.table.contains(mutation.target);
  }

  private applyAttributes(): void {
    for (const attributeName of this.table.getAttributeNames()) {
      this.table.removeAttribute(attributeName);
    }

    this.table.className = 'html-table-node__table';
    this.table.dataset.htmlTable = 'true';

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
    this.table.style.width = this.options.resizable ? `${totalWidth}px` : '';

    const colElements = Array.from(this.table.querySelectorAll('col'));
    colElements.forEach((col, index) => {
      const width = widths[index];
      if (!width) return;

      col.setAttribute('width', String(width));
      (col as HTMLElement).style.width = `${width}px`;
    });
  }
}
