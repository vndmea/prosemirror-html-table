import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { NodeSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

import {
  measureRenderedColumnBoundaries,
  measureRenderedRowBoundaries,
  measureRenderedTableGeometry,
  type TableColumnGeometry,
  type TableGeometry,
  type TableRect,
  type TableRowGeometry,
} from './table-interaction/dom-geometry.js';

const HTML_TABLE_NODE_NAME = 'htmlTable';
const HTML_TABLE_SELECTOR = '[data-html-table], table';
const HTML_TABLE_WRAPPER_SELECTOR = '[data-html-table-wrapper], .html-table-node__wrapper';

export type HtmlTableRect = TableRect;
export type HtmlTableColumnGeometry = TableColumnGeometry;
export type HtmlTableRowGeometry = TableRowGeometry;
export type HtmlTableGeometry = TableGeometry;

export interface HtmlTableDOMContext {
  tablePos: number;
  table: ProseMirrorNode;
  dom: HTMLTableElement;
  wrapper: HTMLElement;
}

export { measureRenderedColumnBoundaries, measureRenderedRowBoundaries };

export function measureHtmlTableGeometry(table: HTMLTableElement, wrapper?: HTMLElement): HtmlTableGeometry {
  return measureRenderedTableGeometry(table, wrapper);
}

export function findHtmlTableAtDOM(view: EditorView, target: EventTarget | null): HtmlTableDOMContext | undefined {
  if (!(target instanceof Node)) return undefined;

  const targetElement = target instanceof Element ? target : target.parentElement;
  const wrapper = targetElement?.closest(HTML_TABLE_WRAPPER_SELECTOR) as HTMLElement | null;
  const element =
    (targetElement?.closest(HTML_TABLE_SELECTOR) as HTMLTableElement | null) ??
    ((wrapper?.querySelector('table') as HTMLTableElement | null) ?? null);
  if (!element) return undefined;

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
  return context ? measureHtmlTableGeometry(context.dom, context.wrapper) : undefined;
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
