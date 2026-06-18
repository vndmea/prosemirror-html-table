import { mergeAttributes, type NodeViewRendererProps } from '@tiptap/core';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { ViewMutationRecord } from 'prosemirror-view';

import { createS1000DTableAdapter } from './adapter.js';
import { resolveColspecs, resolveEntryColSpan, resolveEntryRowSpan } from './cals/index.js';
import { ensureS1000DTableStyles } from './styles.js';
import type { S1000DTableTiptapOptions } from './tiptap.js';
import { s1000dTableNodeNames } from './names.js';

const S1000D_TABLE_WRAPPER_CLASS = 's1000d-table-node__wrapper';
const S1000D_TABLE_CLASS = 's1000d-table-node__table';
const S1000D_SELECTED_TABLE_CLASS = 's1000d-table-node--selected';

export class S1000DTableNodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  private readonly wrapper: HTMLElement;
  private readonly table: HTMLTableElement;
  private syncFrame: number | null = null;
  private ignoreMutationFrame: number | null = null;
  private ignoreTableMutations = false;
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
    this.syncRenderedState();
    this.scheduleRenderedStateSync();
  }

  update(node: ProseMirrorNode): boolean {
    if (node.type !== this.node.type) {
      return false;
    }

    if (node === this.node) {
      return true;
    }

    this.node = node;
    this.applyAttributes();
    this.syncWrapperState();
    this.syncRenderedState();
    this.scheduleRenderedStateSync();
    return true;
  }

  destroy(): void {
    if (this.syncFrame !== null) {
      cancelAnimationFrame(this.syncFrame);
      this.syncFrame = null;
    }
    if (this.ignoreMutationFrame !== null) {
      cancelAnimationFrame(this.ignoreMutationFrame);
      this.ignoreMutationFrame = null;
    }
    this.ignoreTableMutations = false;
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

    if (this.ignoreTableMutations && this.table.contains(mutation.target)) {
      return true;
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

      if (
        (mutation.target.nodeName === 'TD' || mutation.target.nodeName === 'TH')
        && this.table.contains(mutation.target)
        && (mutation.attributeName === 'rowspan' || mutation.attributeName === 'colspan')
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

    const widths = getS1000DColumnPixelWidths(firstTgroup, this.options.cellMinWidth);
    const totalWidth = widths.reduce((sum, width) => sum + width, 0);
    const minimumWidth = Math.max(this.options.cellMinWidth, totalWidth);

    this.table.style.tableLayout = this.options.resizable ? 'fixed' : '';
    this.table.style.minWidth = `${minimumWidth}px`;
    this.table.style.width = this.options.resizable ? `${minimumWidth}px` : '';

    const colElements = Array.from(this.table.querySelectorAll('col'));
    colElements.forEach((col, index) => {
      const width = widths[index];
      if (!width) {
        col.removeAttribute('width');
        (col as HTMLElement).style.removeProperty('width');
        return;
      }

      col.setAttribute('width', String(width));
      (col as HTMLElement).style.width = `${width}px`;
    });
  }

  private syncWrapperState(): void {
    const isSelected = this.wrapper.classList.contains(S1000D_SELECTED_TABLE_CLASS);
    this.wrapper.className = S1000D_TABLE_WRAPPER_CLASS;
    this.wrapper.classList.toggle(S1000D_SELECTED_TABLE_CLASS, isSelected);
    this.wrapper.dataset.s1000dTableWrapper = 'true';
    this.wrapper.dataset.testid = 's1000d-table-wrapper';
  }

  private syncEntrySpanState(): void {
    const { entryNodes, spanByEntryNode } = collectRenderedEntrySpans(this.node);
    const entryCells = Array.from(this.table.querySelectorAll<HTMLTableCellElement>('td[data-s1000d="entry"], th[data-s1000d="entry"]'));
    const count = Math.min(entryNodes.length, entryCells.length);

    for (let index = 0; index < count; index += 1) {
      const entryNode = entryNodes[index];
      const cell = entryCells[index];
      if (!entryNode || !cell) {
        continue;
      }

      const span = spanByEntryNode.get(entryNode);
      const rowSpan = Math.max(1, span?.rowSpan ?? 1);
      const colSpan = Math.max(1, span?.colSpan ?? 1);

      if (rowSpan > 1) {
        cell.rowSpan = rowSpan;
      } else {
        cell.removeAttribute('rowspan');
      }

      if (colSpan > 1) {
        cell.colSpan = colSpan;
      } else {
        cell.removeAttribute('colspan');
      }
    }
  }

  private scheduleRenderedStateSync(): void {
    if (this.syncFrame !== null) {
      cancelAnimationFrame(this.syncFrame);
    }

    this.syncFrame = requestAnimationFrame(() => {
      this.syncFrame = null;
      this.syncRenderedState();
    });
  }

  private syncRenderedState(): void {
    this.ignoreTableMutations = true;
    if (this.ignoreMutationFrame !== null) {
      cancelAnimationFrame(this.ignoreMutationFrame);
    }
    this.syncColumnState();
    this.syncEntrySpanState();
    this.ignoreMutationFrame = requestAnimationFrame(() => {
      this.ignoreMutationFrame = null;
      this.ignoreTableMutations = false;
    });
  }
}

function getS1000DColumnPixelWidths(tgroup: ProseMirrorNode, cellMinWidth: number): number[] {
  const resolvedColspecs = resolveColspecs(tgroup);
  const grid = createS1000DTableAdapter().createGrid(tgroup, 0);
  const columnCount = Math.max(
    1,
    grid.width,
    resolvedColspecs.reduce((max, colspec) => Math.max(max, colspec.index + 1), 0),
  );
  const widths = Array.from({ length: columnCount }, () => cellMinWidth);

  for (const colspec of resolvedColspecs) {
    const width = parseS1000DPixelWidth(colspec.colwidth);
    if (width) {
      widths[colspec.index] = width;
    }
  }

  return widths;
}

function collectRenderedEntrySpans(node: ProseMirrorNode): {
  entryNodes: ProseMirrorNode[];
  spanByEntryNode: Map<ProseMirrorNode, { rowSpan: number; colSpan: number }>;
} {
  const spanByEntryNode = new Map<ProseMirrorNode, { rowSpan: number; colSpan: number }>();
  const adapter = createS1000DTableAdapter();

  adapter.getTgroups(node).forEach((tgroup) => {
    tgroup.descendants((descendant) => {
      if (descendant.type.name !== s1000dTableNodeNames.entry) {
        return true;
      }

      spanByEntryNode.set(descendant, {
        rowSpan: resolveEntryRowSpan(descendant),
        colSpan: resolveEntryColSpan(descendant, tgroup),
      });
      return true;
    });
  });

  const entryNodes: ProseMirrorNode[] = [];
  node.descendants((descendant) => {
    if (descendant.type.name === s1000dTableNodeNames.entry) {
      entryNodes.push(descendant);
    }
    return true;
  });

  return {
    entryNodes,
    spanByEntryNode,
  };
}

function parseS1000DPixelWidth(value: string | null): number | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const exactPixels = normalized.match(/^(\d+(?:\.\d+)?)px$/);
  if (exactPixels) {
    const parsed = Number.parseFloat(exactPixels[1] ?? '');
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
  }

  const bareNumber = Number.parseFloat(normalized);
  return Number.isFinite(bareNumber) && bareNumber > 0 && /^\d+(?:\.\d+)?$/.test(normalized)
    ? Math.round(bareNumber)
    : null;
}
