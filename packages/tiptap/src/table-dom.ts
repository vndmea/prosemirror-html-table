import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { NodeSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

const HTML_TABLE_NODE_NAME = 'htmlTable';
const HTML_TABLE_SELECTOR = '[data-html-table], table';
const HTML_TABLE_WRAPPER_SELECTOR = '[data-html-table-wrapper], .html-table-node__wrapper';

export interface HtmlTableRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface HtmlTableColumnGeometry {
  index: number;
  left: number;
  width: number;
}

export interface HtmlTableRowGeometry {
  index: number;
  top: number;
  height: number;
}

export interface HtmlTableGeometry {
  tableRect: HtmlTableRect;
  columns: HtmlTableColumnGeometry[];
  rows: HtmlTableRowGeometry[];
}

export interface HtmlTableDOMContext {
  tablePos: number;
  table: ProseMirrorNode;
  dom: HTMLTableElement;
  wrapper: HTMLElement;
}

export function measureRenderedColumnBoundaries(table: HTMLTableElement): number[] {
  const tableRect = table.getBoundingClientRect();
  const activeRowSpans: number[] = [];
  const boundaries: Array<number | undefined> = [0];
  const spanningCells: Array<{ start: number; span: number; left: number; right: number }> = [];
  let width = 0;

  for (const row of Array.from(table.rows)) {
    let columnIndex = 0;

    for (const cell of Array.from(row.cells)) {
      while ((activeRowSpans[columnIndex] ?? 0) > 0) {
        columnIndex += 1;
      }

      const colSpan = Math.max(1, cell.colSpan || 1);
      const rowSpan = Math.max(1, cell.rowSpan || 1);
      const rect = cell.getBoundingClientRect();
      const left = rect.left - tableRect.left;
      const right = rect.right - tableRect.left;

      boundaries[columnIndex] = left;
      boundaries[columnIndex + colSpan] = right;
      width = Math.max(width, columnIndex + colSpan);

      if (colSpan > 1) {
        spanningCells.push({
          start: columnIndex,
          span: colSpan,
          left,
          right,
        });
      }

      for (let offset = 0; offset < colSpan; offset += 1) {
        activeRowSpans[columnIndex + offset] = Math.max(activeRowSpans[columnIndex + offset] ?? 0, rowSpan);
      }

      columnIndex += colSpan;
    }

    for (let index = 0; index < activeRowSpans.length; index += 1) {
      if ((activeRowSpans[index] ?? 0) > 0) {
        activeRowSpans[index] = (activeRowSpans[index] ?? 0) - 1;
      }
    }
  }

  const resolvedBoundaries = boundaries.slice(0, width + 1);
  resolvedBoundaries[0] ??= 0;
  resolvedBoundaries[width] ??= tableRect.width;

  for (const cell of spanningCells) {
    const start = cell.start;
    const end = cell.start + cell.span;

    if (resolvedBoundaries[start] === undefined) {
      resolvedBoundaries[start] = cell.left;
    }

    if (resolvedBoundaries[end] === undefined) {
      resolvedBoundaries[end] = cell.right;
    }

    let hasGap = false;
    for (let index = start + 1; index < end; index += 1) {
      if (resolvedBoundaries[index] === undefined) {
        hasGap = true;
        break;
      }
    }

    if (!hasGap) continue;

    const segmentWidth = cell.right - cell.left;
    for (let index = start + 1; index < end; index += 1) {
      resolvedBoundaries[index] ??= cell.left + (segmentWidth * (index - start)) / cell.span;
    }
  }

  for (let index = 1; index < resolvedBoundaries.length; index += 1) {
    resolvedBoundaries[index] ??= resolvedBoundaries[index - 1] ?? 0;
  }

  return resolvedBoundaries.map((boundary) => boundary ?? 0);
}

export function measureRenderedRowBoundaries(table: HTMLTableElement): number[] {
  const tableRect = table.getBoundingClientRect();
  const boundaries: number[] = [0];

  for (const row of Array.from(table.rows)) {
    const rect = row.getBoundingClientRect();
    boundaries.push(rect.bottom - tableRect.top);
  }

  return boundaries;
}

export function measureHtmlTableGeometry(table: HTMLTableElement): HtmlTableGeometry {
  const tableRect = table.getBoundingClientRect();
  const columnBoundaries = measureRenderedColumnBoundaries(table);
  const rowBoundaries = measureRenderedRowBoundaries(table);

  return {
    tableRect: toRect(tableRect),
    columns: Array.from({ length: Math.max(0, columnBoundaries.length - 1) }, (_value, index) => ({
      index,
      left: columnBoundaries[index] ?? 0,
      width: Math.max(0, (columnBoundaries[index + 1] ?? 0) - (columnBoundaries[index] ?? 0)),
    })),
    rows: Array.from({ length: Math.max(0, rowBoundaries.length - 1) }, (_value, index) => ({
      index,
      top: rowBoundaries[index] ?? 0,
      height: Math.max(0, (rowBoundaries[index + 1] ?? 0) - (rowBoundaries[index] ?? 0)),
    })),
  };
}

export function findHtmlTableAtDOM(view: EditorView, target: EventTarget | null): HtmlTableDOMContext | undefined {
  if (!(target instanceof Node)) return undefined;

  const element = (target instanceof Element ? target : target.parentElement)?.closest(HTML_TABLE_SELECTOR) as HTMLTableElement | null;
  if (!element) return undefined;

  const wrapper = element.closest(HTML_TABLE_WRAPPER_SELECTOR) as HTMLElement | null;
  const tablePos = resolveTablePos(view, wrapper ?? element);

  if (tablePos === undefined) return undefined;

  const table = view.state.doc.nodeAt(tablePos);
  if (!table || table.type.name !== HTML_TABLE_NODE_NAME) return undefined;

  return {
    tablePos,
    table,
    dom: element,
    wrapper: wrapper ?? element,
  };
}

export function getRenderedHtmlTableContext(view: EditorView, tablePos: number): HtmlTableDOMContext | undefined {
  const node = view.state.doc.nodeAt(tablePos);
  if (!node || node.type.name !== HTML_TABLE_NODE_NAME) return undefined;

  const dom = view.nodeDOM(tablePos);
  if (!(dom instanceof HTMLElement)) return undefined;

  const wrapper = dom.matches(HTML_TABLE_WRAPPER_SELECTOR) ? dom : dom.closest(HTML_TABLE_WRAPPER_SELECTOR);
  const table = (dom.matches('table') ? dom : dom.querySelector('table')) as HTMLTableElement | null;

  if (!(wrapper instanceof HTMLElement) || !table) return undefined;

  return {
    tablePos,
    table: node,
    dom: table,
    wrapper,
  };
}

export function getSelectedRenderedHtmlTableContext(view: EditorView): HtmlTableDOMContext | undefined {
  const tablePos = findSelectedHtmlTablePos(view);
  return tablePos === undefined ? undefined : getRenderedHtmlTableContext(view, tablePos);
}

export function getSelectedRenderedHtmlTableGeometry(view: EditorView): HtmlTableGeometry | undefined {
  const context = getSelectedRenderedHtmlTableContext(view);
  return context ? measureHtmlTableGeometry(context.dom) : undefined;
}

function resolveTablePos(view: EditorView, dom: HTMLElement): number | undefined {
  const candidates: Node[] = [dom];
  const table = dom.matches('table') ? dom : dom.querySelector('table');

  if (table instanceof Node && table !== dom) {
    candidates.push(table);
  }

  for (const candidate of candidates) {
    try {
      const resolved = view.state.doc.resolve(view.posAtDOM(candidate, 0));

      for (let depth = resolved.depth; depth > 0; depth -= 1) {
        const node = resolved.node(depth);
        if (node.type.name === HTML_TABLE_NODE_NAME) {
          return resolved.before(depth);
        }
      }
    } catch {
      continue;
    }
  }

  return undefined;
}

function findSelectedHtmlTablePos(view: EditorView): number | undefined {
  const { selection } = view.state;

  if (selection instanceof NodeSelection && selection.node.type.name === HTML_TABLE_NODE_NAME) {
    return selection.from;
  }

  const $from = selection.$from;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === HTML_TABLE_NODE_NAME) {
      return $from.before(depth);
    }
  }

  return undefined;
}

function toRect(rect: DOMRect | DOMRectReadOnly): HtmlTableRect {
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  };
}
