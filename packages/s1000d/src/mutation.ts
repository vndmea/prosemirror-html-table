import { Fragment, type Node as ProseMirrorNode } from 'prosemirror-model';
import {
  NodeSelection,
  Selection,
  TextSelection,
  type Command,
  type EditorState,
} from 'prosemirror-state';

import { createS1000DTableAdapter } from './adapter.js';
import type { S1000DActiveTableContext, S1000DTablePositionContext } from './context.js';
import type { S1000DEntryRef, S1000DRowRef, S1000DTgroupGrid } from './grid.js';
import { s1000dTableNodeNames } from './names.js';
import { S1000DCellSelection, isS1000DCellSelection } from './selection.js';
import { S1000DTableMap } from './table-map.js';
import {
  findFirstS1000DEntryPosition,
  findS1000DEntryByPosition,
  findS1000DEntryPosition,
  findS1000DNodePosition,
  requireS1000DTgroupChildIndex,
} from './position.js';

export function getS1000DNodeChildren(node: ProseMirrorNode): ProseMirrorNode[] {
  const children: ProseMirrorNode[] = [];
  node.forEach((child) => children.push(child));
  return children;
}

export function replaceS1000DChildAt(node: ProseMirrorNode, index: number, child: ProseMirrorNode): ProseMirrorNode {
  const children = getS1000DNodeChildren(node);
  children[index] = child;
  return node.copy(Fragment.fromArray(children));
}

export function replaceActiveS1000DTgroup(
  table: ProseMirrorNode,
  tgroup: ProseMirrorNode,
  tgroupIndex: number,
): ProseMirrorNode {
  const childIndex = requireS1000DTgroupChildIndex(table, tgroupIndex);
  return replaceS1000DChildAt(table, childIndex, tgroup);
}

export function replaceS1000DEntries(
  context: S1000DActiveTableContext,
  replacements: Map<S1000DEntryRef, ProseMirrorNode>,
): ProseMirrorNode {
  const tableChildren = getS1000DNodeChildren(context.table);
  const tgroupChildIndex = requireS1000DTgroupChildIndex(context.table, context.activeTgroupIndex);
  const tgroupChildren = getS1000DNodeChildren(context.activeTgroup);
  const replacementEntries = [...replacements.entries()];
  let globalRowIndex = 0;

  for (let sectionIndex = 0; sectionIndex < tgroupChildren.length; sectionIndex += 1) {
    const section = tgroupChildren[sectionIndex]!;
    if (!isS1000DSectionNode(section)) continue;

    const rowChildren = getS1000DNodeChildren(section).map((row, rowIndexInSection) => {
      const nextCells = getS1000DNodeChildren(row).map((entryNode, entryIndex) => {
        const matched = replacementEntries.find(([item]) => (
          item.rowIndex === globalRowIndex
            && item.rowIndexInSection === rowIndexInSection
            && item.entryIndex === entryIndex
            && item.node === entryNode
        ));
        return matched ? matched[1] : entryNode;
      });
      globalRowIndex += 1;
      return row.copy(Fragment.fromArray(nextCells));
    });

    tgroupChildren[sectionIndex] = section.copy(Fragment.fromArray(rowChildren));
  }

  tableChildren[tgroupChildIndex] = context.activeTgroup.copy(Fragment.fromArray(tgroupChildren));
  return context.table.copy(Fragment.fromArray(tableChildren));
}

export function refreshActiveS1000DTableContext(
  doc: ProseMirrorNode,
  context: S1000DTablePositionContext,
): S1000DActiveTableContext {
  const table = doc.nodeAt(context.tablePos);
  if (!table || table.type.name !== s1000dTableNodeNames.table) {
    throw new Error('Unable to refresh S1000D table context after table replacement.');
  }

  const activeTgroup = createS1000DTableAdapter().getTgroups(table)[context.activeTgroupIndex];
  if (!activeTgroup) {
    throw new Error('Unable to refresh active S1000D tgroup after table replacement.');
  }

  return {
    table,
    tablePos: context.tablePos,
    activeTgroup,
    activeTgroupIndex: context.activeTgroupIndex,
  };
}

export function replaceS1000DTable(
  state: EditorState,
  dispatch: Parameters<Command>[1],
  context: S1000DTablePositionContext,
  table: ProseMirrorNode,
): boolean {
  if (dispatch) {
    const transaction = state.tr.replaceWith(context.tablePos, context.tablePos + context.table.nodeSize, table);
    const nextSelection = preserveS1000DCellSelectionOnTableReplace(state.selection, transaction.doc, context, table)
      ?? createFallbackS1000DSelection(transaction.doc, context.tablePos);
    dispatch(transaction.setSelection(nextSelection).scrollIntoView());
  }

  return true;
}

export function replaceS1000DTableAndSelectRow(
  state: EditorState,
  dispatch: Parameters<Command>[1],
  context: S1000DTablePositionContext,
  table: ProseMirrorNode,
  targetSection: S1000DRowRef['section'],
  targetRowIndexInSection: number,
): boolean {
  if (!dispatch) {
    return true;
  }

  const tgroup = createS1000DTableAdapter().getTgroups(table)[context.activeTgroupIndex];
  if (!tgroup) {
    return replaceS1000DTable(state, dispatch, context, table);
  }

  const grid = createS1000DTableAdapter().createGrid(tgroup, context.activeTgroupIndex);
  const targetRow = grid.rows.find(
    (row) => row.section === targetSection && row.rowIndexInSection === targetRowIndexInSection,
  );
  const targetEntry = targetRow
    ? grid.entries.find((entry) => entry.rowIndex === targetRow.rowIndex && entry.entryIndex === 0)
    : undefined;
  if (!targetEntry) {
    return replaceS1000DTable(state, dispatch, context, table);
  }

  const transaction = state.tr.replaceWith(context.tablePos, context.tablePos + context.table.nodeSize, table);
  const targetEntryPos = findS1000DNodePosition(transaction.doc, targetEntry.node);
  const nextSelection = targetEntryPos !== undefined
    ? createS1000DSelectionAtEntry(transaction.doc, targetEntryPos)
    : createFallbackS1000DSelection(transaction.doc, context.tablePos);
  dispatch(transaction.setSelection(nextSelection).scrollIntoView());
  return true;
}

export function replaceS1000DTableAndSelectEntry(
  state: EditorState,
  dispatch: Parameters<Command>[1],
  context: S1000DTablePositionContext,
  table: ProseMirrorNode,
  targetSection: S1000DRowRef['section'],
  targetRowIndexInSection: number,
  targetColumnIndex: number,
  resolveEntry: (grid: S1000DTgroupGrid, rowIndex: number, targetColumnIndex: number) => S1000DEntryRef | undefined,
): boolean {
  if (!dispatch) {
    return true;
  }

  const tgroup = createS1000DTableAdapter().getTgroups(table)[context.activeTgroupIndex];
  if (!tgroup) {
    return replaceS1000DTable(state, dispatch, context, table);
  }

  const grid = createS1000DTableAdapter().createGrid(tgroup, context.activeTgroupIndex);
  const targetRow = grid.rows.find(
    (row) => row.section === targetSection && row.rowIndexInSection === targetRowIndexInSection,
  );
  const targetEntry = targetRow
    ? resolveEntry(grid, targetRow.rowIndex, targetColumnIndex)
    : undefined;
  if (!targetEntry) {
    return replaceS1000DTable(state, dispatch, context, table);
  }

  const transaction = state.tr.replaceWith(context.tablePos, context.tablePos + context.table.nodeSize, table);
  const targetEntryPos = findS1000DNodePosition(transaction.doc, targetEntry.node);
  const nextSelection = targetEntryPos !== undefined
    ? createS1000DSelectionAtEntry(transaction.doc, targetEntryPos)
    : createFallbackS1000DSelection(transaction.doc, context.tablePos);
  dispatch(transaction.setSelection(nextSelection).scrollIntoView());
  return true;
}

export function createS1000DSelectionAtEntry(doc: ProseMirrorNode, entryPos: number): Selection {
  const contentPos = Math.min(Math.max(0, entryPos + 1), doc.content.size);
  const resolved = doc.resolve(contentPos);

  return Selection.findFrom(resolved, 1, true)
    ?? Selection.findFrom(resolved, -1, true)
    ?? NodeSelection.create(doc, entryPos);
}

export function createFallbackS1000DSelection(doc: ProseMirrorNode, tablePos: number): Selection {
  const preferredEntryPos = findFirstS1000DEntryPosition(doc);
  if (preferredEntryPos !== undefined) {
    return createS1000DSelectionAtEntry(doc, preferredEntryPos);
  }

  const nextSelectionPos = Math.min(Math.max(1, tablePos + 1), Math.max(1, doc.content.size));
  return TextSelection.near(doc.resolve(nextSelectionPos));
}

export function preserveS1000DCellSelectionOnTableReplace(
  selection: Selection,
  doc: ProseMirrorNode,
  context: S1000DTablePositionContext,
  nextTable: ProseMirrorNode,
): Selection | undefined {
  if (!isS1000DCellSelection(selection) || context.activeTgroupIndex < 0) {
    return undefined;
  }

  const previousTgroup = createS1000DTableAdapter().getTgroups(context.table)[context.activeTgroupIndex];
  const nextTgroup = createS1000DTableAdapter().getTgroups(nextTable)[context.activeTgroupIndex];
  if (!previousTgroup || !nextTgroup) return undefined;

  const previousGrid = createS1000DTableAdapter().createGrid(previousTgroup, context.activeTgroupIndex);
  const nextGrid = createS1000DTableAdapter().createGrid(nextTgroup, context.activeTgroupIndex);
  if (!hasEquivalentS1000DGridShape(previousGrid, nextGrid)) {
    return undefined;
  }

  const previousContext: S1000DActiveTableContext = {
    table: context.table,
    tablePos: context.tablePos,
    activeTgroup: previousTgroup,
    activeTgroupIndex: context.activeTgroupIndex,
  };
  const anchorEntry = findS1000DEntryByPosition(previousContext, previousGrid, selection.anchorEntryPos);
  const headEntry = findS1000DEntryByPosition(previousContext, previousGrid, selection.headEntryPos);
  if (!anchorEntry || !headEntry) return undefined;

  const nextAnchorEntry = nextGrid.slots[anchorEntry.rowIndex]?.[anchorEntry.columnIndex]?.entry;
  const nextHeadEntry = nextGrid.slots[headEntry.rowIndex]?.[headEntry.columnIndex]?.entry;
  if (!nextAnchorEntry || !nextHeadEntry) return undefined;

  const nextContext: S1000DActiveTableContext = {
    table: nextTable,
    tablePos: context.tablePos,
    activeTgroup: nextTgroup,
    activeTgroupIndex: context.activeTgroupIndex,
  };
  const nextAnchorEntryPos = findS1000DEntryPosition(nextContext, nextAnchorEntry);
  const nextHeadEntryPos = findS1000DEntryPosition(nextContext, nextHeadEntry);
  if (nextAnchorEntryPos === undefined || nextHeadEntryPos === undefined) {
    return undefined;
  }

  return S1000DCellSelection.create(doc, nextAnchorEntryPos, nextHeadEntryPos);
}

function hasEquivalentS1000DGridShape(
  previousGrid: S1000DTgroupGrid,
  nextGrid: S1000DTgroupGrid,
): boolean {
  if (
    previousGrid.width !== nextGrid.width
    || previousGrid.height !== nextGrid.height
    || previousGrid.entries.length !== nextGrid.entries.length
    || previousGrid.rows.length !== nextGrid.rows.length
  ) {
    return false;
  }

  return previousGrid.entries.every((entry, index) => {
    const nextEntry = nextGrid.entries[index];
    return Boolean(
      nextEntry
      && nextEntry.section === entry.section
      && nextEntry.rowIndex === entry.rowIndex
      && nextEntry.rowIndexInSection === entry.rowIndexInSection
      && nextEntry.columnIndex === entry.columnIndex
      && nextEntry.entryIndex === entry.entryIndex
      && nextEntry.rowSpan === entry.rowSpan
      && nextEntry.colSpan === entry.colSpan,
    );
  });
}

function isS1000DSectionNode(node: ProseMirrorNode): boolean {
  return node.type.name === s1000dTableNodeNames.thead
    || node.type.name === s1000dTableNodeNames.tbody
    || node.type.name === s1000dTableNodeNames.tfoot;
}
