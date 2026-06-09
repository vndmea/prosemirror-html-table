import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { NodeSelection, Plugin, PluginKey, TextSelection, type EditorState, type Selection, type Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';

import { clearSelectedCells, isWholeTableSelection, parseHtmlTableClipboard, parsePlainTextTableClipboard, serializeCellSelectionToHtmlTable, serializeCellSelectionToText, applyTableClipboardToSelection } from './clipboard.js';
import { deleteTable } from './commands.js';
import { createFixTablesTransaction } from './fix-tables.js';
import { CellSelection, isCellSelection } from './selection.js';

export interface TableEditingOptions {
  allowTableNodeSelection?: boolean;
}

export const tableEditingKey = new PluginKey<number>('selectingCells');

export function tableEditing({ allowTableNodeSelection = false }: TableEditingOptions = {}): Plugin {
  return new Plugin({
    key: tableEditingKey,
    state: {
      init() {
        return null;
      },
      apply(tr, current: number | null) {
        const next = tr.getMeta(tableEditingKey);
        if (next != null) return next === -1 ? null : next;
        if (current == null || !tr.docChanged) return current;

        const { deleted, pos } = tr.mapping.mapResult(current);
        return deleted ? null : pos;
      },
    },
    props: {
      decorations: drawCellSelection,
      handleDOMEvents: {
        copy(view, event) {
          return handleClipboardCopy(view, event as ClipboardEvent);
        },
        cut(view, event) {
          return handleClipboardCut(view, event as ClipboardEvent);
        },
        paste(view, event) {
          return handleClipboardPaste(view, event as ClipboardEvent);
        },
      },
      handleKeyDown(view, event) {
        return handleDeleteKey(view, event);
      },
      createSelectionBetween(view) {
        return tableEditingKey.getState(view.state) != null ? view.state.selection : null;
      },
    },
    appendTransaction(_transactions, oldState, state) {
      return normalizeSelection(state, createFixTablesTransaction(state, oldState), allowTableNodeSelection);
    },
  });
}

function drawCellSelection(state: EditorState): DecorationSet | null {
  if (!isCellSelection(state.selection)) return null;

  const decorations: Decoration[] = [];
  state.selection.forEachCell((node, pos) => {
    decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: 'selectedCell' }));
  });
  return DecorationSet.create(state.doc, decorations);
}

function handleClipboardCopy(view: EditorView, event: ClipboardEvent): boolean {
  if (!event.clipboardData || !isClipboardSelection(view.state)) return false;

  const html = serializeCellSelectionToHtmlTable(view.state);
  const text = serializeCellSelectionToText(view.state);
  if (!html && !text) return false;

  if (html) event.clipboardData.setData('text/html', html);
  if (text) event.clipboardData.setData('text/plain', text);
  event.preventDefault();
  return true;
}

function handleClipboardCut(view: EditorView, event: ClipboardEvent): boolean {
  if (!handleClipboardCopy(view, event)) return false;

  if (view.state.selection instanceof NodeSelection && view.state.selection.node.type.spec.tableRole === 'table') {
    return deleteTable()(view.state, view.dispatch);
  }

  return clearSelectedCells(view.state, view.dispatch);
}

function handleClipboardPaste(view: EditorView, event: ClipboardEvent): boolean {
  if (!event.clipboardData || !isTablePasteTarget(view.state)) return false;

  const html = event.clipboardData.getData('text/html');
  const text = event.clipboardData.getData('text/plain');
  const clipboard =
    parseHtmlTableClipboard(html, view.state.schema)
    ?? parsePlainTextTableClipboard(text, view.state.schema);
  if (!clipboard) return false;

  const applied = applyTableClipboardToSelection(view.state, view.dispatch, clipboard);
  if (!applied) return false;

  event.preventDefault();
  return true;
}

function handleDeleteKey(view: EditorView, event: KeyboardEvent): boolean {
  if (event.key !== 'Backspace' && event.key !== 'Delete') return false;
  if (!isCellSelection(view.state.selection)) return false;
  if (isWholeTableSelection(view.state)) return false;

  const cleared = clearSelectedCells(view.state, view.dispatch);
  if (cleared) event.preventDefault();
  return cleared;
}

function normalizeSelection(
  state: EditorState,
  tr: Transaction | undefined,
  allowTableNodeSelection: boolean,
): Transaction | undefined {
  const source = tr ?? state;
  const selection = source.selection;
  const doc = source.doc;
  let normalizedSelection: Selection | undefined;
  const role = selection instanceof NodeSelection ? selection.node.type.spec.tableRole : undefined;

  if (selection instanceof NodeSelection && role) {
    if (role === 'cell' || role === 'header_cell') {
      normalizedSelection = CellSelection.create(doc, selection.from);
    } else if (role === 'row') {
      const $cell = doc.resolve(selection.from + 1);
      normalizedSelection = CellSelection.rowSelection($cell, $cell);
    } else if (role === 'table' && !allowTableNodeSelection) {
      const firstCellPos = findFirstCellPos(selection.node, selection.from);
      const lastCellPos = findLastCellPos(selection.node, selection.from);
      if (firstCellPos != null && lastCellPos != null) {
        normalizedSelection = CellSelection.create(doc, firstCellPos, lastCellPos);
      }
    }
  } else if (selection instanceof TextSelection && isCellBoundarySelection(selection)) {
    normalizedSelection = TextSelection.create(doc, selection.from);
  } else if (selection instanceof TextSelection && isTextSelectionAcrossCells(selection)) {
    normalizedSelection = TextSelection.create(doc, selection.$from.start(), selection.$from.end());
  }

  if (normalizedSelection) {
    (tr ?? (tr = state.tr)).setSelection(normalizedSelection);
  }

  return tr;
}

function isClipboardSelection(state: EditorState): boolean {
  return isCellSelection(state.selection)
    || (state.selection instanceof NodeSelection && state.selection.node.type.spec.tableRole === 'table');
}

function isTablePasteTarget(state: EditorState): boolean {
  if (state.selection instanceof NodeSelection) {
    return state.selection.node.type.spec.tableRole === 'table';
  }

  if (isCellSelection(state.selection)) return true;

  for (let depth = state.selection.$from.depth; depth >= 0; depth -= 1) {
    if (state.selection.$from.node(depth).type.spec.tableRole === 'table') return true;
  }

  return false;
}

function isCellBoundarySelection(selection: TextSelection): boolean {
  const { $from, $to } = selection;
  if ($from.pos === $to.pos || $from.pos < $to.pos - 6) return false;

  let afterFrom = $from.pos;
  let beforeTo = $to.pos;
  let depth = $from.depth;

  for (; depth >= 0; depth -= 1, afterFrom += 1) {
    if ($from.after(depth + 1) < $from.end(depth)) break;
  }

  for (let currentDepth = $to.depth; currentDepth >= 0; currentDepth -= 1, beforeTo -= 1) {
    if ($to.before(currentDepth + 1) > $to.start(currentDepth)) break;
  }

  return afterFrom === beforeTo && /row|table/.test(String($from.node(depth).type.spec.tableRole ?? ''));
}

function isTextSelectionAcrossCells(selection: TextSelection): boolean {
  const { $from, $to } = selection;
  let fromCellBoundaryNode: ProseMirrorNode | undefined;
  let toCellBoundaryNode: ProseMirrorNode | undefined;

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.spec.tableRole === 'cell' || node.type.spec.tableRole === 'header_cell') {
      fromCellBoundaryNode = node;
      break;
    }
  }

  for (let depth = $to.depth; depth > 0; depth -= 1) {
    const node = $to.node(depth);
    if (node.type.spec.tableRole === 'cell' || node.type.spec.tableRole === 'header_cell') {
      toCellBoundaryNode = node;
      break;
    }
  }

  return fromCellBoundaryNode !== toCellBoundaryNode && $to.parentOffset === 0;
}

function findFirstCellPos(table: ProseMirrorNode, tablePos: number): number | undefined {
  return getTableCellPositions(table, tablePos)[0];
}

function findLastCellPos(table: ProseMirrorNode, tablePos: number): number | undefined {
  const positions = getTableCellPositions(table, tablePos);
  return positions[positions.length - 1];
}

function getTableCellPositions(table: ProseMirrorNode, tablePos: number): number[] {
  const positions: number[] = [];

  table.descendants((node, pos) => {
    if (node.type.spec.tableRole === 'cell' || node.type.spec.tableRole === 'header_cell') {
      positions.push(tablePos + 1 + pos);
    }
    return true;
  });

  return positions;
}
