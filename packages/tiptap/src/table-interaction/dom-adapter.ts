import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { NodeSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

export interface TableDOMContext<TTableNode extends ProseMirrorNode = ProseMirrorNode> {
  tablePos: number;
  table: TTableNode;
  dom: HTMLTableElement;
  wrapper: HTMLElement;
}

export interface TableDomAdapter<TTableNode extends ProseMirrorNode = ProseMirrorNode> {
  nodeName: string;
  tableSelector: string;
  wrapperSelector: string;
  createContext(context: TableDOMContext<TTableNode>): TableDOMContext<TTableNode>;
}

export function findTableAtDOM<TTableNode extends ProseMirrorNode = ProseMirrorNode>(
  view: EditorView,
  target: EventTarget | null,
  adapter: TableDomAdapter<TTableNode>,
): TableDOMContext<TTableNode> | undefined {
  if (!(target instanceof Node)) return undefined;

  const targetElement = target instanceof Element ? target : target.parentElement;
  const wrapper = targetElement?.closest(adapter.wrapperSelector) as HTMLElement | null;
  const table =
    (targetElement?.closest(adapter.tableSelector) as HTMLTableElement | null) ??
    ((wrapper?.querySelector('table') as HTMLTableElement | null) ?? null);
  if (!table) return undefined;

  const tablePos = resolveTablePos(view, wrapper ?? table, adapter.nodeName);
  if (tablePos === undefined) return undefined;

  const tableNode = view.state.doc.nodeAt(tablePos);
  if (!tableNode || tableNode.type.name !== adapter.nodeName) return undefined;

  return adapter.createContext({
    tablePos,
    table: tableNode as TTableNode,
    dom: table,
    wrapper: wrapper ?? table,
  });
}

export function getRenderedTableContext<TTableNode extends ProseMirrorNode = ProseMirrorNode>(
  view: EditorView,
  tablePos: number,
  adapter: TableDomAdapter<TTableNode>,
): TableDOMContext<TTableNode> | undefined {
  const node = view.state.doc.nodeAt(tablePos);
  if (!node || node.type.name !== adapter.nodeName) return undefined;

  const dom = view.nodeDOM(tablePos);
  if (!(dom instanceof HTMLElement)) return undefined;

  const wrapper = dom.matches(adapter.wrapperSelector) ? dom : dom.closest(adapter.wrapperSelector);
  const table = (dom.matches('table') ? dom : dom.querySelector('table')) as HTMLTableElement | null;
  if (!(wrapper instanceof HTMLElement) || !table) return undefined;

  return adapter.createContext({
    tablePos,
    table: node as TTableNode,
    dom: table,
    wrapper,
  });
}

export function getSelectedRenderedTableContext<TTableNode extends ProseMirrorNode = ProseMirrorNode>(
  view: EditorView,
  adapter: TableDomAdapter<TTableNode>,
): TableDOMContext<TTableNode> | undefined {
  const tablePos = findSelectedTablePos(view, adapter.nodeName);
  return tablePos === undefined ? undefined : getRenderedTableContext(view, tablePos, adapter);
}

export function findSelectedTablePos(view: EditorView, nodeName: string): number | undefined {
  const { selection } = view.state;

  if (selection instanceof NodeSelection && selection.node.type.name === nodeName) {
    return selection.from;
  }

  const $from = selection.$from;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === nodeName) {
      return $from.before(depth);
    }
  }

  return undefined;
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
        const node = resolved.node(depth);
        if (node.type.name === nodeName) {
          return resolved.before(depth);
        }
      }
    } catch {
      continue;
    }
  }

  return undefined;
}
