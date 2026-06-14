import { mergeAttributes, type NodeViewRendererProps } from '@tiptap/core';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { ViewMutationRecord } from 'prosemirror-view';

import { createS1000DTableAdapter } from './adapter.js';
import { resolveColspecs } from './cals/index.js';
import { ensureS1000DTableStyles } from './styles.js';
import type { S1000DTableTiptapOptions } from './tiptap.js';

const S1000D_TABLE_WRAPPER_CLASS = 's1000d-table-node__wrapper';
const S1000D_TABLE_CLASS = 's1000d-table-node__table';
const S1000D_SELECTED_TABLE_CLASS = 's1000d-table-node--selected';

export class S1000DTableNodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  private readonly wrapper: HTMLElement;
  private readonly table: HTMLTableElement;
  private node: ProseMirrorNode;
  private readonly options: S1000DTableTiptapOptions;
  private readonly htmlAttributes: Record<string, unknown>;

  constructor(props: NodeViewRendererProps, options: S1000DTableTiptapOptions) {
    this.node = props.node;
    this.options = options;
    this.htmlAttributes = mergeAttributes(this.options.HTMLAttributes, props.HTMLAttributes);
    ensureS1000DTableStyles(document);

    this.wrapper = document.createElement('div');
    this.wrapper.className = S1000D_TABLE_WRAPPER_CLASS;
    this.wrapper.dataset.s1000dTableWrapper = 'true';
    this.wrapper.dataset.testid = 's1000d-table-wrapper';
    this.wrapper.style.position = 'relative';

    this.table = document.createElement('table');
    this.table.className = S1000D_TABLE_CLASS;
    this.table.dataset.s1000dTable = 'true';
    this.table.dataset.testid = 's1000d-table';

    this.wrapper.append(this.table);
    this.dom = this.wrapper;
    this.contentDOM = this.table;

    this.applyAttributes();
    this.syncWrapperState();
    this.syncColumnState();
  }

  update(node: ProseMirrorNode): boolean {
    if (node.type !== this.node.type) {
      return false;
    }

    this.node = node;
    this.applyAttributes();
    this.syncWrapperState();
    this.syncColumnState();
    return true;
  }

  selectNode(): void {
    this.wrapper.classList.add(S1000D_SELECTED_TABLE_CLASS);
    this.table.classList.add(S1000D_SELECTED_TABLE_CLASS);
  }

  deselectNode(): void {
    this.wrapper.classList.remove(S1000D_SELECTED_TABLE_CLASS);
    this.table.classList.remove(S1000D_SELECTED_TABLE_CLASS);
  }

  stopEvent(event: Event): boolean {
    if (!(event.target instanceof Node)) {
      return false;
    }

    return this.wrapper.contains(event.target) && !this.table.contains(event.target);
  }

  ignoreMutation(mutation: ViewMutationRecord): boolean {
    if (mutation.type === 'selection' || !(mutation.target instanceof Node)) {
      return false;
    }

    if (mutation.type === 'attributes' && mutation.target instanceof Element) {
      if (mutation.target === this.table && mutation.attributeName === 'style') {
        return true;
      }

      if (
        mutation.target.nodeName === 'COL'
        && this.table.contains(mutation.target)
        && (mutation.attributeName === 'style' || mutation.attributeName === 'width')
      ) {
        return true;
      }
    }

    return this.wrapper.contains(mutation.target) && !this.table.contains(mutation.target);
  }

  private applyAttributes(): void {
    const isSelected = this.table.classList.contains(S1000D_SELECTED_TABLE_CLASS);

    for (const attributeName of this.table.getAttributeNames()) {
      this.table.removeAttribute(attributeName);
    }

    this.table.className = S1000D_TABLE_CLASS;
    this.table.dataset.s1000dTable = 'true';
    this.table.dataset.testid = 's1000d-table';

    for (const [name, value] of Object.entries(this.htmlAttributes)) {
      if (value === null || value === undefined || value === false) {
        continue;
      }

      this.table.setAttribute(name, String(value));
    }

    this.table.classList.toggle(S1000D_SELECTED_TABLE_CLASS, isSelected);
  }

  private syncColumnState(): void {
    const firstTgroup = createS1000DTableAdapter().getTgroups(this.node)[0];
    if (!firstTgroup) {
      return;
    }

    const widths = resolveColspecs(firstTgroup).map((colspec) => colspec.colwidth?.trim() ?? '');
    const colElements = Array.from(this.table.querySelectorAll('col'));
    colElements.forEach((col, index) => {
      const width = widths[index] ?? '';
      if (!width) {
        col.removeAttribute('width');
        (col as HTMLElement).style.removeProperty('width');
        return;
      }

      col.setAttribute('width', width);
      (col as HTMLElement).style.width = width;
    });
  }

  private syncWrapperState(): void {
    const isSelected = this.wrapper.classList.contains(S1000D_SELECTED_TABLE_CLASS);
    this.wrapper.className = S1000D_TABLE_WRAPPER_CLASS;
    this.wrapper.classList.toggle(S1000D_SELECTED_TABLE_CLASS, isSelected);
    this.wrapper.dataset.s1000dTableWrapper = 'true';
    this.wrapper.dataset.testid = 's1000d-table-wrapper';
  }
}
