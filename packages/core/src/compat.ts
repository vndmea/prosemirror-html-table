import { Fragment, type Node as ProseMirrorNode, type NodeType, type ResolvedPos, type Schema } from 'prosemirror-model';
import { type Command, type Selection } from 'prosemirror-state';

import {
  setCellAttribute,
  toggleHeaderCell,
  toggleHeaderColumn,
  toggleHeaderRow,
  type HtmlTableCommandOptions,
} from './commands.js';
import { createHtmlTableGrid, type HtmlTableCellRef, type HtmlTableGrid } from './grid.js';
import { htmlTableNodeNames } from './names.js';
import { CellSelection } from './selection.js';
import { normalizeHtmlTable } from './normalize.js';
import type { HtmlTableNodeNames } from './types.js';

export interface FindNodeResult {
  node: ProseMirrorNode;
  pos: number;
  start: number;
  depth: number;
}

export interface GetCellTypeOptions {
  node: ProseMirrorNode;
  row: number;
  col: number;
}

export type ToggleHeaderType = 'column' | 'row' | 'cell';

export interface ToggleHeaderOptions extends HtmlTableCommandOptions {
  useDeprecatedLogic?: boolean;
}

export function findTable($pos: ResolvedPos): FindNodeResult | null {
  for (let depth = $pos.depth; depth >= 0; depth -= 1) {
    const node = $pos.node(depth);
    if (node.type.spec.tableRole !== 'table') continue;

    return {
      node,
      pos: depth === 0 ? 0 : $pos.before(depth),
      start: $pos.start(depth),
      depth,
    };
  }

  return null;
}

export function findCellPos(doc: ProseMirrorNode, pos: number): ResolvedPos | undefined {
  const $pos = doc.resolve(pos);
  return cellAround($pos) ?? cellNear($pos);
}

export function findCellRange(
  selection: Selection,
  anchorHit?: number,
  headHit?: number,
): [ResolvedPos, ResolvedPos] | null {
  if (anchorHit == null && headHit == null && selection instanceof CellSelection) {
    return [selection.$anchor, selection.$head];
  }

  const anchor = anchorHit ?? headHit ?? selection.anchor;
  const head = headHit ?? anchorHit ?? selection.head;
  const doc = selection.$head.doc;
  const $anchorCell = findCellPos(doc, anchor);
  const $headCell = findCellPos(doc, head);

  if ($anchorCell && $headCell && inSameTable($anchorCell, $headCell)) {
    return [$anchorCell, $headCell];
  }

  return null;
}

export function setCellAttr(
  name: string,
  value: unknown,
  options: HtmlTableCommandOptions = {},
): Command {
  return setCellAttribute(name, value, options);
}

export function splitCellWithType(
  getCellType: (options: GetCellTypeOptions) => NodeType,
): Command {
  return (state, dispatch) => {
    const tableResult = findTable(state.selection.$from);
    if (!tableResult) return false;

    const names = htmlTableNodeNames;
    const cellPos = resolveSelectedCellPos(state.selection);
    if (cellPos === undefined) return false;

    const grid = createHtmlTableGrid(tableResult.node, { names });
    const cellPositions = collectCellPositions(tableResult, grid, names);
    const targetCell = grid.cells.find((cell) => cellPositions.get(cell) === cellPos);
    if (!targetCell) return false;
    if (targetCell.colSpan === 1 && targetCell.rowSpan === 1) return false;

    const nextTable = splitSelectedCellByType(state, tableResult.node, grid, targetCell, names, getCellType);

    if (dispatch) {
      let transaction = state.tr.replaceWith(
        tableResult.pos,
        tableResult.pos + tableResult.node.nodeSize,
        nextTable,
      );

      if (state.selection instanceof CellSelection) {
        const nextGrid = createHtmlTableGrid(nextTable, { names });
        const nextCellPositions = collectCellPositions(
          { ...tableResult, node: nextTable },
          nextGrid,
          names,
        );
        const anchorCell = nextGrid.slots[targetCell.rowIndex]?.[targetCell.columnIndex]?.cell;
        const headCell = nextGrid.slots[targetCell.rowIndex + targetCell.rowSpan - 1]?.[targetCell.columnIndex + targetCell.colSpan - 1]?.cell;
        const anchorCellPos = anchorCell ? nextCellPositions.get(anchorCell) : undefined;
        const headCellPos = headCell ? nextCellPositions.get(headCell) : undefined;

        if (anchorCellPos !== undefined && headCellPos !== undefined) {
          transaction = transaction.setSelection(CellSelection.create(transaction.doc, anchorCellPos, headCellPos));
        }
      }

      dispatch(transaction);
    }

    return true;
  };
}

export function toggleHeader(
  type: ToggleHeaderType,
  options: ToggleHeaderOptions = {},
): Command {
  switch (type) {
    case 'row':
      return toggleHeaderRow(options);
    case 'column':
      return toggleHeaderColumn(options);
    case 'cell':
      return toggleHeaderCell(options);
    default:
      return () => false;
  }
}

function resolveSelectedCellPos(selection: Selection): number | undefined {
  if (selection instanceof CellSelection) {
    if (selection.anchorCellPos !== selection.headCellPos) return undefined;
    return selection.anchorCellPos;
  }

  return findCellPos(selection.$head.doc, selection.from)?.pos;
}

function splitSelectedCellByType(
  state: Parameters<Command>[0],
  table: ProseMirrorNode,
  grid: HtmlTableGrid,
  cell: HtmlTableCellRef,
  names: HtmlTableNodeNames,
  getCellType: (options: GetCellTypeOptions) => NodeType,
): ProseMirrorNode {
  const tableChildren = getChildren(table);
  const sectionChildIndex = findSectionChildIndex(table, names, cell.section, cell.sectionIndex);
  const section = tableChildren[sectionChildIndex];
  if (!section) return table;

  const sectionChildren = getChildren(section);
  const splitAttrs = createSplitCellAttrs(cell.node.attrs, cell.colSpan);

  for (let rowOffset = 0; rowOffset < cell.rowSpan; rowOffset += 1) {
    const rowIndexInSection = cell.rowIndexInSection + rowOffset;
    const row = sectionChildren[rowIndexInSection];
    if (!row) continue;

    const rowChildren = getChildren(row);
    const insertIndex = countAnchorsBeforeColumn(grid, cell.rowIndex + rowOffset, cell.columnIndex);
    const newCells = Array.from({ length: cell.colSpan }, (_value, columnOffset) => {
      const attrs = splitAttrs[columnOffset] ?? splitAttrs[0] ?? { colspan: 1, rowspan: 1, colwidth: null };
      const targetType = getCellType({
        node: cell.node,
        row: cell.rowIndex + rowOffset,
        col: cell.columnIndex + columnOffset,
      });

      if (rowOffset === 0 && columnOffset === 0) {
        return targetType.create(attrs, cell.node.content, cell.node.marks);
      }

      return createEmptyTypedCell(state.schema, targetType, attrs);
    });

    if (rowOffset === 0) {
      rowChildren.splice(cell.cellIndex, 1, ...newCells);
    } else {
      rowChildren.splice(insertIndex, 0, ...newCells);
    }

    sectionChildren[rowIndexInSection] = row.copy(Fragment.fromArray(rowChildren));
  }

  tableChildren[sectionChildIndex] = section.copy(Fragment.fromArray(sectionChildren));
  return normalizeHtmlTable(table.copy(Fragment.fromArray(tableChildren)));
}

function collectCellPositions(
  tableResult: FindNodeResult,
  grid: HtmlTableGrid,
  names: HtmlTableNodeNames,
): Map<HtmlTableCellRef, number> {
  const positions = new Map<HtmlTableCellRef, number>();
  const sectionCounters = {
    head: 0,
    body: 0,
    foot: 0,
  };

  tableResult.node.forEach((sectionNode, sectionOffset) => {
    const sectionName = getSectionName(sectionNode.type.name, names);
    if (!sectionName) return;

    const sectionIndex = sectionCounters[sectionName];
    sectionCounters[sectionName] += 1;

    sectionNode.forEach((rowNode, rowOffset, rowIndexInSection) => {
      rowNode.forEach((cellNode, cellOffset, cellIndex) => {
        const cell = grid.cells.find((item) =>
          item.section === sectionName
          && item.sectionIndex === sectionIndex
          && item.rowIndexInSection === rowIndexInSection
          && item.cellIndex === cellIndex
          && item.node === cellNode);

        if (!cell) return;

        positions.set(cell, tableResult.pos + 1 + sectionOffset + 1 + rowOffset + 1 + cellOffset);
      });
    });
  });

  return positions;
}

function createSplitCellAttrs(
  attrs: Record<string, unknown>,
  colSpan: number,
): Array<Record<string, unknown>> {
  const baseAttrs: Record<string, unknown> = {
    ...attrs,
    colspan: 1,
    rowspan: 1,
  };
  const colwidth = normalizeColwidth(attrs.colwidth, colSpan);

  return Array.from({ length: colSpan }, (_value, index) => ({
    ...baseAttrs,
    colwidth: colwidth?.[index] ? [colwidth[index]] : null,
  }));
}

function createEmptyTypedCell(
  schema: Schema,
  cellType: NodeType,
  attrs: Record<string, unknown>,
): ProseMirrorNode {
  const paragraph = schema.nodes.paragraph?.createAndFill();
  const cell = cellType.createAndFill(attrs, paragraph ? [paragraph] : undefined);

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

function findSectionChildIndex(
  table: ProseMirrorNode,
  names: HtmlTableNodeNames,
  section: 'head' | 'body' | 'foot',
  targetSectionIndex: number,
): number {
  const sectionNodeName = names[section];
  let sectionIndex = 0;

  for (let childIndex = 0; childIndex < table.childCount; childIndex += 1) {
    const child = table.child(childIndex);
    if (child.type.name !== sectionNodeName) continue;
    if (sectionIndex === targetSectionIndex) return childIndex;
    sectionIndex += 1;
  }

  return -1;
}

function countAnchorsBeforeColumn(grid: HtmlTableGrid, rowIndex: number, columnIndex: number): number {
  return grid.cells.filter((cell) => cell.rowIndex === rowIndex && cell.columnIndex < columnIndex).length;
}

function getSectionName(
  typeName: string,
  names: HtmlTableNodeNames,
): 'head' | 'body' | 'foot' | undefined {
  if (typeName === names.head) return 'head';
  if (typeName === names.body) return 'body';
  if (typeName === names.foot) return 'foot';
  return undefined;
}

function inSameTable($anchorCell: ResolvedPos, $headCell: ResolvedPos): boolean {
  const anchorTable = findTable($anchorCell);
  const headTable = findTable($headCell);

  return !!anchorTable
    && !!headTable
    && anchorTable.pos === headTable.pos
    && anchorTable.depth === headTable.depth;
}

function normalizeColwidth(value: unknown, colSpan: number): number[] | null {
  if (!Array.isArray(value)) return null;

  const widths = value
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item > 0)
    .slice(0, colSpan);

  return widths.length > 0 ? widths : null;
}

function cellAround($pos: ResolvedPos): ResolvedPos | null {
  for (let depth = $pos.depth - 1; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.spec.tableRole === 'row') {
      return $pos.node(0).resolve($pos.before(depth + 1));
    }
  }

  return null;
}

function cellNear($pos: ResolvedPos): ResolvedPos | undefined {
  for (let after = $pos.nodeAfter, pos = $pos.pos; after; after = after.firstChild, pos += 1) {
    const role = after.type.spec.tableRole;
    if (role === 'cell' || role === 'header_cell') {
      return $pos.doc.resolve(pos);
    }
  }

  for (let before = $pos.nodeBefore, pos = $pos.pos; before; before = before.lastChild, pos -= 1) {
    const role = before.type.spec.tableRole;
    if (role === 'cell' || role === 'header_cell') {
      return $pos.doc.resolve(pos - before.nodeSize);
    }
  }

  return undefined;
}
