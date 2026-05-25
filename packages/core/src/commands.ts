import { Fragment, type Node as ProseMirrorNode, type Schema } from 'prosemirror-model';
import type { Command, EditorState } from 'prosemirror-state';

import { createHtmlTableNode, type CreateHtmlTableOptions } from './builders.js';
import { createHtmlTableGrid, type HtmlTableCellRef, type HtmlTableGrid, type HtmlTableSectionName } from './grid.js';
import { htmlTableNodeNames } from './names.js';
import type { HtmlTableNodeNames } from './types.js';

export interface HtmlTableCommandOptions {
  names?: Partial<HtmlTableNodeNames>;
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
