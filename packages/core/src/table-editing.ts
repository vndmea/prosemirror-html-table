import { type Node as ProseMirrorNode, type Slice } from 'prosemirror-model';
import { NodeSelection, Plugin, PluginKey, Selection, TextSelection, type EditorState, type Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';

import { applyTableClipboardToSelection, clearSelectedCells, clipTableClipboard, createSingleCellSliceClipboard, getSelectionMatrix, parseHtmlTableClipboard, parsePlainTextTableClipboard, parseTableSliceClipboard, serializeCellSelectionToHtmlTable, serializeCellSelectionToText } from './clipboard.js';
import { deleteTable } from './commands.js';
import { createFixTablesTransaction } from './fix-tables.js';
import { CellSelection, isCellSelection } from './selection.js';
import { HtmlTableMap } from './table-map.js';

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
        mousedown(view, event) {
          return handleMouseDown(view, event as MouseEvent);
        },
      },
      handlePaste(view, event, slice) {
        return handlePaste(view, event as ClipboardEvent | null, slice);
      },
      handleKeyDown(view, event) {
        return handleKeyDown(view, event);
      },
      handleTripleClick(view, pos) {
        return handleTripleClick(view, pos);
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

function handlePaste(view: EditorView, event: ClipboardEvent | null, slice: Slice): boolean {
  if (!isTablePasteTarget(view.state)) return false;

  const clipboard =
    parseTableSliceClipboard(slice, view.state.schema)
    ?? (isCellSelection(view.state.selection)
      ? createSingleCellSliceClipboard(view.state.schema, slice, {
        isHeader: view.state.selection.$anchor.parent.type.spec.tableRole === 'header_cell',
      })
      : null);
  if (!clipboard) return false;

  const nextClipboard = normalizeClipboardForSelection(view.state, clipboard);
  const applied = applyTableClipboardToSelection(view.state, view.dispatch, nextClipboard);
  if (!applied) return false;

  event?.preventDefault?.();
  return true;
}

function handleDeleteKey(view: EditorView, event: KeyboardEvent): boolean {
  if (event.key !== 'Backspace' && event.key !== 'Delete') return false;
  if (!isCellSelection(view.state.selection)) return false;

  const cleared = clearSelectedCells(view.state, view.dispatch);
  if (cleared) event.preventDefault();
  return cleared;
}

function handleKeyDown(view: EditorView, event: KeyboardEvent): boolean {
  if (handleShiftArrow(view, event)) return true;
  if (handleArrow(view, event)) return true;
  return handleDeleteKey(view, event);
}

function handleArrow(view: EditorView, event: KeyboardEvent): boolean {
  const direction = getArrowDirection(event);
  if (!direction) return false;

  const selection = createArrowSelection(view, direction.axis, direction.dir);
  if (!selection || selection.eq(view.state.selection)) return false;

  event.preventDefault();
  view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
  return true;
}

function handleShiftArrow(view: EditorView, event: KeyboardEvent): boolean {
  const direction = getShiftArrowDirection(event);
  if (!direction) return false;

  const selection = createShiftArrowSelection(view, direction.axis, direction.dir);
  if (!selection || selection.eq(view.state.selection)) return false;

  event.preventDefault();
  view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
  return true;
}

function createArrowSelection(
  view: EditorView,
  axis: 'horiz' | 'vert',
  dir: -1 | 1,
): Selection | null {
  const selection = view.state.selection;

  if (selection instanceof CellSelection) {
    return Selection.near(selection.$head, dir);
  }

  if (axis !== 'horiz' && !selection.empty) return null;

  const cellPos = atEndOfCell(view, axis, dir);
  if (cellPos == null) return null;

  if (axis === 'horiz') {
    return Selection.near(view.state.doc.resolve(selection.head + dir), dir);
  }

  const nextPos = nextCellPos(view.state.doc, cellPos, axis, dir);
  if (nextPos != null) {
    return Selection.near(view.state.doc.resolve(nextPos + 1), 1);
  }

  const table = tableAround(view.state.doc.resolve(cellPos + 1));
  if (!table) return null;

  return dir < 0
    ? Selection.near(view.state.doc.resolve(table.pos), -1)
    : Selection.near(view.state.doc.resolve(table.pos + table.node.nodeSize), 1);
}

function normalizeClipboardForSelection(
  state: EditorState,
  clipboard: ReturnType<typeof parseTableSliceClipboard> extends infer T ? Exclude<T, null> : never,
) {
  if (!isCellSelection(state.selection)) return clipboard;

  const matrix = getSelectionMatrix(state);
  const height = matrix.length;
  const width = matrix[0]?.length ?? 0;
  return width > 0 && height > 0 ? clipTableClipboard(state.schema, clipboard, width, height) : clipboard;
}

function handleTripleClick(view: EditorView, pos: number): boolean {
  const $cell = cellAround(view.state.doc.resolve(pos));
  if (!$cell) return false;

  view.dispatch(view.state.tr.setSelection(CellSelection.create(view.state.doc, $cell.pos - 1)));
  return true;
}

function createShiftArrowSelection(
  view: EditorView,
  axis: 'horiz' | 'vert',
  dir: -1 | 1,
): CellSelection | null {
  const selection = view.state.selection;
  const cellSelection = selection instanceof CellSelection
    ? selection
    : createCellSelectionFromTextCursor(view, axis, dir);
  if (!cellSelection) return null;

  const nextHeadCellPos = nextCellPos(view.state.doc, cellSelection.headCellPos, axis, dir);
  if (nextHeadCellPos == null) return null;

  return CellSelection.create(view.state.doc, cellSelection.anchorCellPos, nextHeadCellPos);
}

function handleMouseDown(view: EditorView, startEvent: MouseEvent): boolean | void {
  if (startEvent.button !== 0) return;
  if (startEvent.ctrlKey || startEvent.metaKey) return;

  const startCell = domInCell(view, startEvent.target);
  let $anchor: ReturnType<typeof cellAround> | undefined;

  if (startEvent.shiftKey && isCellSelection(view.state.selection)) {
    setCellSelection(view, view.state.selection.$anchor, startEvent);
    startEvent.preventDefault();
  } else if (
    startEvent.shiftKey
    && startCell
    && ($anchor = cellAround(view.state.selection.$anchor)) != null
    && cellUnderMouse(view, startEvent)?.pos !== $anchor.pos
  ) {
    setCellSelection(view, $anchor, startEvent);
    startEvent.preventDefault();
  } else if (!startCell) {
    return;
  }

  const root = view.root as EventTarget & {
    addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void;
    removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void;
  };

  const stop = () => {
    root.removeEventListener('mouseup', stop);
    root.removeEventListener('dragstart', stop);
    root.removeEventListener('mousemove', move as EventListener);
    if (tableEditingKey.getState(view.state) != null) {
      view.dispatch(view.state.tr.setMeta(tableEditingKey, -1));
    }
  };

  const move = (event: Event) => {
    const mouseEvent = event as MouseEvent;
    const anchorPos = tableEditingKey.getState(view.state);
    let nextAnchor: ReturnType<typeof cellAround> | undefined | null;

    if (anchorPos != null) {
      nextAnchor = cellAround(view.state.doc.resolve(anchorPos));
    } else if (domInCell(view, mouseEvent.target) !== startCell) {
      nextAnchor = cellUnderMouse(view, startEvent);
      if (!nextAnchor) return stop();
    }

    if (nextAnchor) {
      setCellSelection(view, nextAnchor, mouseEvent);
    }
  };

  root.addEventListener('mouseup', stop);
  root.addEventListener('dragstart', stop);
  root.addEventListener('mousemove', move as EventListener);
  return false;
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

function cellAround($pos: ReturnType<ProseMirrorNode['resolve']>): ReturnType<ProseMirrorNode['resolve']> | null {
  for (let depth = $pos.depth - 1; depth > 0; depth -= 1) {
    const role = $pos.node(depth).type.spec.tableRole;
    if (role === 'cell' || role === 'header_cell') {
      return $pos.node(0).resolve($pos.before(depth + 1));
    }
  }

  return null;
}

function setCellSelection(
  view: EditorView,
  $anchor: ReturnType<typeof cellAround>,
  event: MouseEvent,
): void {
  if (!$anchor) return;

  let $head = cellUnderMouse(view, event);
  const starting = tableEditingKey.getState(view.state) == null;

  if (!$head || !inSameTable($anchor, $head)) {
    if (starting) {
      $head = $anchor;
    } else {
      return;
    }
  }

  const selection = CellSelection.create(view.state.doc, $anchor.pos - 1, $head.pos - 1);
  if (starting || !view.state.selection.eq(selection)) {
    let tr = view.state.tr.setSelection(selection);
    if (starting) {
      tr = tr.setMeta(tableEditingKey, $anchor.pos);
    }
    view.dispatch(tr);
  }
}

function createCellSelectionFromTextCursor(
  view: EditorView,
  axis: 'horiz' | 'vert',
  dir: -1 | 1,
): CellSelection | null {
  const cellPos = atEndOfCell(view, axis, dir);
  return cellPos == null ? null : CellSelection.create(view.state.doc, cellPos);
}

function atEndOfCell(view: EditorView, axis: 'horiz' | 'vert', dir: -1 | 1): number | null {
  if (!(view.state.selection instanceof TextSelection)) return null;

  const { $head } = view.state.selection;
  for (let depth = $head.depth - 1; depth >= 0; depth -= 1) {
    const parent = $head.node(depth);
    const index = dir < 0 ? $head.index(depth) : $head.indexAfter(depth);
    const expectedIndex = dir < 0 ? 0 : parent.childCount;
    if (index !== expectedIndex) return null;

    if (parent.type.spec.tableRole === 'cell' || parent.type.spec.tableRole === 'header_cell') {
      const direction = axis === 'vert' ? (dir > 0 ? 'down' : 'up') : (dir > 0 ? 'right' : 'left');
      return view.endOfTextblock(direction) ? $head.before(depth) : null;
    }
  }

  return null;
}

function domInCell(view: EditorView, target: EventTarget | null): unknown {
  for (let current = target as { nodeName?: string; parentNode?: unknown } | null; current && current !== view.dom; current = current.parentNode as { nodeName?: string; parentNode?: unknown } | null) {
    if (current.nodeName === 'TD' || current.nodeName === 'TH') {
      return current;
    }
  }
  return null;
}

function cellUnderMouse(view: EditorView, event: MouseEvent): ReturnType<typeof cellAround> | null {
  const mousePos = view.posAtCoords({
    left: event.clientX,
    top: event.clientY,
  });
  if (!mousePos) return null;

  return (
    (mousePos.inside >= 0 ? cellAround(view.state.doc.resolve(mousePos.inside)) : null)
    ?? cellAround(view.state.doc.resolve(mousePos.pos))
  );
}

function nextCellPos(
  doc: ProseMirrorNode,
  cellPos: number,
  axis: 'horiz' | 'vert',
  dir: -1 | 1,
): number | null {
  const $cell = doc.resolve(cellPos + 1);
  const table = tableAround($cell);
  if (!table) return null;

  const map = HtmlTableMap.get(table.node);
  const nextPos = map.nextCell(cellPos - table.pos, axis, dir);
  return nextPos == null ? null : table.pos + nextPos;
}

function inSameTable(
  $anchorCell: ReturnType<typeof cellAround>,
  $headCell: ReturnType<typeof cellAround>,
): boolean {
  if (!$anchorCell || !$headCell) return false;

  const anchorTable = tableAround($anchorCell);
  const headTable = tableAround($headCell);
  return !!anchorTable && !!headTable && anchorTable.pos === headTable.pos && anchorTable.depth === headTable.depth;
}

function tableAround($pos: ReturnType<ProseMirrorNode['resolve']>): { node: ProseMirrorNode; pos: number; depth: number } | null {
  for (let depth = $pos.depth; depth >= 0; depth -= 1) {
    const node = $pos.node(depth);
    if (node.type.spec.tableRole !== 'table') continue;
    return {
      node,
      pos: depth === 0 ? 0 : $pos.before(depth),
      depth,
    };
  }

  return null;
}

function getShiftArrowDirection(event: KeyboardEvent): { axis: 'horiz' | 'vert'; dir: -1 | 1 } | null {
  if (!event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return null;
  return getArrowDirection(event);
}

function getArrowDirection(event: KeyboardEvent): { axis: 'horiz' | 'vert'; dir: -1 | 1 } | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;

  switch (event.key) {
    case 'ArrowLeft':
      return { axis: 'horiz', dir: -1 };
    case 'ArrowRight':
      return { axis: 'horiz', dir: 1 };
    case 'ArrowUp':
      return { axis: 'vert', dir: -1 };
    case 'ArrowDown':
      return { axis: 'vert', dir: 1 };
    default:
      return null;
  }
}
