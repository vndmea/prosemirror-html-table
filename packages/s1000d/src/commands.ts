import { Fragment, type Node as ProseMirrorNode } from 'prosemirror-model';
import { Selection, type Command, type EditorState } from 'prosemirror-state';

import { createS1000DTableAdapter } from './adapter.js';
import { type ResolvedColspec, resolveColspecs } from './cals/colspec.js';
import { type ResolvedSpanspec, resolveSpanspecs } from './cals/spanspec.js';
import {
  findS1000DAncestorNode,
  resolveS1000DTableContext,
  type S1000DTableLookupOptions,
} from './context.js';
import { type S1000DEntryRef, type S1000DRowRef, type S1000DTgroupGrid } from './grid.js';
import {
  getS1000DNodeChildren,
  replaceActiveS1000DTgroup,
  replaceS1000DChildAt,
  replaceS1000DTableAndSelectEntry,
  replaceS1000DTableAndSelectRow,
} from './mutation.js';
import { s1000dTableNodeNames } from './names.js';
import { createEmptyS1000DEntry, normalizeS1000DTgroup } from './normalize.js';
import {
  findS1000DEntryByPosition,
} from './position.js';
import { isS1000DCellSelection } from './selection.js';

export type S1000DTableCommandOptions = S1000DTableLookupOptions;

export interface S1000DTableContext {
  table: ProseMirrorNode;
  tablePos: number;
  activeTgroup: ProseMirrorNode | null;
  activeTgroupIndex: number;
}

export interface S1000DRowContext extends S1000DTableContext {
  row: ProseMirrorNode;
  rowRef: S1000DRowRef;
  section: ProseMirrorNode;
  sectionChildIndex: number;
}

export interface S1000DEntryContext extends S1000DRowContext {
  entry: S1000DEntryRef;
}

interface S1000DCellSelectionInfo {
  context: S1000DTableContext;
  grid: S1000DTgroupGrid;
  anchorEntry: S1000DEntryRef;
  headEntry: S1000DEntryRef;
  entries: S1000DEntryRef[];
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export function findS1000DTableContext(
  state: EditorState,
  options: S1000DTableCommandOptions = {},
): S1000DTableContext | null {
  return resolveS1000DTableContext(state, options);
}

export function findS1000DRowContext(
  state: EditorState,
  options: S1000DTableCommandOptions = {},
): S1000DRowContext | null {
  const tableContext = findS1000DTableContext(state, options);
  if (!tableContext?.activeTgroup || tableContext.activeTgroupIndex < 0) return null;

  const grid = createS1000DTableAdapter().createGrid(tableContext.activeTgroup, tableContext.activeTgroupIndex);
  const selectedRow = findS1000DAncestorNode(state.selection, s1000dTableNodeNames.row);
  const rowRef = grid.rows.find((item) => item.node === selectedRow)
    ?? findRowRefBySelection(grid, state.selection)
    ?? grid.rows[0];
  if (!rowRef) return null;

  const sectionChildIndex = findSectionChildIndex(tableContext.activeTgroup, rowRef.section);
  const section = sectionChildIndex >= 0 ? tableContext.activeTgroup.child(sectionChildIndex) : null;
  const row = section?.child(rowRef.rowIndexInSection) ?? rowRef.node;
  if (!section) return null;

  return {
    ...tableContext,
    row,
    rowRef,
    section,
    sectionChildIndex,
  };
}

export function findS1000DEntryContext(
  state: EditorState,
  options: S1000DTableCommandOptions = {},
): S1000DEntryContext | null {
  const rowContext = findS1000DRowContext(state, options);
  if (!rowContext?.activeTgroup || rowContext.activeTgroupIndex < 0) return null;

  const grid = createS1000DTableAdapter().createGrid(rowContext.activeTgroup, rowContext.activeTgroupIndex);
  const selectedEntryNode = findS1000DAncestorNode(state.selection, s1000dTableNodeNames.entry);
  const entry = grid.entries.find((item) => item.node === selectedEntryNode) ??
    findEntryRefBySelection(grid, state.selection) ??
    grid.entries.find((item) => item.rowIndex === rowContext.rowRef.rowIndex);
  if (!entry) return null;

  return {
    ...rowContext,
    entry,
  };
}

export function getActiveS1000DTgroupGrid(
  state: EditorState,
  options: S1000DTableCommandOptions = {},
): S1000DTgroupGrid | null {
  const context = findS1000DTableContext(state, options);
  if (!context?.activeTgroup || context.activeTgroupIndex < 0) return null;

  return createS1000DTableAdapter().createGrid(context.activeTgroup, context.activeTgroupIndex);
}

export function canOperateOnS1000DTable(
  state: EditorState,
  options: S1000DTableCommandOptions = {},
): boolean {
  const context = findS1000DTableContext(state, options);
  if (!context) return false;

  return !isGraphicOnlyS1000DTable(context.table) && context.activeTgroup !== null;
}

export function rejectGraphicOnlyS1000DTable(
  options: S1000DTableCommandOptions = {},
): Command {
  return (state) => canOperateOnS1000DTable(state, options);
}

export function addS1000DRowAfter(options: S1000DTableCommandOptions = {}): Command {
  return addS1000DRow('after', options);
}

export function addS1000DRowBefore(options: S1000DTableCommandOptions = {}): Command {
  return addS1000DRow('before', options);
}

function addS1000DRow(position: 'before' | 'after', options: S1000DTableCommandOptions = {}): Command {
  return (state, dispatch) => {
    const context = findS1000DRowContext(state, options);
    if (!context?.activeTgroup) return false;

    const width = Math.max(1, createS1000DTableAdapter().createGrid(context.activeTgroup, context.activeTgroupIndex).width);
    const nextRow = createEmptyS1000DRow(context.row.type.schema, width, context.rowRef.rowIndex + 1);
    const sectionChildren = getS1000DNodeChildren(context.section);
    const insertIndex = position === 'before' ? context.rowRef.rowIndexInSection : context.rowRef.rowIndexInSection + 1;
    sectionChildren.splice(insertIndex, 0, nextRow);

    const nextSection = context.section.copy(Fragment.fromArray(sectionChildren));
    const nextTgroup = replaceS1000DChildAt(context.activeTgroup, context.sectionChildIndex, nextSection);
    const normalizedTgroup = normalizeS1000DTgroup(nextTgroup);
    const nextTable = replaceActiveS1000DTgroup(context.table, normalizedTgroup, context.activeTgroupIndex);

    return replaceS1000DTableAndSelectRow(
      state,
      dispatch,
      context,
      nextTable,
      context.rowRef.section,
      insertIndex,
    );
  };
}

export function deleteS1000DRow(options: S1000DTableCommandOptions = {}): Command {
  return (state, dispatch) => {
    const context = findS1000DRowContext(state, options);
    if (!context?.activeTgroup) return false;

    const sectionChildren = getS1000DNodeChildren(context.section);
    if (sectionChildren.length <= 1) return false;

    sectionChildren.splice(context.rowRef.rowIndexInSection, 1);
    const nextSection = context.section.copy(Fragment.fromArray(sectionChildren));
    const nextTgroup = replaceS1000DChildAt(context.activeTgroup, context.sectionChildIndex, nextSection);
    const normalizedTgroup = normalizeS1000DTgroup(nextTgroup);
    const nextTable = replaceActiveS1000DTgroup(context.table, normalizedTgroup, context.activeTgroupIndex);

    return replaceS1000DTableAndSelectRow(
      state,
      dispatch,
      context,
      nextTable,
      context.rowRef.section,
      Math.min(context.rowRef.rowIndexInSection, sectionChildren.length - 1),
    );
  };
}

export function mergeS1000DCells(options: S1000DTableCommandOptions = {}): Command {
  return (state, dispatch) => {
    const selectionInfo = getS1000DCellSelectionInfo(state, options);
    if (!selectionInfo || selectionInfo.entries.length < 2) return false;
    if (!isRectangularS1000DSelection(selectionInfo)) return false;

    const width = selectionInfo.right - selectionInfo.left + 1;
    const ensureColspecs = width > 1;
    const tgroup = ensureColspecs
      ? ensureTgroupColspecs(selectionInfo.context.activeTgroup!, selectionInfo.grid.width)
      : selectionInfo.context.activeTgroup!;
    const support = analyzeColumnEditingSupport(
      tgroup,
      createS1000DTableAdapter().createGrid(tgroup, selectionInfo.context.activeTgroupIndex),
    );
    const nextRowsTgroup = mapTgroupRowsWithGrid(tgroup, selectionInfo.grid, (row, rowRef) => {
      if (rowRef.section !== selectionInfo.anchorEntry.section) return row;
      if (rowRef.rowIndex < selectionInfo.top || rowRef.rowIndex > selectionInfo.bottom) return row;

      const rowChildren = getS1000DNodeChildren(row);
      const rowEntries = selectionInfo.entries
        .filter((entry) => entry.rowIndex === rowRef.rowIndex)
        .sort((left, right) => right.entryIndex - left.entryIndex);
      if (rowEntries.length === 0) return row;

      for (const entry of rowEntries) {
        if (entry === selectionInfo.anchorEntry) {
          rowChildren[entry.entryIndex] = createMergedS1000DEntry(
            rowChildren[entry.entryIndex]!,
            selectionInfo,
            support,
            selectionInfo.entries.map((item) => item.node),
          );
        } else {
          rowChildren.splice(entry.entryIndex, 1);
        }
      }

      return row.copy(Fragment.fromArray(rowChildren));
    });
    const normalizedTgroup = normalizeS1000DTgroup(nextRowsTgroup);
    const nextTable = replaceActiveS1000DTgroup(
      selectionInfo.context.table,
      normalizedTgroup,
      selectionInfo.context.activeTgroupIndex,
    );

    return replaceS1000DTableAndSelectEntry(
      state,
      dispatch,
      selectionInfo.context,
      nextTable,
      selectionInfo.anchorEntry.section,
      selectionInfo.anchorEntry.rowIndexInSection,
      selectionInfo.anchorEntry.columnIndex,
      findBestEntryForSelection,
    );
  };
}

export function splitS1000DCell(options: S1000DTableCommandOptions = {}): Command {
  return (state, dispatch) => {
    const context = findS1000DEntryContext(state, options);
    if (!context?.activeTgroup) return false;
    if (context.entry.colSpan === 1 && context.entry.rowSpan === 1) return false;

    const ensureColspecs = context.entry.colSpan > 1;
    const tgroup = ensureColspecs
      ? ensureTgroupColspecs(context.activeTgroup, createS1000DTableAdapter().createGrid(context.activeTgroup, context.activeTgroupIndex).width)
      : context.activeTgroup;
    const grid = createS1000DTableAdapter().createGrid(context.activeTgroup, context.activeTgroupIndex);
    const support = analyzeColumnEditingSupport(
      tgroup,
      createS1000DTableAdapter().createGrid(tgroup, context.activeTgroupIndex),
    );
    const nextRowsTgroup = mapTgroupRowsWithGrid(tgroup, grid, (row, rowRef) => {
      if (rowRef.section !== context.entry.section) return row;
      if (rowRef.rowIndex < context.entry.rowIndex || rowRef.rowIndex >= context.entry.rowIndex + context.entry.rowSpan) {
        return row;
      }

      const rowChildren = getS1000DNodeChildren(row);
      const insertIndex = countAnchoredEntriesBeforeColumn(grid, rowRef.rowIndex, context.entry.columnIndex);
      const newEntries = Array.from({ length: context.entry.colSpan }, (_value, columnOffset) => {
        const columnIndex = context.entry.columnIndex + columnOffset;
        if (rowRef.rowIndex === context.entry.rowIndex && columnOffset === 0) {
          return clearEntrySpanAttrs(
            rowChildren[context.entry.entryIndex]!,
            columnIndex,
            support,
          );
        }

        return createEmptyS1000DEntry(row.type.schema, createSingleColumnAttrs(columnIndex, support));
      });

      if (rowRef.rowIndex === context.entry.rowIndex) {
        rowChildren.splice(context.entry.entryIndex, 1, ...newEntries);
      } else {
        rowChildren.splice(insertIndex, 0, ...newEntries);
      }

      return row.copy(Fragment.fromArray(rowChildren));
    });
    const normalizedTgroup = normalizeS1000DTgroup(nextRowsTgroup);
    const nextTable = replaceActiveS1000DTgroup(context.table, normalizedTgroup, context.activeTgroupIndex);

    return replaceS1000DTableAndSelectEntry(
      state,
      dispatch,
      context,
      nextTable,
      context.entry.section,
      context.entry.rowIndexInSection,
      context.entry.columnIndex,
      findBestEntryForSelection,
    );
  };
}

export function mergeOrSplitS1000DCell(options: S1000DTableCommandOptions = {}): Command {
  return (state, dispatch) => {
    const merged = mergeS1000DCells(options)(state, dispatch);
    if (merged) return true;
    return splitS1000DCell(options)(state, dispatch);
  };
}

export function moveS1000DRowUp(options: S1000DTableCommandOptions = {}): Command {
  return moveS1000DRow('up', options);
}

export function moveS1000DRowDown(options: S1000DTableCommandOptions = {}): Command {
  return moveS1000DRow('down', options);
}

function moveS1000DRow(
  direction: 'up' | 'down',
  options: S1000DTableCommandOptions = {},
): Command {
  return (state, dispatch) => {
    const context = findS1000DRowContext(state, options);
    if (!context?.activeTgroup) return false;

    const grid = createS1000DTableAdapter().createGrid(context.activeTgroup, context.activeTgroupIndex);
    const targetRowIndex = direction === 'up'
      ? context.rowRef.rowIndex - 1
      : context.rowRef.rowIndex + 1;
    if (targetRowIndex < 0 || targetRowIndex >= grid.rows.length) {
      return false;
    }

    const targetRowRef = grid.rows[targetRowIndex];
    if (!targetRowRef) {
      return false;
    }
    if (!canReorderS1000DRowPair(grid, context.rowRef.rowIndex, targetRowRef.rowIndex)) {
      return false;
    }

    let nextTgroup: ProseMirrorNode;
    if (targetRowRef.section === context.rowRef.section) {
      const sectionChildren = getS1000DNodeChildren(context.section);
      const nextRows = sectionChildren.slice();
      const movedRow = nextRows[context.rowRef.rowIndexInSection]!;
      nextRows.splice(context.rowRef.rowIndexInSection, 1);
      nextRows.splice(targetRowRef.rowIndexInSection, 0, movedRow);

      const nextSection = context.section.copy(Fragment.fromArray(nextRows));
      nextTgroup = replaceS1000DChildAt(context.activeTgroup, context.sectionChildIndex, nextSection);
    } else {
      const targetSectionChildIndex = findSectionChildIndex(context.activeTgroup, targetRowRef.section);
      const targetSection = targetSectionChildIndex >= 0 ? context.activeTgroup.child(targetSectionChildIndex) : null;
      if (!targetSection) {
        return false;
      }

      const sourceRows = getS1000DNodeChildren(context.section);
      const targetRows = getS1000DNodeChildren(targetSection);
      const sourceRow = sourceRows[context.rowRef.rowIndexInSection];
      const targetRow = targetRows[targetRowRef.rowIndexInSection];
      if (!sourceRow || !targetRow) {
        return false;
      }

      sourceRows[context.rowRef.rowIndexInSection] = targetRow;
      targetRows[targetRowRef.rowIndexInSection] = sourceRow;

      nextTgroup = replaceS1000DChildAt(
        context.activeTgroup,
        context.sectionChildIndex,
        context.section.copy(Fragment.fromArray(sourceRows)),
      );
      nextTgroup = replaceS1000DChildAt(
        nextTgroup,
        targetSectionChildIndex,
        targetSection.copy(Fragment.fromArray(targetRows)),
      );
    }
    const normalizedTgroup = normalizeS1000DTgroup(nextTgroup);
    const nextTable = replaceActiveS1000DTgroup(context.table, normalizedTgroup, context.activeTgroupIndex);

    return replaceS1000DTableAndSelectRow(
      state,
      dispatch,
      context,
      nextTable,
      targetRowRef.section,
      targetRowRef.rowIndexInSection,
    );
  };
}

export function addS1000DColumnAfter(options: S1000DTableCommandOptions = {}): Command {
  return addS1000DColumn('after', options);
}

export function addS1000DColumnBefore(options: S1000DTableCommandOptions = {}): Command {
  return addS1000DColumn('before', options);
}

export function moveS1000DColumnLeft(options: S1000DTableCommandOptions = {}): Command {
  return moveS1000DColumn('left', options);
}

export function moveS1000DColumnRight(options: S1000DTableCommandOptions = {}): Command {
  return moveS1000DColumn('right', options);
}

function addS1000DColumn(position: 'before' | 'after', options: S1000DTableCommandOptions = {}): Command {
  return (state, dispatch) => {
    const context = findS1000DEntryContext(state, options);
    if (!context?.activeTgroup) return false;

    const grid = createS1000DTableAdapter().createGrid(context.activeTgroup, context.activeTgroupIndex);
    const columnEditing = analyzeColumnEditingSupport(context.activeTgroup, grid);
    if (!columnEditing.supported) return false;

    const insertIndex = position === 'before'
      ? context.entry.columnIndex
      : context.entry.columnIndex + context.entry.colSpan;
    const nextRowsTgroup = mapTgroupRowsWithGrid(context.activeTgroup, grid, (row, rowRef) => {
      const rowChildren = getS1000DNodeChildren(row);
      const coveringEntry = grid.slots[rowRef.rowIndex]?.[insertIndex]?.entry;

      if (coveringEntry && coveringEntry.rowIndex === rowRef.rowIndex && coveringEntry.columnIndex < insertIndex) {
        return row;
      }

      const insertCellIndex = countAnchoredEntriesBeforeColumn(grid, rowRef.rowIndex, insertIndex);
      rowChildren.splice(insertCellIndex, 0, createEmptyS1000DEntry(row.type.schema));
      return row.copy(Fragment.fromArray(rowChildren));
    });
    const nextTgroupWithColspecs = columnEditing.colspecs.length > 0
      ? updateTgroupColspecsForInsertedColumn(nextRowsTgroup, insertIndex, columnEditing.colspecs)
      : nextRowsTgroup;
    const normalizedTgroup = normalizeS1000DTgroup(nextTgroupWithColspecs);
    const nextTable = replaceActiveS1000DTgroup(context.table, normalizedTgroup, context.activeTgroupIndex);

    return replaceS1000DTableAndSelectEntry(
      state,
      dispatch,
      context,
      nextTable,
      context.rowRef.section,
      context.rowRef.rowIndexInSection,
      insertIndex,
      findBestEntryForSelection,
    );
  };
}

export function deleteS1000DColumn(options: S1000DTableCommandOptions = {}): Command {
  return (state, dispatch) => {
    const context = findS1000DEntryContext(state, options);
    if (!context?.activeTgroup) return false;

    const grid = createS1000DTableAdapter().createGrid(context.activeTgroup, context.activeTgroupIndex);
    const columnEditing = analyzeColumnEditingSupport(context.activeTgroup, grid);
    if (!columnEditing.supported || grid.width <= 1) return false;

    const targetColumn = context.entry.columnIndex;
    const nextRowsTgroup = mapTgroupRowsWithGrid(context.activeTgroup, grid, (row, rowRef) => {
      const rowChildren = getS1000DNodeChildren(row);
      const coveringEntry = grid.slots[rowRef.rowIndex]?.[targetColumn]?.entry;
      if (!coveringEntry) {
        return row;
      }

      if (coveringEntry.rowIndex < rowRef.rowIndex) {
        return row;
      }

      if (coveringEntry.colSpan > 1) {
        rowChildren[coveringEntry.entryIndex] = shrinkEntryForDeletedColumn(
          rowChildren[coveringEntry.entryIndex]!,
          targetColumn,
          columnEditing,
        );
        return row.copy(Fragment.fromArray(rowChildren));
      }

      rowChildren.splice(coveringEntry.entryIndex, 1);
      return row.copy(Fragment.fromArray(rowChildren));
    });
    const nextTgroupWithColspecs = columnEditing.colspecs.length > 0
      ? updateTgroupColspecsForDeletedColumn(nextRowsTgroup, targetColumn, columnEditing.colspecs)
      : nextRowsTgroup;
    const nextTgroup = columnEditing.spanspecs.length > 0
      ? updateTgroupSpanspecsForDeletedColumn(nextTgroupWithColspecs, targetColumn, columnEditing)
      : nextTgroupWithColspecs;
    const normalizedTgroup = normalizeS1000DTgroup(nextTgroup);
    const nextTable = replaceActiveS1000DTgroup(context.table, normalizedTgroup, context.activeTgroupIndex);

    return replaceS1000DTableAndSelectEntry(
      state,
      dispatch,
      context,
      nextTable,
      context.rowRef.section,
      context.rowRef.rowIndexInSection,
      Math.min(targetColumn, grid.width - 2),
      findBestEntryForSelection,
    );
  };
}

function moveS1000DColumn(
  direction: 'left' | 'right',
  options: S1000DTableCommandOptions = {},
): Command {
  return (state, dispatch) => {
    const context = findS1000DEntryContext(state, options);
    if (!context?.activeTgroup) return false;

    const grid = createS1000DTableAdapter().createGrid(context.activeTgroup, context.activeTgroupIndex);
    const columnEditing = analyzeColumnEditingSupport(context.activeTgroup, grid);
    const sourceColumn = context.entry.columnIndex;
    const targetColumn = direction === 'left' ? sourceColumn - 1 : sourceColumn + 1;
    if (
      targetColumn < 0
      || targetColumn >= grid.width
      || !canReorderS1000DColumnPair(grid, sourceColumn, targetColumn, columnEditing)
    ) {
      return false;
    }

    const nextColspecTgroup = columnEditing.colspecs.length > 0
      ? swapTgroupColspecs(context.activeTgroup, sourceColumn, targetColumn, columnEditing.colspecs)
      : context.activeTgroup;
    const nextSpanspecTgroup = columnEditing.spanspecs.length > 0
      ? realignTgroupSpanspecsToCurrentColumns(nextColspecTgroup, columnEditing)
      : nextColspecTgroup;
    const nextSupport = analyzeColumnEditingSupport(
      nextSpanspecTgroup,
      createS1000DTableAdapter().createGrid(nextSpanspecTgroup, context.activeTgroupIndex),
    );
    if (!nextSupport.supported) {
      return false;
    }

    const nextRowsTgroup = mapTgroupRowsWithGrid(nextSpanspecTgroup, grid, (row, rowRef) => {
      const rowEntries = grid.entries
        .filter((entry) => entry.rowIndex === rowRef.rowIndex)
        .map((entry) => ({
          entry,
          nextRange: resolveMovedColumnRange(entry, sourceColumn, targetColumn),
          node: rewriteEntryForMovedColumn(
            row.child(entry.entryIndex),
            entry,
            sourceColumn,
            targetColumn,
            nextSupport,
          ),
        }))
        .sort((left, right) => {
          if (left.nextRange.startColumn !== right.nextRange.startColumn) {
            return left.nextRange.startColumn - right.nextRange.startColumn;
          }
          return left.entry.entryIndex - right.entry.entryIndex;
        })
        .map((item) => item.node);

      return row.copy(Fragment.fromArray(rowEntries));
    });
    const normalizedTgroup = normalizeS1000DTgroup(nextRowsTgroup);
    const nextTable = replaceActiveS1000DTgroup(context.table, normalizedTgroup, context.activeTgroupIndex);

    return replaceS1000DTableAndSelectEntry(
      state,
      dispatch,
      context,
      nextTable,
      context.rowRef.section,
      context.rowRef.rowIndexInSection,
      targetColumn,
      findBestEntryForSelection,
    );
  };
}

export function isGraphicOnlyS1000DTable(table: ProseMirrorNode): boolean {
  return createS1000DTableAdapter().isGraphicOnlyTable(table);
}

export function getActiveS1000DTgroup(
  table: ProseMirrorNode,
  selection?: Selection | null,
  tablePos?: number,
): ProseMirrorNode | null {
  return createS1000DTableAdapter().getActiveTgroup(table, tablePos, selection);
}

function findSectionChildIndex(tgroup: ProseMirrorNode, section: string): number {
  const targetTypeName = section === 'thead'
    ? s1000dTableNodeNames.thead
    : section === 'tfoot'
      ? s1000dTableNodeNames.tfoot
      : s1000dTableNodeNames.tbody;
  let match = -1;
  tgroup.forEach((child, _offset, index) => {
    if (match >= 0) return;
    if (child.type.name === targetTypeName) {
      match = index;
    }
  });
  return match;
}

function mapTgroupRowsWithGrid(
  tgroup: ProseMirrorNode,
  grid: S1000DTgroupGrid,
  mapper: (row: ProseMirrorNode, rowRef: S1000DRowRef) => ProseMirrorNode,
): ProseMirrorNode {
  const rowsByNode = new Map(grid.rows.map((rowRef) => [rowRef.node, rowRef] as const));
  const children = getS1000DNodeChildren(tgroup).map((child) => {
    if (!isSectionNode(child)) return child;

    const rows = getS1000DNodeChildren(child).map((row) => {
      const rowRef = rowsByNode.get(row);
      return rowRef ? mapper(row, rowRef) : row;
    });
    return child.copy(Fragment.fromArray(rows));
  });

  return tgroup.copy(Fragment.fromArray(children));
}

function updateTgroupColspecsForInsertedColumn(
  tgroup: ProseMirrorNode,
  insertIndex: number,
  colspecs: readonly ResolvedColspec[],
): ProseMirrorNode {
  const children = getS1000DNodeChildren(tgroup);
  const insertionPoint = children.findIndex((child) => !isColspecNode(child));
  const nextChildren = children.slice();
  const insertedColspec = createInsertedColspec(tgroup, insertIndex, colspecs);
  const targetIndex = findColspecInsertIndex(children, insertIndex, colspecs);
  nextChildren.splice(targetIndex >= 0 ? targetIndex : Math.max(0, insertionPoint), 0, insertedColspec);
  return tgroup.copy(Fragment.fromArray(resequenceColspecChildren(nextChildren)));
}

function updateTgroupColspecsForDeletedColumn(
  tgroup: ProseMirrorNode,
  targetColumn: number,
  colspecs: readonly ResolvedColspec[],
): ProseMirrorNode {
  const children = getS1000DNodeChildren(tgroup);
  const targetColspec = colspecs.find((colspec) => colspec.index === targetColumn)?.node;
  if (!targetColspec) return tgroup;

  const nextChildren = children.filter((child) => child !== targetColspec);
  return tgroup.copy(Fragment.fromArray(resequenceColspecChildren(nextChildren)));
}

function swapTgroupColspecs(
  tgroup: ProseMirrorNode,
  sourceColumn: number,
  targetColumn: number,
  colspecs: readonly ResolvedColspec[],
): ProseMirrorNode {
  const sourceColspec = colspecs.find((colspec) => colspec.index === sourceColumn)?.node;
  const targetColspec = colspecs.find((colspec) => colspec.index === targetColumn)?.node;
  if (!sourceColspec || !targetColspec) {
    return tgroup;
  }

  const children = getS1000DNodeChildren(tgroup);
  const sourceIndex = children.indexOf(sourceColspec);
  const targetIndex = children.indexOf(targetColspec);
  if (sourceIndex < 0 || targetIndex < 0) {
    return tgroup;
  }

  const nextChildren = children.slice();
  nextChildren[sourceIndex] = targetColspec;
  nextChildren[targetIndex] = sourceColspec;
  return tgroup.copy(Fragment.fromArray(resequenceColspecChildren(nextChildren)));
}

function createEmptyS1000DRow(schema: ProseMirrorNode['type']['schema'], width: number, rowIndex: number): ProseMirrorNode {
  const rowType = schema.nodes[s1000dTableNodeNames.row];
  if (!rowType) {
    throw new Error(`Missing node type in schema: ${s1000dTableNodeNames.row}`);
  }

  const entries = Array.from({ length: width }, () => createEmptyS1000DEntry(schema));
  return rowType.create({ id: `row-generated-${rowIndex}` }, entries);
}

function findRowRefBySelection(grid: S1000DTgroupGrid, selection: Selection): S1000DRowRef | undefined {
  const selectedRow = findS1000DAncestorNode(selection, s1000dTableNodeNames.row);
  if (selectedRow) {
    return grid.rows.find((row) => row.node === selectedRow);
  }

  const selectedEntry = findS1000DAncestorNode(selection, s1000dTableNodeNames.entry);
  if (selectedEntry) {
    const entryRef = grid.entries.find((entry) => entry.node === selectedEntry);
    if (entryRef) {
      return grid.rows.find((row) => row.rowIndex === entryRef.rowIndex);
    }
  }

  return grid.rows[0];
}

function findEntryRefBySelection(grid: S1000DTgroupGrid, selection: Selection): S1000DEntryRef | undefined {
  const selectedEntry = findS1000DAncestorNode(selection, s1000dTableNodeNames.entry);
  if (selectedEntry) {
    return grid.entries.find((entry) => entry.node === selectedEntry);
  }

  const rowRef = findRowRefBySelection(grid, selection);
  if (!rowRef) return undefined;
  return grid.entries.find((entry) => entry.rowIndex === rowRef.rowIndex);
}

function getS1000DCellSelectionInfo(
  state: EditorState,
  options: S1000DTableCommandOptions,
): S1000DCellSelectionInfo | undefined {
  const context = findS1000DTableContext(state, options);
  if (!context?.activeTgroup || context.activeTgroupIndex < 0) return undefined;

  const grid = createS1000DTableAdapter().createGrid(context.activeTgroup, context.activeTgroupIndex);
  if (grid.entries.length === 0) return undefined;

  let anchorEntry = findS1000DEntryContext(state, options)?.entry;
  let headEntry = anchorEntry;

  if (isS1000DCellSelection(state.selection)) {
    anchorEntry = findS1000DEntryByPosition(context, grid, state.selection.anchorEntryPos) ?? anchorEntry;
    headEntry = findS1000DEntryByPosition(context, grid, state.selection.headEntryPos) ?? anchorEntry;
  }

  if (!anchorEntry || !headEntry) return undefined;

  const top = Math.min(anchorEntry.rowIndex, headEntry.rowIndex);
  const bottom = Math.max(anchorEntry.rowIndex + anchorEntry.rowSpan - 1, headEntry.rowIndex + headEntry.rowSpan - 1);
  const left = Math.min(anchorEntry.columnIndex, headEntry.columnIndex);
  const right = Math.max(anchorEntry.columnIndex + anchorEntry.colSpan - 1, headEntry.columnIndex + headEntry.colSpan - 1);
  const entries = uniqueEntriesInRect(grid, top, bottom, left, right);

  return {
    context,
    grid,
    anchorEntry,
    headEntry,
    entries,
    top,
    bottom,
    left,
    right,
  };
}

interface ColumnEditingSupport {
  supported: boolean;
  colspecs: ResolvedColspec[];
  spanspecs: ResolvedSpanspec[];
}

function isRectangularS1000DSelection(selectionInfo: S1000DCellSelectionInfo): boolean {
  const selectedEntries = new Set(selectionInfo.entries);

  for (const entry of selectionInfo.entries) {
    if (entry.section !== selectionInfo.anchorEntry.section) {
      return false;
    }
    if (
      entry.rowIndex < selectionInfo.top
      || entry.rowIndex + entry.rowSpan - 1 > selectionInfo.bottom
      || entry.columnIndex < selectionInfo.left
      || entry.columnIndex + entry.colSpan - 1 > selectionInfo.right
    ) {
      return false;
    }
  }

  for (let rowIndex = selectionInfo.top; rowIndex <= selectionInfo.bottom; rowIndex += 1) {
    for (let columnIndex = selectionInfo.left; columnIndex <= selectionInfo.right; columnIndex += 1) {
      const entry = selectionInfo.grid.slots[rowIndex]?.[columnIndex]?.entry;
      if (!entry || !selectedEntries.has(entry)) return false;
    }
  }

  return true;
}

function analyzeColumnEditingSupport(
  tgroup: ProseMirrorNode,
  grid: S1000DTgroupGrid,
): ColumnEditingSupport {
  const colspecs = resolveColspecs(tgroup);
  const { spanspecs, errors } = resolveSpanspecs(tgroup);

  if (grid.width < 1) {
    return { supported: false, colspecs, spanspecs };
  }

  const supported = grid.entries.every((entry) => {
    if (entry.colSpan > 1 && (!entry.node.attrs.spanname && (!entry.node.attrs.namest || !entry.node.attrs.nameend))) {
      return false;
    }
    return true;
  });

  return { supported: supported && errors.length === 0, colspecs, spanspecs };
}

function isSectionNode(node: ProseMirrorNode): boolean {
  return node.type.name === s1000dTableNodeNames.thead
    || node.type.name === s1000dTableNodeNames.tbody
    || node.type.name === s1000dTableNodeNames.tfoot;
}

function countAnchoredEntriesBeforeColumn(
  grid: S1000DTgroupGrid,
  rowIndex: number,
  targetColumn: number,
): number {
  return grid.entries.filter((entry) => entry.rowIndex === rowIndex && entry.columnIndex < targetColumn).length;
}

function uniqueEntriesInRect(
  grid: S1000DTgroupGrid,
  top: number,
  bottom: number,
  left: number,
  right: number,
): S1000DEntryRef[] {
  const entries: S1000DEntryRef[] = [];
  const seen = new Set<S1000DEntryRef>();

  for (let rowIndex = top; rowIndex <= bottom; rowIndex += 1) {
    for (let columnIndex = left; columnIndex <= right; columnIndex += 1) {
      const entry = grid.slots[rowIndex]?.[columnIndex]?.entry;
      if (entry && !seen.has(entry)) {
        seen.add(entry);
        entries.push(entry);
      }
    }
  }

  return entries.sort((leftEntry, rightEntry) => (
    (leftEntry.rowIndex - rightEntry.rowIndex) || (leftEntry.columnIndex - rightEntry.columnIndex)
  ));
}

function canOperateOnStandaloneS1000DRow(grid: S1000DTgroupGrid, rowIndex: number): boolean {
  const rowSlots = grid.slots[rowIndex];
  if (!rowSlots || rowSlots.length === 0) return false;

  for (const slot of rowSlots) {
    const entry = slot?.entry;
    if (!entry || entry.rowIndex < rowIndex) {
      return false;
    }
  }

  return grid.entries
    .filter((entry) => entry.rowIndex === rowIndex)
    .every((entry) => entry.rowSpan === 1);
}

function canReorderS1000DRowPair(
  grid: S1000DTgroupGrid,
  sourceRowIndex: number,
  targetRowIndex: number,
): boolean {
  return canOperateOnStandaloneS1000DRow(grid, sourceRowIndex)
    && canOperateOnStandaloneS1000DRow(grid, targetRowIndex);
}

function canReorderS1000DColumnPair(
  grid: S1000DTgroupGrid,
  sourceColumn: number,
  targetColumn: number,
  support: ColumnEditingSupport,
): boolean {
  if (grid.entries.some((entry) => entry.colSpan > 1) && support.colspecs.length !== grid.width) {
    return false;
  }
  if (support.colspecs.length > 0 && support.colspecs.length !== grid.width) {
    return false;
  }

  for (let rowIndex = 0; rowIndex < grid.height; rowIndex += 1) {
    const rowEntries = grid.entries.filter((entry) => (
      entry.rowIndex <= rowIndex
        && rowIndex < entry.rowIndex + entry.rowSpan
    ));
    const coverage = Array.from({ length: grid.width }, () => false);

    for (const entry of rowEntries) {
      const { startColumn, endColumn } = resolveMovedColumnRange(entry, sourceColumn, targetColumn);
      if (startColumn < 0 || endColumn >= grid.width) {
        return false;
      }

      for (let columnIndex = startColumn; columnIndex <= endColumn; columnIndex += 1) {
        if (coverage[columnIndex]) {
          return false;
        }
        coverage[columnIndex] = true;
      }
    }

    if (coverage.some((filled) => !filled)) return false;
  }

  return true;
}

function swapColumnIndex(columnIndex: number, sourceColumn: number, targetColumn: number): number {
  if (columnIndex === sourceColumn) {
    return targetColumn;
  }
  if (columnIndex === targetColumn) {
    return sourceColumn;
  }
  return columnIndex;
}

function resolveMovedColumnRange(
  entry: S1000DEntryRef,
  sourceColumn: number,
  targetColumn: number,
): { startColumn: number; endColumn: number } {
  if (entry.colSpan <= 1) {
    const nextColumn = swapColumnIndex(entry.columnIndex, sourceColumn, targetColumn);
    return {
      startColumn: nextColumn,
      endColumn: nextColumn,
    };
  }

  return {
    startColumn: entry.columnIndex,
    endColumn: entry.columnIndex + entry.colSpan - 1,
  };
}

function rewriteEntryForMovedColumn(
  entryNode: ProseMirrorNode,
  entry: S1000DEntryRef,
  sourceColumn: number,
  targetColumn: number,
  support: ColumnEditingSupport,
): ProseMirrorNode {
  const { startColumn, endColumn } = resolveMovedColumnRange(entry, sourceColumn, targetColumn);
  if (startColumn === endColumn) {
    return entryNode.type.create(
      {
        ...entryNode.attrs,
        ...createSingleColumnAttrs(startColumn, support),
      },
      entryNode.content,
      entryNode.marks,
    );
  }

  if (entryNode.attrs.spanname) {
    return entryNode.type.create(
      {
        ...entryNode.attrs,
        colname: null,
        namest: null,
        nameend: null,
      },
      entryNode.content,
      entryNode.marks,
    );
  }

  return entryNode.type.create(
    {
      ...entryNode.attrs,
      colname: null,
      namest: resolveColnameByIndex(support.colspecs, startColumn),
      nameend: resolveColnameByIndex(support.colspecs, endColumn),
      spanname: null,
    },
    entryNode.content,
    entryNode.marks,
  );
}

function findBestEntryForSelection(
  grid: S1000DTgroupGrid,
  rowIndex: number,
  targetColumnIndex: number,
): S1000DEntryRef | undefined {
  const anchoredEntries = grid.entries
    .filter((entry) => entry.rowIndex === rowIndex)
    .sort((left, right) => left.columnIndex - right.columnIndex);
  if (anchoredEntries.length === 0) {
    return grid.slots[rowIndex]?.[targetColumnIndex]?.entry;
  }

  const coveringEntry = anchoredEntries.find((entry) => (
    entry.columnIndex <= targetColumnIndex
      && targetColumnIndex < entry.columnIndex + entry.colSpan
  ));
  if (coveringEntry) {
    return coveringEntry;
  }

  return anchoredEntries.find((entry) => entry.columnIndex >= targetColumnIndex)
    ?? anchoredEntries[anchoredEntries.length - 1];
}

function clearEntrySpanAttrs(
  entry: ProseMirrorNode,
  columnIndex: number,
  support: ColumnEditingSupport,
): ProseMirrorNode {
  return entry.type.create(
    {
      ...entry.attrs,
      ...createSingleColumnAttrs(columnIndex, support),
      morerows: null,
    },
    entry.content,
    entry.marks,
  );
}

function shrinkEntryForDeletedColumn(
  entry: ProseMirrorNode,
  targetColumn: number,
  support: ColumnEditingSupport,
): ProseMirrorNode {
  const range = resolveEntryColumnRange(entry, support);
  if (!range) {
    return entry;
  }

  const { startColumn, endColumn } = range;
  const remainingWidth = endColumn - startColumn;
  if (remainingWidth <= 0) {
    return entry;
  }

  const nextStart = targetColumn === startColumn ? startColumn + 1 : startColumn;
  const nextEnd = targetColumn === endColumn ? endColumn - 1 : endColumn;
  const nextWidth = nextEnd - nextStart + 1;

  if (nextWidth <= 1) {
    return collapseEntryToSingleColumn(entry, nextStart, support);
  }

  return copyEntryWithResolvedRange(entry, nextStart, nextEnd, support);
}

function resolveColspecIndexByName(colspecs: readonly ResolvedColspec[], colname: unknown): number | undefined {
  if (typeof colname !== 'string' || !colname) return undefined;
  return colspecs.find((colspec) => colspec.colname === colname)?.index;
}

function resolveColnameByIndex(colspecs: readonly ResolvedColspec[], index: number): string | null {
  return colspecs.find((colspec) => colspec.index === index)?.colname ?? null;
}

function createInsertedColspec(
  tgroup: ProseMirrorNode,
  insertIndex: number,
  colspecs: readonly ResolvedColspec[],
): ProseMirrorNode {
  const colspecType = tgroup.type.schema.nodes[s1000dTableNodeNames.colspec];
  if (!colspecType) {
    throw new Error(`Missing node type in schema: ${s1000dTableNodeNames.colspec}`);
  }

  const previous = colspecs.find((colspec) => colspec.index === insertIndex - 1);
  const next = colspecs.find((colspec) => colspec.index === insertIndex);
  const base = previous?.node ?? next?.node ?? null;
  const colnum = String(insertIndex + 1);
  const colname = buildInsertedColname(insertIndex, colspecs);
  const attrs = {
    ...(base?.attrs ?? {}),
    colname,
    colnum,
  };

  return colspecType.create(attrs);
}

function buildInsertedColname(insertIndex: number, colspecs: readonly ResolvedColspec[]): string {
  const baseName = `c${insertIndex + 1}`;
  const used = new Set(colspecs.map((colspec) => colspec.colname));
  if (!used.has(baseName)) {
    return baseName;
  }

  let suffix = 1;
  while (used.has(`${baseName}_${suffix}`)) {
    suffix += 1;
  }

  return `${baseName}_${suffix}`;
}

function findColspecInsertIndex(
  children: readonly ProseMirrorNode[],
  insertIndex: number,
  colspecs: readonly ResolvedColspec[],
): number {
  const nextColspecNode = colspecs.find((colspec) => colspec.index >= insertIndex)?.node;
  if (nextColspecNode) {
    return children.indexOf(nextColspecNode);
  }

  const lastColspecIndex = [...children].reverse().findIndex((child) => isColspecNode(child));
  return lastColspecIndex < 0 ? 0 : children.length - lastColspecIndex;
}

function isColspecNode(node: ProseMirrorNode): boolean {
  return node.type.name === s1000dTableNodeNames.colspec;
}

function resequenceColspecChildren(children: readonly ProseMirrorNode[]): ProseMirrorNode[] {
  let colnum = 1;

  return children.map((child) => {
    if (!isColspecNode(child)) {
      return child;
    }

    const nextChild = child.type.create(
      {
        ...child.attrs,
        colnum: String(colnum),
      },
      child.content,
      child.marks,
    );
    colnum += 1;
    return nextChild;
  });
}

function updateTgroupSpanspecsForDeletedColumn(
  tgroup: ProseMirrorNode,
  targetColumn: number,
  support: ColumnEditingSupport,
): ProseMirrorNode {
  const children = getS1000DNodeChildren(tgroup)
    .flatMap((child) => {
    if (child.type.name !== s1000dTableNodeNames.spanspec) {
      return [child];
    }

    const spanspec = support.spanspecs.find((item) => item.node === child);
    if (!spanspec || targetColumn < spanspec.from || targetColumn > spanspec.to) {
      return [child];
    }

    const nextStart = targetColumn === spanspec.from ? spanspec.from + 1 : spanspec.from;
    const nextEnd = targetColumn === spanspec.to ? spanspec.to - 1 : spanspec.to;
    const nextWidth = nextEnd - nextStart + 1;
    if (nextWidth <= 1) {
      return [];
    }

    return [child.type.create(
        {
          ...child.attrs,
          namest: resolveColnameByIndex(support.colspecs, nextStart),
          nameend: resolveColnameByIndex(support.colspecs, nextEnd),
        },
        child.content,
        child.marks,
      )];
    });

  return tgroup.copy(Fragment.fromArray(children));
}

function realignTgroupSpanspecsToCurrentColumns(
  tgroup: ProseMirrorNode,
  support: ColumnEditingSupport,
): ProseMirrorNode {
  const nextColspecs = resolveColspecs(tgroup);
  const children = getS1000DNodeChildren(tgroup).map((child) => {
    if (child.type.name !== s1000dTableNodeNames.spanspec) {
      return child;
    }

    const spanspec = support.spanspecs.find((item) => item.node === child);
    if (!spanspec) {
      return child;
    }

    return child.type.create(
      {
        ...child.attrs,
        namest: resolveColnameByIndex(nextColspecs, spanspec.from),
        nameend: resolveColnameByIndex(nextColspecs, spanspec.to),
      },
      child.content,
      child.marks,
    );
  });

  return tgroup.copy(Fragment.fromArray(children));
}

function resolveEntryColumnRange(
  entry: ProseMirrorNode,
  support: ColumnEditingSupport,
): { startColumn: number; endColumn: number } | null {
  if (entry.attrs.spanname) {
    const spanspec = support.spanspecs.find((item) => item.spanname === entry.attrs.spanname);
    return spanspec ? { startColumn: spanspec.from, endColumn: spanspec.to } : null;
  }

  const startColumn = resolveColspecIndexByName(support.colspecs, entry.attrs.namest);
  const endColumn = resolveColspecIndexByName(support.colspecs, entry.attrs.nameend);
  if (startColumn === undefined || endColumn === undefined) {
    return null;
  }

  return { startColumn, endColumn };
}

function copyEntryWithResolvedRange(
  entry: ProseMirrorNode,
  startColumn: number | null,
  endColumn: number | null,
  support: ColumnEditingSupport,
): ProseMirrorNode {
  if (entry.attrs.spanname) {
    if (startColumn === null || endColumn === null) {
      return collapseEntryToSingleColumn(entry, resolveSingleColumnFromRange(entry, support), support);
    }

    return createS1000DTableAdapter().copyEntryWithSpan(entry, {
      spanname: entry.attrs.spanname,
      namest: null,
      nameend: null,
    });
  }

  return createS1000DTableAdapter().copyEntryWithSpan(entry, {
    namest: startColumn === null ? null : resolveColnameByIndex(support.colspecs, startColumn),
    nameend: endColumn === null ? null : resolveColnameByIndex(support.colspecs, endColumn),
    spanname: null,
  });
}

function collapseEntryToSingleColumn(
  entry: ProseMirrorNode,
  columnIndex: number | null,
  support: ColumnEditingSupport,
): ProseMirrorNode {
  return entry.type.create(
    {
      ...entry.attrs,
      colname: columnIndex === null ? null : resolveColnameByIndex(support.colspecs, columnIndex),
      namest: null,
      nameend: null,
      spanname: null,
    },
    entry.content,
    entry.marks,
  );
}

function createMergedS1000DEntry(
  anchorEntry: ProseMirrorNode,
  selectionInfo: S1000DCellSelectionInfo,
  support: ColumnEditingSupport,
  entryNodes: readonly ProseMirrorNode[],
): ProseMirrorNode {
  const width = selectionInfo.right - selectionInfo.left + 1;
  const height = selectionInfo.bottom - selectionInfo.top + 1;

  return anchorEntry.type.create(
    {
      ...anchorEntry.attrs,
      ...(width > 1
        ? {
          colname: null,
          namest: resolveColnameByIndex(support.colspecs, selectionInfo.left),
          nameend: resolveColnameByIndex(support.colspecs, selectionInfo.right),
          spanname: null,
        }
        : createSingleColumnAttrs(selectionInfo.left, support)),
      morerows: height > 1 ? String(height - 1) : null,
    },
    mergeS1000DEntryContent(entryNodes),
    anchorEntry.marks,
  );
}

function createSingleColumnAttrs(
  columnIndex: number,
  support: ColumnEditingSupport,
): Record<string, unknown> {
  return {
    colname: resolveColnameByIndex(support.colspecs, columnIndex),
    namest: null,
    nameend: null,
    spanname: null,
  };
}

function mergeS1000DEntryContent(entries: readonly ProseMirrorNode[]): Fragment {
  const nodes: ProseMirrorNode[] = [];

  for (const entry of entries) {
    entry.forEach((child) => nodes.push(child));
  }

  return Fragment.fromArray(nodes);
}

function ensureTgroupColspecs(tgroup: ProseMirrorNode, width: number): ProseMirrorNode {
  const existing = resolveColspecs(tgroup);
  if (existing.length >= width) {
    return tgroup;
  }

  const children = getS1000DNodeChildren(tgroup);
  const insertionPoint = children.findIndex((child) => !isColspecNode(child));
  const nextChildren = children.slice();
  const colspecType = tgroup.type.schema.nodes[s1000dTableNodeNames.colspec];
  if (!colspecType) {
    throw new Error(`Missing node type in schema: ${s1000dTableNodeNames.colspec}`);
  }

  const usedNames = new Set(existing.map((colspec) => colspec.colname));
  for (let index = existing.length; index < width; index += 1) {
    let colname = `c${index + 1}`;
    let suffix = 1;
    while (usedNames.has(colname)) {
      colname = `c${index + 1}_${suffix}`;
      suffix += 1;
    }
    usedNames.add(colname);
    nextChildren.splice(
      Math.max(0, insertionPoint < 0 ? nextChildren.length : insertionPoint + (index - existing.length)),
      0,
      colspecType.create({ colname, colnum: String(index + 1) }),
    );
  }

  return tgroup.copy(Fragment.fromArray(resequenceColspecChildren(nextChildren)));
}

function resolveSingleColumnFromRange(
  entry: ProseMirrorNode,
  support: ColumnEditingSupport,
): number | null {
  const range = resolveEntryColumnRange(entry, support);
  return range ? range.startColumn : null;
}
