import type { EditorView } from '@tiptap/pm/view';

import { htmlTableDomAdapter, type HtmlTableDOMContext } from './dom/adapter.js';
import {
  findTableAtDOM,
  getRenderedTableContext,
  getSelectedRenderedTableContext,
} from './table-interaction/dom-adapter.js';
import {
  measureRenderedColumnBoundaries,
  measureRenderedRowBoundaries,
  measureRenderedTableGeometry,
  type TableColumnGeometry,
  type TableGeometry,
  type TableRect,
  type TableRowGeometry,
} from './table-interaction/dom-geometry.js';

export type HtmlTableRect = TableRect;
export type HtmlTableColumnGeometry = TableColumnGeometry;
export type HtmlTableRowGeometry = TableRowGeometry;
export type HtmlTableGeometry = TableGeometry;
export type { HtmlTableDOMContext };

export { measureRenderedColumnBoundaries, measureRenderedRowBoundaries };

export function measureHtmlTableGeometry(table: HTMLTableElement, wrapper?: HTMLElement): HtmlTableGeometry {
  return measureRenderedTableGeometry(table, wrapper);
}

export function findHtmlTableAtDOM(view: EditorView, target: EventTarget | null): HtmlTableDOMContext | undefined {
  return findTableAtDOM(view, target, htmlTableDomAdapter);
}

export function getRenderedHtmlTableContext(view: EditorView, tablePos: number): HtmlTableDOMContext | undefined {
  return getRenderedTableContext(view, tablePos, htmlTableDomAdapter);
}

export function getSelectedRenderedHtmlTableContext(view: EditorView): HtmlTableDOMContext | undefined {
  return getSelectedRenderedTableContext(view, htmlTableDomAdapter);
}

export function getSelectedRenderedHtmlTableGeometry(view: EditorView): HtmlTableGeometry | undefined {
  const context = getSelectedRenderedHtmlTableContext(view);
  return context ? measureHtmlTableGeometry(context.dom, context.wrapper) : undefined;
}
