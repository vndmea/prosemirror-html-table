import { Fragment, type Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { NodeSelection, Plugin, PluginKey, TextSelection, type EditorState, type Selection, type Transaction } from '@tiptap/pm/state';
import { CellSelection, createHtmlTableGrid, htmlTableNodeNames, normalizeHtmlTable, type HtmlTableCellRef } from 'prosemirror-html-table';

import type { HtmlTableTiptapOptions } from './options.js';
export {
  measureHtmlTableGeometry,
  measureRenderedColumnBoundaries,
  measureRenderedRowBoundaries,
  type HtmlTableColumnGeometry,
  type HtmlTableDOMContext,
  type HtmlTableGeometry,
  type HtmlTableRect,
  type HtmlTableRowGeometry,
} from './table-dom.js';

export interface TableContext {
  table: ProseMirrorNode;
  tablePos: number;
}

export interface TableSelectionInfo extends TableContext {
  grid: ReturnType<typeof createHtmlTableGrid>;
  anchorCell: HtmlTableCellRef;
  headCell: HtmlTableCellRef;
  cells: HtmlTableCellRef[];
  top: number;
  bottom: number;
  left: number;
  right: number;
  cellPositions: Map<HtmlTableCellRef, number>;
}

export const htmlTableSelectionPluginKey = new PluginKey('html-table-selection-visuals');

export function getTableColumnWidths(table: ProseMirrorNode, cellMinWidth: number): number[] {
  const grid = createHtmlTableGrid(table);
  const widths = Array.from({ length: Math.max(1, grid.width) }, () => cellMinWidth);
  const colgroup = findChild(table, htmlTableNodeNames.colgroup);

  if (colgroup) {
    let columnIndex = 0;

    colgroup.forEach((col) => {
      const span = Math.max(1, Number(col.attrs.span ?? 1));
      const width = normalizeWidth(col.attrs.width, cellMinWidth);

      for (let offset = 0; offset < span && columnIndex < widths.length; offset += 1) {
        widths[columnIndex] = width;
        columnIndex += 1;
      }
    });
  }

  for (const cell of grid.cells) {
    const cellWidths = Array.isArray(cell.node.attrs.colwidth) ? cell.node.attrs.colwidth : [];

    for (let offset = 0; offset < Math.min(cell.colSpan, cellWidths.length); offset += 1) {
      widths[cell.columnIndex + offset] = normalizeWidth(cellWidths[offset], widths[cell.columnIndex + offset] ?? cellMinWidth);
    }
  }

  return widths;
}

export function applyColumnWidths(table: ProseMirrorNode, widths: number[]): ProseMirrorNode {
  const grid = createHtmlTableGrid(table);
  const schema = table.type.schema;
  const tableChildren = getChildren(table);
  const colType = schema.nodes[htmlTableNodeNames.col];
  const colgroupType = schema.nodes[htmlTableNodeNames.colgroup];

  if (!colType || !colgroupType) {
    throw new Error('HTML table column node types are missing from the schema.');
  }

  const cols = widths.map((width) =>
    colType.create({
      span: null,
      width,
    }),
  );
  const colgroup = colgroupType.create(null, cols);
  const colgroupIndex = tableChildren.findIndex((child) => child.type.name === htmlTableNodeNames.colgroup);
  const insertIndex = tableChildren.findIndex((child) => child.type.name === htmlTableNodeNames.head || child.type.name === htmlTableNodeNames.body || child.type.name === htmlTableNodeNames.foot);

  if (colgroupIndex >= 0) {
    tableChildren[colgroupIndex] = colgroup;
  } else {
    tableChildren.splice(insertIndex >= 0 ? insertIndex : tableChildren.length, 0, colgroup);
  }

  tableChildren.forEach((section, sectionIndex) => {
    if (!isSection(section)) return;

    const sectionRows = getChildren(section).map((row) => {
      const rowIndex = grid.rows.find((item) => item.node === row)?.rowIndex ?? -1;
      const rowChildren = getChildren(row).map((cellNode, cellIndex) => {
        const cell = grid.cells.find((item) => item.rowIndex === rowIndex && item.cellIndex === cellIndex && item.node === cellNode);
        if (!cell) return cellNode;

        return cellNode.type.create(
          {
            ...cellNode.attrs,
            colwidth: widths.slice(cell.columnIndex, cell.columnIndex + cell.colSpan),
          },
          cellNode.content,
          cellNode.marks,
        );
      });

      return row.copy(Fragment.fromArray(rowChildren));
    });

    tableChildren[sectionIndex] = section.copy(Fragment.fromArray(sectionRows));
  });

  return normalizeHtmlTable(table.copy(Fragment.fromArray(tableChildren)));
}

export function createColumnResizeTransaction(
  state: EditorState,
  tablePos: number,
  table: ProseMirrorNode,
  widths: number[],
): Transaction {
  const resizedTable = applyColumnWidths(table, widths);
  const transaction = state.tr.replaceWith(tablePos, tablePos + table.nodeSize, resizedTable);
  const selection = preserveSelectionOnResize(state.selection, transaction.doc, tablePos, table, resizedTable)
    ?? state.selection.getBookmark().map(transaction.mapping).resolve(transaction.doc);

  return transaction.setSelection(selection);
}

export function createRowSelectionTransaction(
  state: EditorState,
  tablePos: number,
  table: ProseMirrorNode,
  rowIndex: number,
): Transaction | undefined {
  const grid = createHtmlTableGrid(table);
  if (rowIndex < 0 || rowIndex >= grid.height) return undefined;

  const cells = getCellsForRow(grid, rowIndex);
  return createAxisSelectionTransaction(state, tablePos, table, grid, cells);
}

export function createColumnSelectionTransaction(
  state: EditorState,
  tablePos: number,
  table: ProseMirrorNode,
  columnIndex: number,
): Transaction | undefined {
  const grid = createHtmlTableGrid(table);
  if (columnIndex < 0 || columnIndex >= grid.width) return undefined;

  const cells = getCellsForColumn(grid, columnIndex);
  return createAxisSelectionTransaction(state, tablePos, table, grid, cells);
}

export function createAxisFocusTransaction(
  state: EditorState,
  tablePos: number,
  table: ProseMirrorNode,
  axis: 'row' | 'column',
  index: number,
): Transaction | undefined {
  const grid = createHtmlTableGrid(table);
  const limit = axis === 'row' ? grid.height : grid.width;
  if (index < 0 || index >= limit) return undefined;

  const cells = axis === 'row' ? getCellsForRow(grid, index) : getCellsForColumn(grid, index);
  const focusCell =
    axis === 'column'
      ? cells.find((cell) => cell.section === 'body') ?? cells[0]
      : cells[0];
  if (!focusCell) return undefined;

  const cellPositions = collectCellPositions(table, tablePos, grid);
  const focusCellPos = cellPositions.get(focusCell);
  if (focusCellPos === undefined) return undefined;

  return state.tr.setSelection(TextSelection.near(state.doc.resolve(focusCellPos + 1))).scrollIntoView();
}

export function createSelectionDecorations(
  state: import('@tiptap/pm/state').EditorState,
  options: HtmlTableTiptapOptions,
): DecorationSet {
  const decorations: Decoration[] = [];
  const selectionInfo =
    state.selection instanceof CellSelection || state.selection.empty
      ? getTableSelectionInfo(state.doc, state.selection)
      : undefined;

  if (selectionInfo) {
    for (const cell of selectionInfo.cells) {
      const cellPos = selectionInfo.cellPositions.get(cell);
      if (cellPos === undefined) continue;

      const classNames = [options.selectedCellClassName];
      if (cell === selectionInfo.anchorCell) classNames.push(`${options.selectedCellClassName}--anchor`);
      if (cell === selectionInfo.headCell) classNames.push(`${options.selectedCellClassName}--head`);

      decorations.push(
        Decoration.node(cellPos, cellPos + cell.node.nodeSize, {
          class: classNames.join(' '),
          'data-testid': 'pmht-selected-cell',
        }),
      );
    }

    decorations.push(
      Decoration.node(selectionInfo.tablePos, selectionInfo.tablePos + selectionInfo.table.nodeSize, {
        class: 'html-table-node--has-selection',
      }),
    );
  }

  if (state.selection instanceof NodeSelection && state.selection.node.type.name === htmlTableNodeNames.table) {
    decorations.push(
      Decoration.node(state.selection.from, state.selection.to, {
        class: options.selectedTableClassName,
      }),
    );
  }

  return DecorationSet.create(state.doc, decorations);
}

export function createHtmlTableSelectionPlugin(options: HtmlTableTiptapOptions): Plugin {
  return new Plugin({
    key: htmlTableSelectionPluginKey,
    props: {
      decorations(state) {
        return createSelectionDecorations(state, options);
      },
      handleClickOn(_view, _pos, node, _nodePos, event, direct) {
        if (!direct || node.type.name !== htmlTableNodeNames.table) return false;
        if (options.allowTableNodeSelection) return false;

        const target = event.target as HTMLElement | null;
        if (target?.closest('td,th,caption')) return false;
        return true;
      },
    },
  });
}

export function getTableSelectionInfo(
  doc: ProseMirrorNode,
  selection: import('@tiptap/pm/state').Selection,
): TableSelectionInfo | undefined {
  const tableContext = findTableContext(doc, selection);
  if (!tableContext) return undefined;

  const grid = createHtmlTableGrid(tableContext.table);
  const cellPositions = collectCellPositions(tableContext.table, tableContext.tablePos, grid);
  const cellPosToRef = new Map<number, HtmlTableCellRef>();
  for (const [cell, pos] of cellPositions.entries()) {
    cellPosToRef.set(pos, cell);
  }

  const fallbackCell = findCurrentCell(grid, selection, cellPositions);
  const anchorCell = selection instanceof CellSelection ? cellPosToRef.get(selection.anchorCellPos) ?? fallbackCell : fallbackCell;
  const headCell = selection instanceof CellSelection ? cellPosToRef.get(selection.headCellPos) ?? anchorCell : anchorCell;
  if (!anchorCell || !headCell) return undefined;

  const top = Math.min(anchorCell.rowIndex, headCell.rowIndex);
  const bottom = Math.max(anchorCell.rowIndex + anchorCell.rowSpan - 1, headCell.rowIndex + headCell.rowSpan - 1);
  const left = Math.min(anchorCell.columnIndex, headCell.columnIndex);
  const right = Math.max(anchorCell.columnIndex + anchorCell.colSpan - 1, headCell.columnIndex + headCell.colSpan - 1);
  const cells = uniqueCellsInRect(grid, top, bottom, left, right);

  return {
    ...tableContext,
    grid,
    anchorCell,
    headCell,
    cells,
    top,
    bottom,
    left,
    right,
    cellPositions,
  };
}

export function findAdjacentCell(
  selectionInfo: TableSelectionInfo,
  direction: 'left' | 'right' | 'up' | 'down',
): HtmlTableCellRef | undefined {
  const headCell = selectionInfo.headCell;
  const targetRowIndex =
    direction === 'up'
      ? headCell.rowIndex - 1
      : direction === 'down'
        ? headCell.rowIndex + headCell.rowSpan
        : headCell.rowIndex;
  const targetColumnIndex =
    direction === 'left'
      ? headCell.columnIndex - 1
      : direction === 'right'
        ? headCell.columnIndex + headCell.colSpan
        : headCell.columnIndex;

  if (targetRowIndex < 0 || targetRowIndex >= selectionInfo.grid.height) return undefined;
  if (targetColumnIndex < 0 || targetColumnIndex >= selectionInfo.grid.width) return undefined;

  const targetCell = selectionInfo.grid.slots[targetRowIndex]?.[targetColumnIndex]?.cell;
  if (!targetCell) return undefined;
  if (targetCell.section !== headCell.section || targetCell.sectionIndex !== headCell.sectionIndex) return undefined;

  return targetCell;
}

function findTableContext(doc: ProseMirrorNode, selection: import('@tiptap/pm/state').Selection): TableContext | undefined {
  const $from = selection.$from;

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === htmlTableNodeNames.table) {
      return {
        table: node,
        tablePos: $from.before(depth),
      };
    }
  }

  return undefined;
}

function collectCellPositions(
  table: ProseMirrorNode,
  tablePos: number,
  grid = createHtmlTableGrid(table),
): Map<HtmlTableCellRef, number> {
  const cellPositions = new Map<HtmlTableCellRef, number>();
  const sectionCounters = {
    head: 0,
    body: 0,
    foot: 0,
  };

  table.forEach((section, sectionOffset) => {
    const sectionName = getSectionName(section);
    if (!sectionName) return;

    const sectionIndex = sectionCounters[sectionName];
    sectionCounters[sectionName] += 1;

    section.forEach((row, rowOffset, rowIndexInSection) => {
      row.forEach((cellNode, cellOffset, cellIndex) => {
        const cell = grid.cells.find(
          (item) =>
            item.section === sectionName &&
            item.sectionIndex === sectionIndex &&
            item.rowIndexInSection === rowIndexInSection &&
            item.cellIndex === cellIndex &&
            item.node === cellNode,
        );

        if (cell) {
          cellPositions.set(cell, tablePos + 1 + sectionOffset + 1 + rowOffset + 1 + cellOffset);
        }
      });
    });
  });

  return cellPositions;
}

function uniqueCellsInRect(
  grid: ReturnType<typeof createHtmlTableGrid>,
  top: number,
  bottom: number,
  left: number,
  right: number,
): HtmlTableCellRef[] {
  const cells: HtmlTableCellRef[] = [];
  const seen = new Set<HtmlTableCellRef>();

  for (let rowIndex = top; rowIndex <= bottom; rowIndex += 1) {
    for (let columnIndex = left; columnIndex <= right; columnIndex += 1) {
      const cell = grid.slots[rowIndex]?.[columnIndex]?.cell;
      if (cell && !seen.has(cell)) {
        seen.add(cell);
        cells.push(cell);
      }
    }
  }

  return cells.sort((a, b) => (a.rowIndex - b.rowIndex) || (a.columnIndex - b.columnIndex));
}

function findCurrentCell(
  grid: ReturnType<typeof createHtmlTableGrid>,
  selection: import('@tiptap/pm/state').Selection,
  cellPositions: Map<HtmlTableCellRef, number>,
): HtmlTableCellRef | undefined {
  const selectedNode = selection.$from.parent;

  for (const cell of grid.cells) {
    if (cell.node === selectedNode) return cell;

    const pos = cellPositions.get(cell);
    if (pos !== undefined && selection.from >= pos && selection.from <= pos + cell.node.nodeSize) {
      return cell;
    }
  }

  return grid.cells[0];
}

function getSectionName(node: ProseMirrorNode) {
  if (node.type.name === htmlTableNodeNames.head) return 'head';
  if (node.type.name === htmlTableNodeNames.body) return 'body';
  if (node.type.name === htmlTableNodeNames.foot) return 'foot';
  return undefined;
}

function isSection(node: ProseMirrorNode) {
  return node.type.name === htmlTableNodeNames.head || node.type.name === htmlTableNodeNames.body || node.type.name === htmlTableNodeNames.foot;
}

function getChildren(node: ProseMirrorNode): ProseMirrorNode[] {
  const children: ProseMirrorNode[] = [];
  node.forEach((child) => children.push(child));
  return children;
}

function findChild(node: ProseMirrorNode, typeName: string): ProseMirrorNode | undefined {
  for (let index = 0; index < node.childCount; index += 1) {
    const child = node.child(index);
    if (child.type.name === typeName) return child;
  }

  return undefined;
}

function normalizeWidth(value: unknown, fallback: number) {
  const width = Number(value);
  return Number.isFinite(width) && width > 0 ? width : fallback;
}

function createAxisSelectionTransaction(
  state: EditorState,
  tablePos: number,
  table: ProseMirrorNode,
  grid: ReturnType<typeof createHtmlTableGrid>,
  cells: HtmlTableCellRef[],
): Transaction | undefined {
  if (cells.length === 0) return undefined;

  const cellPositions = collectCellPositions(table, tablePos, grid);
  const anchorCellPos = cellPositions.get(cells[0]!);
  const headCellPos = cellPositions.get(cells[cells.length - 1]!);
  if (anchorCellPos === undefined || headCellPos === undefined) return undefined;

  return state.tr.setSelection(CellSelection.create(state.doc, anchorCellPos, headCellPos)).scrollIntoView();
}

function getCellsForRow(
  grid: ReturnType<typeof createHtmlTableGrid>,
  rowIndex: number,
): HtmlTableCellRef[] {
  const cells: HtmlTableCellRef[] = [];
  const seen = new Set<HtmlTableCellRef>();

  for (let columnIndex = 0; columnIndex < grid.width; columnIndex += 1) {
    const cell = grid.slots[rowIndex]?.[columnIndex]?.cell;
    if (cell && !seen.has(cell)) {
      seen.add(cell);
      cells.push(cell);
    }
  }

  return cells.sort((a, b) => (a.columnIndex - b.columnIndex) || (a.rowIndex - b.rowIndex));
}

function getCellsForColumn(
  grid: ReturnType<typeof createHtmlTableGrid>,
  columnIndex: number,
): HtmlTableCellRef[] {
  const cells: HtmlTableCellRef[] = [];
  const seen = new Set<HtmlTableCellRef>();

  for (let rowIndex = 0; rowIndex < grid.height; rowIndex += 1) {
    const cell = grid.slots[rowIndex]?.[columnIndex]?.cell;
    if (cell && !seen.has(cell)) {
      seen.add(cell);
      cells.push(cell);
    }
  }

  return cells.sort((a, b) => (a.rowIndex - b.rowIndex) || (a.columnIndex - b.columnIndex));
}

function preserveSelectionOnResize(
  selection: Selection,
  doc: ProseMirrorNode,
  tablePos: number,
  previousTable: ProseMirrorNode,
  nextTable: ProseMirrorNode,
): Selection | undefined {
  if (selection instanceof NodeSelection && selection.from === tablePos) {
    return NodeSelection.create(doc, tablePos);
  }

  const previousSectionStart = getFirstSectionStart(previousTable);
  const nextSectionStart = getFirstSectionStart(nextTable);
  if (previousSectionStart === undefined || nextSectionStart === undefined) return undefined;

  const delta = nextSectionStart - previousSectionStart;
  if (
    selection.from < tablePos ||
    selection.to > tablePos + previousTable.nodeSize
  ) {
    return undefined;
  }

  if (selection instanceof CellSelection) {
    const anchorCellPos = selection.anchorCellPos + delta;
    const headCellPos = selection.headCellPos + delta;

    if (isCellPosition(doc, anchorCellPos) && isCellPosition(doc, headCellPos)) {
      return CellSelection.create(doc, anchorCellPos, headCellPos);
    }

    return undefined;
  }

  const mappedFrom = clampSelectionPos(doc, selection.from + delta);
  const mappedTo = clampSelectionPos(doc, selection.to + delta);
  return TextSelection.create(doc, mappedFrom, mappedTo);
}

function getFirstSectionStart(table: ProseMirrorNode): number | undefined {
  let result: number | undefined;

  table.forEach((child, offset) => {
    if (result !== undefined) return;
    if (
      child.type.name === htmlTableNodeNames.head ||
      child.type.name === htmlTableNodeNames.body ||
      child.type.name === htmlTableNodeNames.foot
    ) {
      result = offset;
    }
  });

  return result;
}

function isCellPosition(doc: ProseMirrorNode, pos: number): boolean {
  if (pos < 0 || pos >= doc.content.size) return false;

  const node = doc.nodeAt(pos);
  return node?.type.name === htmlTableNodeNames.cell || node?.type.name === htmlTableNodeNames.headerCell;
}

function clampSelectionPos(doc: ProseMirrorNode, pos: number): number {
  return Math.max(0, Math.min(pos, doc.content.size));
}
