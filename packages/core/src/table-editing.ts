import { type Node as ProseMirrorNode, type Slice } from 'prosemirror-model';
import { NodeSelection, Plugin, PluginKey, Selection, TextSelection, type EditorState, type Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';

import { applyTableClipboardToSelection, clearSelectedCells, clipTableClipboard, createSingleCellSliceClipboard, getSelectionMatrix, parseHtmlTableClipboard, parsePlainTextTableClipboard, parseTableSliceClipboard, serializeCellSelectionToHtmlTable, serializeCellSelectionToText, type ParsedTableClipboard } from './clipboard.js';
import { deleteTable } from './commands.js';
import { createFixTablesTransaction } from './fix-tables.js';
import { inferHtmlTableNodeNames, resolveHtmlTableNodeNames } from './names.js';
import { CellSelection, isCellSelection } from './selection.js';
import { HtmlTableMap } from './table-map.js';
import type { HtmlTableNodeNames } from './types.js';

type TableClipboard = Exclude<ReturnType<typeof parseTableSliceClipboard>, null>;

export interface TableEditingOptions {
  allowTableNodeSelection?: boolean;
  clearCellsOnDelete?: boolean;
  clearWholeTableCellSelectionOnDelete?: boolean;
  constrainShiftArrowToSection?: boolean;
  deleteTableOnAllCellsSelected?: boolean;
  enableCellRangeClipboard?: boolean;
  enableShiftArrowSelection?: boolean;
  expandTableOnPaste?: boolean;
  names?: Partial<HtmlTableNodeNames>;
}

export const tableEditingKey = new PluginKey<number>('selectingCells');

export function tableEditing(options: TableEditingOptions = {}): Plugin {
  const {
    allowTableNodeSelection = false,
    clearCellsOnDelete = true,
    clearWholeTableCellSelectionOnDelete = true,
    constrainShiftArrowToSection = true,
    deleteTableOnAllCellsSelected = false,
    enableCellRangeClipboard = true,
    enableShiftArrowSelection = true,
    expandTableOnPaste = false,
    names: customNames,
  } = options;
  const names = resolveHtmlTableNodeNames(customNames);

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
          return handleClipboardCopy(view, event as ClipboardEvent, enableCellRangeClipboard, names);
        },
        cut(view, event) {
          return handleClipboardCut(view, event as ClipboardEvent, enableCellRangeClipboard, names);
        },
        paste(view, event) {
          return handleClipboardPaste(view, event as ClipboardEvent, enableCellRangeClipboard, expandTableOnPaste, names);
        },
        mousedown(view, event) {
          return handleMouseDown(view, event as MouseEvent);
        },
      },
      handlePaste(view, event, slice) {
        return handlePaste(view, event as ClipboardEvent | null, slice, enableCellRangeClipboard, expandTableOnPaste, names);
      },
      handleKeyDown(view, event) {
        return handleKeyDown(view, event, {
          clearCellsOnDelete,
          clearWholeTableCellSelectionOnDelete,
          constrainShiftArrowToSection,
          deleteTableOnAllCellsSelected,
          enableShiftArrowSelection,
          names,
        });
      },
      handleTripleClick(view, pos) {
        return handleTripleClick(view, pos);
      },
      createSelectionBetween(view) {
        return tableEditingKey.getState(view.state) != null ? view.state.selection : null;
      },
    },
    appendTransaction(transactions, oldState, state) {
      const fixOldState = transactions.some((transaction) => transaction.docChanged) ? oldState : undefined;

      return normalizeSelection(
        state,
        createFixTablesTransaction(state, fixOldState, { names }),
        allowTableNodeSelection,
      );
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

function handleClipboardCopy(
  view: EditorView,
  event: ClipboardEvent,
  enabled: boolean,
  names: HtmlTableNodeNames,
): boolean {
  if (!enabled || !event.clipboardData || !isClipboardSelection(view.state)) return false;

  const html = serializeCellSelectionToHtmlTable(view.state, { names });
  const text = serializeCellSelectionToText(view.state, { names });
  if (!html && !text) return false;

  if (html) event.clipboardData.setData('text/html', html);
  if (text) event.clipboardData.setData('text/plain', text);
  event.preventDefault();
  return true;
}

function handleClipboardCut(
  view: EditorView,
  event: ClipboardEvent,
  enabled: boolean,
  names: HtmlTableNodeNames,
): boolean {
  if (!handleClipboardCopy(view, event, enabled, names)) return false;

  if (view.state.selection instanceof NodeSelection && view.state.selection.node.type.spec.tableRole === 'table') {
    return deleteTable({ names })(view.state, view.dispatch);
  }

  return clearSelectedCells(view.state, view.dispatch, { names });
}

function handleClipboardPaste(
  view: EditorView,
  event: ClipboardEvent,
  enabled: boolean,
  expandTableOnPaste: boolean,
  names: HtmlTableNodeNames,
): boolean {
  if (!enabled || !event.clipboardData || !isTablePasteTarget(view.state)) return false;

  const html = event.clipboardData.getData('text/html');
  const text = event.clipboardData.getData('text/plain');
  const htmlClipboard = parseHtmlTableClipboard(html, view.state.schema);
  const plainTextClipboard = parsePlainTextTableClipboard(text, view.state.schema);
  const clipboard = shouldPreferPlainTextClipboard(htmlClipboard, plainTextClipboard, text)
    ? plainTextClipboard
    : htmlClipboard ?? plainTextClipboard;
  if (!clipboard) return false;

  const applied = applyTableClipboardToSelection(view.state, view.dispatch, clipboard, {
    expandTableOnPaste,
    names,
  });
  if (!applied) return false;

  event.preventDefault();
  return true;
}

function shouldPreferPlainTextClipboard(
  htmlClipboard: ParsedTableClipboard | null,
  plainTextClipboard: ParsedTableClipboard | null,
  plainText: string,
): boolean {
  if (!htmlClipboard || !plainTextClipboard) return false;

  const normalizedPlainText = normalizeClipboardText(plainText);
  if (!normalizedPlainText) return false;

  return normalizeClipboardText(serializeClipboardText(htmlClipboard)) !== normalizedPlainText;
}

function serializeClipboardText(clipboard: ParsedTableClipboard): string {
  return clipboard.rows
    .map((row) => row.map((cell) => cell.text ?? cell.content?.textBetween(0, cell.content.size, '\n', ' ') ?? '').join('\t'))
    .join('\n');
}

function normalizeClipboardText(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').trim();
}

function handlePaste(
  view: EditorView,
  event: ClipboardEvent | null,
  slice: Slice,
  enabled: boolean,
  expandTableOnPaste: boolean,
  names: HtmlTableNodeNames,
): boolean {
  if (!enabled || !isTablePasteTarget(view.state)) return false;

  const clipboard =
    parseTableSliceClipboard(slice, view.state.schema, { names })
    ?? (isCellSelection(view.state.selection)
      ? createSingleCellSliceClipboard(view.state.schema, slice, {
        isHeader: view.state.selection.$anchor.parent.type.spec.tableRole === 'header_cell',
        names,
      })
      : null);
  if (!clipboard) return false;

  const nextClipboard = normalizeClipboardForSelection(view.state, clipboard, expandTableOnPaste, names);
  const applied = applyTableClipboardToSelection(view.state, view.dispatch, nextClipboard, {
    expandTableOnPaste,
    names,
  });
  if (!applied) return false;

  event?.preventDefault?.();
  return true;
}

function handleDeleteKey(
  view: EditorView,
  event: KeyboardEvent,
  options: {
    clearCellsOnDelete: boolean;
    clearWholeTableCellSelectionOnDelete: boolean;
    deleteTableOnAllCellsSelected: boolean;
    names: HtmlTableNodeNames;
  },
): boolean {
  if (event.key !== 'Backspace' && event.key !== 'Delete') return false;
  if (!isCellSelection(view.state.selection)) return false;

  if (isWholeTableCellSelection(view.state, options.names)) {
    if (options.deleteTableOnAllCellsSelected) {
      const deleted = deleteTable({ names: options.names })(view.state, view.dispatch);
      if (deleted) event.preventDefault();
      return deleted;
    }

    if (!options.clearWholeTableCellSelectionOnDelete) return false;
  }

  if (!options.clearCellsOnDelete) return false;

  const cleared = clearSelectedCells(view.state, view.dispatch, { names: options.names });
  if (cleared) event.preventDefault();
  return cleared;
}

function handleKeyDown(
  view: EditorView,
  event: KeyboardEvent,
  options: {
    clearCellsOnDelete: boolean;
    clearWholeTableCellSelectionOnDelete: boolean;
    constrainShiftArrowToSection: boolean;
    deleteTableOnAllCellsSelected: boolean;
    enableShiftArrowSelection: boolean;
    names: HtmlTableNodeNames;
  },
): boolean {
  if (event.shiftKey) {
    if (!options.enableShiftArrowSelection) return false;
    return handleShiftArrow(view, event, options.constrainShiftArrowToSection, options.names);
  }
  if (handleArrow(view, event, options.names)) return true;
  return handleDeleteKey(view, event, options);
}

function handleArrow(view: EditorView, event: KeyboardEvent, names: HtmlTableNodeNames): boolean {
  const direction = getArrowDirection(event);
  if (!direction) return false;

  const selection = createArrowSelection(view, direction.axis, direction.dir, names);
  if (!selection || selection.eq(view.state.selection)) return false;

  event.preventDefault();
  view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
  return true;
}

function handleShiftArrow(
  view: EditorView,
  event: KeyboardEvent,
  constrainToSection: boolean,
  names: HtmlTableNodeNames,
): boolean {
  const direction = getShiftArrowDirection(event);
  if (!direction) return false;

  const selection = createShiftArrowSelection(view, direction.axis, direction.dir, constrainToSection, names);
  if (!selection || selection.eq(view.state.selection)) return false;

  event.preventDefault();
  view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
  return true;
}

function createArrowSelection(
  view: EditorView,
  axis: 'horiz' | 'vert',
  dir: -1 | 1,
  names: HtmlTableNodeNames,
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

  const nextPos = nextCellPos(view.state.doc, cellPos, axis, dir, names);
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
  clipboard: TableClipboard,
  expandTableOnPaste: boolean,
  names: HtmlTableNodeNames,
): TableClipboard {
  if (expandTableOnPaste) return clipboard;
  if (!isCellSelection(state.selection)) return clipboard;

  const matrix = getSelectionMatrix(state, { names });
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
  constrainToSection: boolean,
  names: HtmlTableNodeNames,
): CellSelection | null {
  const selection = view.state.selection;
  const cellSelection = selection instanceof CellSelection
    ? selection
    : createCellSelectionFromTextCursor(view, axis, dir);
  if (!cellSelection) return null;

  const nextHeadCellPos = nextCellPos(view.state.doc, cellSelection.headCellPos, axis, dir, names);
  if (nextHeadCellPos == null) return null;
  if (constrainToSection && !areCellsInSameSection(view.state.doc, cellSelection.headCellPos, nextHeadCellPos, names)) {
    return null;
  }

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
  names: HtmlTableNodeNames,
): number | null {
  const $cell = doc.resolve(cellPos + 1);
  const table = tableAround($cell);
  if (!table) return null;

  const map = HtmlTableMap.get(table.node, { names: inferHtmlTableNodeNames(table.node, names) });
  const nextPos = map.nextCell(cellPos - table.pos, axis, dir);
  return nextPos == null ? null : table.pos + nextPos;
}

function isWholeTableCellSelection(state: EditorState, names: HtmlTableNodeNames): boolean {
  if (!isCellSelection(state.selection)) return false;

  const table = tableAround(state.selection.$anchor);
  if (!table) return false;

  const map = HtmlTableMap.get(table.node, { names: inferHtmlTableNodeNames(table.node, names) });
  const rect = map.rectBetween(
    state.selection.anchorCellPos - table.pos,
    state.selection.headCellPos - table.pos,
  );

  return rect.left === 0
    && rect.top === 0
    && rect.right === map.width
    && rect.bottom === map.height
    && map.cellsInRect(rect).length === map.grid.cells.length;
}

function areCellsInSameSection(
  doc: ProseMirrorNode,
  firstCellPos: number,
  secondCellPos: number,
  names: HtmlTableNodeNames,
): boolean {
  const firstTable = tableAround(doc.resolve(firstCellPos + 1));
  const secondTable = tableAround(doc.resolve(secondCellPos + 1));
  if (!firstTable || !secondTable || firstTable.pos !== secondTable.pos) return false;

  const map = HtmlTableMap.get(firstTable.node, { names: inferHtmlTableNodeNames(firstTable.node, names) });
  const firstCell = findCellRefForTableOffset(map, firstCellPos - firstTable.pos);
  const secondCell = findCellRefForTableOffset(map, secondCellPos - firstTable.pos);

  return !!firstCell
    && !!secondCell
    && firstCell.section === secondCell.section
    && firstCell.sectionIndex === secondCell.sectionIndex;
}

function findCellRefForTableOffset(map: HtmlTableMap, tableOffset: number) {
  for (const [cell, pos] of map.cellPositions) {
    if (pos === tableOffset) return cell;
  }

  return undefined;
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
