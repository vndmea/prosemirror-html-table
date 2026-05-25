import { Fragment, type Node as ProseMirrorNode, type Schema } from 'prosemirror-model';
import { NodeSelection, TextSelection, type Command, type EditorState } from 'prosemirror-state';

import { createHtmlTableNode, type CreateHtmlTableOptions } from './builders.js';
import { createHtmlTableGrid, type HtmlTableCellRef, type HtmlTableGrid, type HtmlTableSectionName } from './grid.js';
import { htmlTableNodeNames } from './names.js';
import type { HtmlTableNodeNames } from './types.js';

export interface HtmlTableCommandOptions {
  names?: Partial<HtmlTableNodeNames>;
}

export interface HtmlTableCellNavigationOptions extends HtmlTableCommandOptions {
  cycle?: boolean;
}

export interface InsertHtmlTableCommandOptions extends CreateHtmlTableOptions {
  selectInsertedTable?: boolean;
}

interface TableContext {
  names: HtmlTableNodeNames;
  table: ProseMirrorNode;
  tablePos: number;
}

interface RowContext extends TableContext {
  row: ProseMirrorNode;
  section: ProseMirrorNode;
  sectionName: HtmlTableSectionName;
  sectionChildIndex: number;
  rowIndexInSection: number;
}

interface CellContext extends RowContext {
  cell: HtmlTableCellRef;
}

export function insertHtmlTable(options: InsertHtmlTableCommandOptions = {}): Command {
  return (state, dispatch) => {
    const table = createHtmlTableNode(state.schema, options);

    if (dispatch) {
      const transaction = state.tr.replaceSelectionWith(table);
      dispatch(transaction.scrollIntoView());
    }

    return true;
  };
}

export function addRowBefore(options: HtmlTableCommandOptions = {}): Command {
  return addRow('before', options);
}

export function addRowAfter(options: HtmlTableCommandOptions = {}): Command {
  return addRow('after', options);
}

export function deleteRow(options: HtmlTableCommandOptions = {}): Command {
  return (state, dispatch) => {
    const context = findRowContext(state, options);
    if (!context) return false;

    const tableChildren = getChildren(context.table);
    const sectionChildren = getChildren(context.section);

    if (context.sectionName === 'body' && countSections(context.table, context.names.body) === 1 && sectionChildren.length === 1) {
      return false;
    }

    if (sectionChildren.length === 1) {
      tableChildren.splice(context.sectionChildIndex, 1);
    } else {
      sectionChildren.splice(context.rowIndexInSection, 1);
      tableChildren[context.sectionChildIndex] = context.section.copy(Fragment.fromArray(sectionChildren));
    }

    return replaceTable(state, dispatch, context, context.table.copy(Fragment.fromArray(tableChildren)));
  };
}

export function addColumnBefore(options: HtmlTableCommandOptions = {}): Command {
  return addColumn('before', options);
}

export function addColumnAfter(options: HtmlTableCommandOptions = {}): Command {
  return addColumn('after', options);
}

export function deleteColumn(options: HtmlTableCommandOptions = {}): Command {
  return (state, dispatch) => {
    const context = findCellContext(state, options);
    if (!context) return false;

    const grid = createHtmlTableGrid(context.table, { names: context.names });
    if (grid.width <= 1) return false;

    const targetColumn = context.cell.columnIndex;
    const tableChildren = getChildren(context.table);

    forEachSection(context.table, context.names, (section, _sectionName, sectionChildIndex) => {
      const rows = getChildren(section).map((row) => {
        const globalRowIndex = findGlobalRowIndexByNode(grid, row);
        const rowChildren = getChildren(row);
        const nextRowChildren: ProseMirrorNode[] = [];

        rowChildren.forEach((cellNode, cellIndex) => {
          const cell = grid.cells.find(
            (item) =>
              item.rowIndex === globalRowIndex &&
              item.cellIndex === cellIndex &&
              item.node === cellNode,
          );

          if (!cell) {
            nextRowChildren.push(cellNode);
            return;
          }

          const startsBeforeOrAtTarget = cell.columnIndex <= targetColumn;
          const endsAfterTarget = cell.columnIndex + cell.colSpan > targetColumn;
          const coversTargetColumn = startsBeforeOrAtTarget && endsAfterTarget;

          if (!coversTargetColumn) {
            nextRowChildren.push(cellNode);
            return;
          }

          if (cell.colSpan > 1) {
            nextRowChildren.push(copyCellWithAttrs(cellNode, { colspan: cell.colSpan - 1 }));
            return;
          }

          if (cell.columnIndex !== targetColumn) {
            nextRowChildren.push(cellNode);
          }
        });

        return row.copy(Fragment.fromArray(nextRowChildren));
      });

      tableChildren[sectionChildIndex] = section.copy(Fragment.fromArray(rows));
    });

    return replaceTable(state, dispatch, context, context.table.copy(Fragment.fromArray(tableChildren)));
  };
}

export function deleteTable(options: HtmlTableCommandOptions = {}): Command {
  return (state, dispatch) => {
    const context = findTableContext(state, options);
    if (!context) return false;

    if (dispatch) {
      dispatch(state.tr.delete(context.tablePos, context.tablePos + context.table.nodeSize).scrollIntoView());
    }

    return true;
  };
}

export function setCellAttribute(
  name: string,
  value: unknown,
  options: HtmlTableCommandOptions = {},
): Command {
  return (state, dispatch) => {
    const context = findCellContext(state, options);
    if (!context) return false;

    const table = updateCellAt(context, context.cell, (cell) => copyCellWithAttrs(cell, { [name]: value }));
    return replaceTable(state, dispatch, context, table);
  };
}

export function toggleHeaderCell(options: HtmlTableCommandOptions = {}): Command {
  return (state, dispatch) => {
    const context = findCellContext(state, options);
    if (!context) return false;

    const table = updateCellAt(context, context.cell, (cell) =>
      convertCellType(state.schema, context.names, cell, isHeaderCell(context.names, cell) ? 'body' : 'header'),
    );

    return replaceTable(state, dispatch, context, table);
  };
}

export function toggleHeaderRow(options: HtmlTableCommandOptions = {}): Command {
  return (state, dispatch) => {
    const context = findRowContext(state, options);
    if (!context) return false;

    const rowChildren = getChildren(context.row);
    const shouldConvertToHeader = rowChildren.some((cell) => !isHeaderCell(context.names, cell));
    const nextRow = context.row.copy(
      Fragment.fromArray(
        rowChildren.map((cell) =>
          convertCellType(state.schema, context.names, cell, shouldConvertToHeader ? 'header' : 'body'),
        ),
      ),
    );
    const table = updateRowAt(context, nextRow);

    return replaceTable(state, dispatch, context, table);
  };
}

export function toggleHeaderColumn(options: HtmlTableCommandOptions = {}): Command {
  return (state, dispatch) => {
    const context = findCellContext(state, options);
    if (!context) return false;

    const grid = createHtmlTableGrid(context.table, { names: context.names });
    const targetColumn = context.cell.columnIndex;
    const targetCells = grid.cells.filter((cell) => cell.columnIndex <= targetColumn && cell.columnIndex + cell.colSpan > targetColumn);
    if (targetCells.length === 0) return false;

    const shouldConvertToHeader = targetCells.some((cell) => !isHeaderCell(context.names, cell.node));
    const targetCellSet = new Set(targetCells.map((cell) => cell.node));
    const tableChildren = getChildren(context.table);

    forEachSection(context.table, context.names, (section, _sectionName, sectionChildIndex) => {
      const rows = getChildren(section).map((row) => {
        const rowChildren = getChildren(row).map((cell) => {
          if (!targetCellSet.has(cell)) return cell;
          return convertCellType(state.schema, context.names, cell, shouldConvertToHeader ? 'header' : 'body');
        });

        return row.copy(Fragment.fromArray(rowChildren));
      });

      tableChildren[sectionChildIndex] = section.copy(Fragment.fromArray(rows));
    });

    return replaceTable(state, dispatch, context, context.table.copy(Fragment.fromArray(tableChildren)));
  };
}

export function goToNextCell(options: HtmlTableCellNavigationOptions = {}): Command {
  return goToRelativeCell(1, options);
}

export function goToPreviousCell(options: HtmlTableCellNavigationOptions = {}): Command {
  return goToRelativeCell(-1, options);
}

export function selectCell(options: HtmlTableCommandOptions = {}): Command {
  return (state, dispatch) => {
    const context = findCellContext(state, options);
    if (!context) return false;

    return setCellNodeSelection(state, dispatch, context, context.cell);
  };
}

export function selectRow(options: HtmlTableCommandOptions = {}): Command {
  return (state, dispatch) => {
    const context = findCellContext(state, options);
    if (!context) return false;

    const grid = createHtmlTableGrid(context.table, { names: context.names });
    const rowCells = grid.cells
      .filter((cell) => cell.rowIndex === context.cell.rowIndex)
      .sort((a, b) => a.columnIndex - b.columnIndex);

    return setCellRangeSelection(state, dispatch, context, rowCells);
  };
}

export function selectColumn(options: HtmlTableCommandOptions = {}): Command {
  return (state, dispatch) => {
    const context = findCellContext(state, options);
    if (!context) return false;

    const grid = createHtmlTableGrid(context.table, { names: context.names });
    const columnCells = grid.cells
      .filter((cell) => cell.columnIndex <= context.cell.columnIndex && cell.columnIndex + cell.colSpan > context.cell.columnIndex)
      .sort((a, b) => a.rowIndex - b.rowIndex);

    return setCellRangeSelection(state, dispatch, context, columnCells);
  };
}

export function selectTable(options: HtmlTableCommandOptions = {}): Command {
  return (state, dispatch) => {
    const context = findTableContext(state, options);
    if (!context) return false;

    if (dispatch) {
      dispatch(state.tr.setSelection(NodeSelection.create(state.doc, context.tablePos)).scrollIntoView());
    }

    return true;
  };
}

function goToRelativeCell(direction: 1 | -1, options: HtmlTableCellNavigationOptions): Command {
  return (state, dispatch) => {
    const context = findCellContext(state, options);
    if (!context) return false;

    const grid = createHtmlTableGrid(context.table, { names: context.names });
    const currentIndex = grid.cells.findIndex((cell) => cell.node === context.cell.node);
    if (currentIndex < 0) return false;

    let targetIndex = currentIndex + direction;

    if (targetIndex < 0 || targetIndex >= grid.cells.length) {
      if (!options.cycle) return false;
      targetIndex = direction > 0 ? 0 : grid.cells.length - 1;
    }

    const targetCell = grid.cells[targetIndex];
    if (!targetCell) return false;

    return setSelectionInsideCell(state, dispatch, context, targetCell);
  };
}

function addRow(direction: 'before' | 'after', options: HtmlTableCommandOptions): Command {
  return (state, dispatch) => {
    const context = findRowContext(state, options);
    if (!context) return false;

    const grid = createHtmlTableGrid(context.table, { names: context.names });
    const width = Math.max(1, grid.width || context.row.childCount || 1);
    const row = createEmptyRow(state.schema, context.names, context.sectionName, width);
    const tableChildren = getChildren(context.table);
    const sectionChildren = getChildren(context.section);
    const insertIndex = context.rowIndexInSection + (direction === 'after' ? 1 : 0);

    sectionChildren.splice(insertIndex, 0, row);
    tableChildren[context.sectionChildIndex] = context.section.copy(Fragment.fromArray(sectionChildren));

    return replaceTable(state, dispatch, context, context.table.copy(Fragment.fromArray(tableChildren)));
  };
}

function addColumn(direction: 'before' | 'after', options: HtmlTableCommandOptions): Command {
  return (state, dispatch) => {
    const context = findCellContext(state, options);
    if (!context) return false;

    const grid = createHtmlTableGrid(context.table, { names: context.names });
    const insertColumn = context.cell.columnIndex + (direction === 'after' ? context.cell.colSpan : 0);
    const tableChildren = getChildren(context.table);

    forEachSection(context.table, context.names, (section, sectionName, sectionChildIndex) => {
      const rows = getChildren(section).map((row) => {
        const globalRowIndex = findGlobalRowIndexByNode(grid, row);
        const rowChildren = getChildren(row);
        const insertCellIndex = countAnchorsBeforeColumn(grid, globalRowIndex, insertColumn);
        const cell = createEmptyCell(state.schema, context.names, sectionName === 'head' ? 'header' : 'body');

        rowChildren.splice(insertCellIndex, 0, cell);
        return row.copy(Fragment.fromArray(rowChildren));
      });

      tableChildren[sectionChildIndex] = section.copy(Fragment.fromArray(rows));
    });

    return replaceTable(state, dispatch, context, context.table.copy(Fragment.fromArray(tableChildren)));
  };
}

function findTableContext(state: EditorState, options: HtmlTableCommandOptions): TableContext | undefined {
  const names: HtmlTableNodeNames = {
    ...htmlTableNodeNames,
    ...options.names,
  };
  const { $from } = state.selection;

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);

    if (node.type.name === names.table) {
      return {
        names,
        table: node,
        tablePos: $from.before(depth),
      };
    }
  }

  return undefined;
}

function findRowContext(state: EditorState, options: HtmlTableCommandOptions): RowContext | undefined {
  const tableContext = findTableContext(state, options);
  if (!tableContext) return undefined;

  const { $from } = state.selection;
  let selectedRow: ProseMirrorNode | undefined;

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);

    if (node.type.name === tableContext.names.row) {
      selectedRow = node;
      break;
    }
  }

  return findRowContextByNode(tableContext, selectedRow);
}

function findCellContext(state: EditorState, options: HtmlTableCommandOptions): CellContext | undefined {
  const rowContext = findRowContext(state, options);
  if (!rowContext) return undefined;

  const { $from } = state.selection;
  let selectedCellNode: ProseMirrorNode | undefined;

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);

    if (node.type.name === rowContext.names.cell || node.type.name === rowContext.names.headerCell) {
      selectedCellNode = node;
      break;
    }
  }

  const grid = createHtmlTableGrid(rowContext.table, { names: rowContext.names });
  const cell = grid.cells.find((item) => item.node === selectedCellNode) ?? grid.cells[0];

  if (!cell) return undefined;

  return {
    ...rowContext,
    cell,
  };
}

function findRowContextByNode(
  tableContext: TableContext,
  selectedRow: ProseMirrorNode | undefined,
): RowContext | undefined {
  let fallback: RowContext | undefined;
  let result: RowContext | undefined;

  forEachSection(tableContext.table, tableContext.names, (section, sectionName, sectionChildIndex) => {
    section.forEach((row, _offset, rowIndexInSection) => {
      const rowContext: RowContext = {
        ...tableContext,
        row,
        section,
        sectionName,
        sectionChildIndex,
        rowIndexInSection,
      };

      fallback ??= rowContext;

      if (selectedRow && row === selectedRow) {
        result = rowContext;
      }
    });
  });

  return result ?? fallback;
}

function forEachSection(
  table: ProseMirrorNode,
  names: HtmlTableNodeNames,
  callback: (
    section: ProseMirrorNode,
    sectionName: HtmlTableSectionName,
    sectionChildIndex: number,
  ) => void,
): void {
  table.forEach((section, _offset, sectionChildIndex) => {
    if (section.type.name === names.head) {
      callback(section, 'head', sectionChildIndex);
      return;
    }

    if (section.type.name === names.body) {
      callback(section, 'body', sectionChildIndex);
      return;
    }

    if (section.type.name === names.foot) {
      callback(section, 'foot', sectionChildIndex);
    }
  });
}

function replaceTable(
  state: EditorState,
  dispatch: Parameters<Command>[1],
  context: TableContext,
  table: ProseMirrorNode,
): boolean {
  if (dispatch) {
    dispatch(state.tr.replaceWith(context.tablePos, context.tablePos + context.table.nodeSize, table).scrollIntoView());
  }

  return true;
}

function createEmptyRow(
  schema: Schema,
  names: HtmlTableNodeNames,
  sectionName: HtmlTableSectionName,
  columnCount: number,
): ProseMirrorNode {
  const rowType = getNodeType(schema, names.row);
  const cells = Array.from({ length: columnCount }, () =>
    createEmptyCell(schema, names, sectionName === 'head' ? 'header' : 'body'),
  );

  return rowType.create(null, cells);
}

function createEmptyCell(
  schema: Schema,
  names: HtmlTableNodeNames,
  kind: 'header' | 'body',
): ProseMirrorNode {
  const cellType = getNodeType(schema, kind === 'header' ? names.headerCell : names.cell);
  const paragraph = schema.nodes.paragraph?.createAndFill();
  const cell = cellType.createAndFill(null, paragraph ? [paragraph] : undefined);

  if (!cell) {
    throw new Error(`Unable to create table cell node: ${cellType.name}`);
  }

  return cell;
}

function updateCellAt(
  context: CellContext,
  cell: HtmlTableCellRef,
  updater: (cell: ProseMirrorNode) => ProseMirrorNode,
): ProseMirrorNode {
  const tableChildren = getChildren(context.table);
  const sectionChildren = getChildren(context.section);
  const row = sectionChildren[cell.rowIndexInSection];

  if (!row) return context.table;

  const rowChildren = getChildren(row);
  rowChildren[cell.cellIndex] = updater(rowChildren[cell.cellIndex]!);
  sectionChildren[cell.rowIndexInSection] = row.copy(Fragment.fromArray(rowChildren));
  tableChildren[context.sectionChildIndex] = context.section.copy(Fragment.fromArray(sectionChildren));

  return context.table.copy(Fragment.fromArray(tableChildren));
}

function updateRowAt(context: RowContext, row: ProseMirrorNode): ProseMirrorNode {
  const tableChildren = getChildren(context.table);
  const sectionChildren = getChildren(context.section);

  sectionChildren[context.rowIndexInSection] = row;
  tableChildren[context.sectionChildIndex] = context.section.copy(Fragment.fromArray(sectionChildren));

  return context.table.copy(Fragment.fromArray(tableChildren));
}

function setSelectionInsideCell(
  state: EditorState,
  dispatch: Parameters<Command>[1],
  context: TableContext,
  cell: HtmlTableCellRef,
): boolean {
  const cellPos = findCellPosition(context, cell);
  if (cellPos === undefined) return false;

  if (dispatch) {
    const $cellStart = state.doc.resolve(cellPos + 1);
    dispatch(state.tr.setSelection(TextSelection.near($cellStart, 1)).scrollIntoView());
  }

  return true;
}

function setCellNodeSelection(
  state: EditorState,
  dispatch: Parameters<Command>[1],
  context: TableContext,
  cell: HtmlTableCellRef,
): boolean {
  const cellPos = findCellPosition(context, cell);
  if (cellPos === undefined) return false;

  if (dispatch) {
    dispatch(state.tr.setSelection(NodeSelection.create(state.doc, cellPos)).scrollIntoView());
  }

  return true;
}

function setCellRangeSelection(
  state: EditorState,
  dispatch: Parameters<Command>[1],
  context: TableContext,
  cells: HtmlTableCellRef[],
): boolean {
  if (cells.length === 0) return false;
  if (cells.length === 1) return setCellNodeSelection(state, dispatch, context, cells[0]!);

  const firstCell = cells[0]!;
  const lastCell = cells[cells.length - 1]!;
  const firstCellPos = findCellPosition(context, firstCell);
  const lastCellPos = findCellPosition(context, lastCell);

  if (firstCellPos === undefined || lastCellPos === undefined) return false;

  if (dispatch) {
    const $from = state.doc.resolve(firstCellPos + 1);
    const $to = state.doc.resolve(lastCellPos + lastCell.node.nodeSize - 1);
    dispatch(state.tr.setSelection(TextSelection.between($from, $to)).scrollIntoView());
  }

  return true;
}

function findCellPosition(context: TableContext, cell: HtmlTableCellRef): number | undefined {
  let result: number | undefined;
  const sectionCounters: Record<HtmlTableSectionName, number> = {
    head: 0,
    body: 0,
    foot: 0,
  };

  context.table.forEach((section, sectionOffset) => {
    if (result !== undefined) return;

    const sectionName = getSectionName(section, context.names);
    if (!sectionName) return;

    const sectionIndex = sectionCounters[sectionName];
    sectionCounters[sectionName] += 1;

    if (sectionName !== cell.section || sectionIndex !== cell.sectionIndex) return;

    section.forEach((row, rowOffset, rowIndexInSection) => {
      if (result !== undefined || rowIndexInSection !== cell.rowIndexInSection) return;

      row.forEach((cellNode, cellOffset, cellIndex) => {
        if (result !== undefined) return;

        if (cellIndex === cell.cellIndex && cellNode === cell.node) {
          result = context.tablePos + 1 + sectionOffset + 1 + rowOffset + 1 + cellOffset;
        }
      });
    });
  });

  return result;
}

function getSectionName(node: ProseMirrorNode, names: HtmlTableNodeNames): HtmlTableSectionName | undefined {
  if (node.type.name === names.head) return 'head';
  if (node.type.name === names.body) return 'body';
  if (node.type.name === names.foot) return 'foot';
  return undefined;
}

function getChildren(node: ProseMirrorNode): ProseMirrorNode[] {
  const children: ProseMirrorNode[] = [];
  node.forEach((child) => children.push(child));
  return children;
}

function getNodeType(schema: Schema, name: string) {
  const nodeType = schema.nodes[name];

  if (!nodeType) {
    throw new Error(`Missing node type in schema: ${name}`);
  }

  return nodeType;
}

function countSections(table: ProseMirrorNode, sectionNodeName: string): number {
  let count = 0;

  table.forEach((child) => {
    if (child.type.name === sectionNodeName) count += 1;
  });

  return count;
}

function countAnchorsBeforeColumn(grid: HtmlTableGrid, rowIndex: number, columnIndex: number): number {
  return grid.cells.filter((cell) => cell.rowIndex === rowIndex && cell.columnIndex < columnIndex).length;
}

function findGlobalRowIndexByNode(grid: HtmlTableGrid, row: ProseMirrorNode): number {
  return grid.rows.find((item) => item.node === row)?.rowIndex ?? 0;
}

function isHeaderCell(names: HtmlTableNodeNames, cell: ProseMirrorNode): boolean {
  return cell.type.name === names.headerCell;
}

function convertCellType(
  schema: Schema,
  names: HtmlTableNodeNames,
  cell: ProseMirrorNode,
  kind: 'header' | 'body',
): ProseMirrorNode {
  const targetType = getNodeType(schema, kind === 'header' ? names.headerCell : names.cell);

  if (cell.type === targetType) return cell;

  return targetType.create(cell.attrs, cell.content, cell.marks);
}

function copyCellWithAttrs(cell: ProseMirrorNode, attrs: Record<string, unknown>): ProseMirrorNode {
  return cell.type.create(
    {
      ...cell.attrs,
      ...attrs,
    },
    cell.content,
    cell.marks,
  );
}
