import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { NodeSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

import { resolveActiveS1000DTableContext } from './context.js';
import { s1000dTableNodeNames } from './names.js';

export interface S1000DTableDomAdapter {
  nodeName: string;
  tableSelector: string;
  wrapperSelector: string;
}

export const s1000dTableDomAdapter: S1000DTableDomAdapter = {
  nodeName: s1000dTableNodeNames.table,
  tableSelector: '[data-s1000d-table], table[data-s1000d="table"], table',
  wrapperSelector: '[data-s1000d-table-wrapper], .s1000d-table-node__wrapper',
};

export interface S1000DTableDOMContext {
  tablePos: number;
  table: ProseMirrorNode;
  dom: HTMLTableElement;
  wrapper: HTMLElement;
  activeTgroup: ProseMirrorNode | null;
  activeTgroupIndex: number;
}

export function findS1000DTableAtDOM(view: EditorView, target: EventTarget | null): S1000DTableDOMContext | undefined {
  if (!(target instanceof Node)) {
    return undefined;
  }

  const targetElement = target instanceof Element ? target : target.parentElement;
  const wrapper = targetElement?.closest(s1000dTableDomAdapter.wrapperSelector) as HTMLElement | null;
  const table =
    (targetElement?.closest(s1000dTableDomAdapter.tableSelector) as HTMLTableElement | null) ??
    ((wrapper?.querySelector('table') as HTMLTableElement | null) ?? null);
  if (!table) {
    return undefined;
  }

  const tablePos = resolveTablePos(view, wrapper ?? table, s1000dTableDomAdapter.nodeName);
  if (tablePos === undefined) {
    return undefined;
  }

  return getRenderedS1000DTableContext(view, tablePos);
}

export function getRenderedS1000DTableContext(view: EditorView, tablePos: number): S1000DTableDOMContext | undefined {
  const table = view.state.doc.nodeAt(tablePos);
  if (!table || table.type.name !== s1000dTableDomAdapter.nodeName) {
    return undefined;
  }

  const dom = view.nodeDOM(tablePos);
  if (!isHTMLElementLike(dom)) {
    return undefined;
  }

  const wrapper = dom.matches(s1000dTableDomAdapter.wrapperSelector) ? dom : dom.closest(s1000dTableDomAdapter.wrapperSelector);
  const element = (dom.matches('table') ? dom : dom.querySelector('table')) as HTMLTableElement | null;
  if (!isHTMLElementLike(wrapper) || !isHTMLElementLike(element)) {
    return undefined;
  }

  const resolved = resolveActiveS1000DTableContext({ table, tablePos }, view.state.selection);
  return {
    tablePos,
    table,
    dom: element,
    wrapper,
    activeTgroup: resolved.activeTgroup,
    activeTgroupIndex: resolved.activeTgroupIndex,
  };
}

export function getSelectedRenderedS1000DTableContext(view: EditorView): S1000DTableDOMContext | undefined {
  const tablePos = findSelectedS1000DTablePos(view);
  return tablePos === undefined ? undefined : getRenderedS1000DTableContext(view, tablePos);
}

function findSelectedS1000DTablePos(view: EditorView): number | undefined {
  const { selection } = view.state;

  if (selection instanceof NodeSelection && selection.node.type.name === s1000dTableNodeNames.table) {
    return selection.from;
  }

  const $from = selection.$from;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === s1000dTableNodeNames.table) {
      return $from.before(depth);
    }
  }

  return undefined;
}

function isHTMLElementLike(value: unknown): value is HTMLElement {
  if (typeof HTMLElement !== 'undefined') {
    return value instanceof HTMLElement;
  }

  return Boolean(
    value
    && typeof value === 'object'
    && 'matches' in value
    && typeof (value as { matches?: unknown }).matches === 'function'
    && 'querySelector' in value
    && typeof (value as { querySelector?: unknown }).querySelector === 'function',
  );
}

function resolveTablePos(view: EditorView, dom: HTMLElement, nodeName: string): number | undefined {
  const candidates: Node[] = [dom];
  const table = dom.matches('table') ? dom : dom.querySelector('table');

  if (table instanceof Node && table !== dom) {
    candidates.push(table);
  }

  for (const candidate of candidates) {
    try {
      const resolved = view.state.doc.resolve(view.posAtDOM(candidate, 0));

      for (let depth = resolved.depth; depth > 0; depth -= 1) {
        if (resolved.node(depth).type.name === nodeName) {
          return resolved.before(depth);
        }
      }
    } catch {
      continue;
    }
  }

  return undefined;
}
