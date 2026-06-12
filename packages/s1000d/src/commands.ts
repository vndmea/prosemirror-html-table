import { Fragment, type Node as ProseMirrorNode } from 'prosemirror-model';
import { NodeSelection, TextSelection, type Command, type EditorState, type Selection } from 'prosemirror-state';

import { createS1000DTableAdapter } from './adapter.js';
import { type S1000DEntryRef, type S1000DRowRef, type S1000DTgroupGrid } from './grid.js';
import { s1000dTableNodeNames } from './names.js';
import { createEmptyS1000DEntry, normalizeS1000DTgroup } from './normalize.js';

export interface S1000DTableCommandOptions {
  tablePos?: number;
}

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

export function findS1000DTableContext(
  state: EditorState,
  options: S1000DTableCommandOptions = {},
): S1000DTableContext | null {
  const found = typeof options.tablePos === 'number'
    ? findTableByResolvedPos(state.doc, options.tablePos)
    : findTableAroundSelection(state.selection);
  if (!found) return null;

  const adapter = createS1000DTableAdapter();
  const activeTgroup = adapter.getActiveTgroup(found.table, state.selection);
  const tgroups = adapter.getTgroups(found.table);
  const activeTgroupIndex = activeTgroup ? tgroups.findIndex((item) => item === activeTgroup) : -1;

  return {
    table: found.table,
    tablePos: found.tablePos,
    activeTgroup,
    activeTgroupIndex,
  };
}

export function findS1000DRowContext(
  state: EditorState,
  options: S1000DTableCommandOptions = {},
): S1000DRowContext | null {
  const tableContext = findS1000DTableContext(state, options);
  if (!tableContext?.activeTgroup || tableContext.activeTgroupIndex < 0) return null;

  const grid = createS1000DTableAdapter().createGrid(tableContext.activeTgroup, tableContext.activeTgroupIndex);
  const selectedRow = findAncestorNode(state.selection, s1000dTableNodeNames.row);
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
  const selectedEntryNode = findAncestorNode(state.selection, s1000dTableNodeNames.entry);
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
  return (state, dispatch) => {
    const context = findS1000DRowContext(state, options);
    if (!context?.activeTgroup) return false;

    const width = Math.max(1, createS1000DTableAdapter().createGrid(context.activeTgroup, context.activeTgroupIndex).width);
    const nextRow = createEmptyS1000DRow(context.row.type.schema, width, context.rowRef.rowIndex + 1);
    const sectionChildren = getChildren(context.section);
    sectionChildren.splice(context.rowRef.rowIndexInSection + 1, 0, nextRow);

    const nextSection = context.section.copy(Fragment.fromArray(sectionChildren));
    const nextTgroup = replaceChildAt(context.activeTgroup, context.sectionChildIndex, nextSection);
    const normalizedTgroup = normalizeS1000DTgroup(nextTgroup);
    const nextTable = replaceActiveTgroup(context.table, normalizedTgroup, context.activeTgroupIndex);

    return replaceTable(state, dispatch, context, nextTable);
  };
}

export function deleteS1000DRow(options: S1000DTableCommandOptions = {}): Command {
  return (state, dispatch) => {
    const context = findS1000DRowContext(state, options);
    if (!context?.activeTgroup) return false;

    const sectionChildren = getChildren(context.section);
    if (sectionChildren.length <= 1) return false;

    sectionChildren.splice(context.rowRef.rowIndexInSection, 1);
    const nextSection = context.section.copy(Fragment.fromArray(sectionChildren));
    const nextTgroup = replaceChildAt(context.activeTgroup, context.sectionChildIndex, nextSection);
    const normalizedTgroup = normalizeS1000DTgroup(nextTgroup);
    const nextTable = replaceActiveTgroup(context.table, normalizedTgroup, context.activeTgroupIndex);

    return replaceTable(state, dispatch, context, nextTable);
  };
}

export function isGraphicOnlyS1000DTable(table: ProseMirrorNode): boolean {
  return createS1000DTableAdapter().isGraphicOnlyTable(table);
}

export function getActiveS1000DTgroup(
  table: ProseMirrorNode,
  selection?: Selection | null,
): ProseMirrorNode | null {
  return createS1000DTableAdapter().getActiveTgroup(table, selection);
}

interface LocatedTable {
  table: ProseMirrorNode;
  tablePos: number;
}

function findTableAroundSelection(selection: Selection): LocatedTable | null {
  if (selection instanceof NodeSelection && selection.node.type.name === s1000dTableNodeNames.table) {
    return { table: selection.node, tablePos: selection.from };
  }

  for (let depth = selection.$from.depth; depth >= 0; depth -= 1) {
    const node = selection.$from.node(depth);
    if (node.type.name !== s1000dTableNodeNames.table) continue;
    return {
      table: node,
      tablePos: depth > 0 ? selection.$from.before(depth) : 0,
    };
  }

  return null;
}

function findTableByResolvedPos(doc: ProseMirrorNode, pos: number): LocatedTable | null {
  const resolved = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)));

  for (let depth = resolved.depth; depth >= 0; depth -= 1) {
    const node = resolved.node(depth);
    if (node.type.name !== s1000dTableNodeNames.table) continue;
    return {
      table: node,
      tablePos: depth > 0 ? resolved.before(depth) : 0,
    };
  }

  return null;
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

function getChildren(node: ProseMirrorNode): ProseMirrorNode[] {
  const children: ProseMirrorNode[] = [];
  node.forEach((child) => children.push(child));
  return children;
}

function replaceChildAt(node: ProseMirrorNode, index: number, child: ProseMirrorNode): ProseMirrorNode {
  const children = getChildren(node);
  children[index] = child;
  return node.copy(Fragment.fromArray(children));
}

function replaceActiveTgroup(table: ProseMirrorNode, tgroup: ProseMirrorNode, tgroupIndex: number): ProseMirrorNode {
  const children = getChildren(table);
  let seenTgroupIndex = -1;

  for (let index = 0; index < children.length; index += 1) {
    if (children[index]?.type.name !== s1000dTableNodeNames.tgroup) continue;
    seenTgroupIndex += 1;
    if (seenTgroupIndex === tgroupIndex) {
      children[index] = tgroup;
      break;
    }
  }

  return table.copy(Fragment.fromArray(children));
}

function replaceTable(
  state: EditorState,
  dispatch: Parameters<Command>[1],
  context: S1000DTableContext,
  table: ProseMirrorNode,
): boolean {
  if (dispatch) {
    const transaction = state.tr.replaceWith(context.tablePos, context.tablePos + context.table.nodeSize, table);
    const nextSelectionPos = Math.min(
      transaction.doc.content.size,
      Math.max(1, context.tablePos + 1),
    );
    dispatch(transaction.setSelection(TextSelection.near(transaction.doc.resolve(nextSelectionPos))).scrollIntoView());
  }

  return true;
}

function createEmptyS1000DRow(schema: ProseMirrorNode['type']['schema'], width: number, rowIndex: number): ProseMirrorNode {
  const rowType = schema.nodes[s1000dTableNodeNames.row];
  if (!rowType) {
    throw new Error(`Missing node type in schema: ${s1000dTableNodeNames.row}`);
  }

  const entries = Array.from({ length: width }, () => createEmptyS1000DEntry(schema));
  return rowType.create({ id: `row-generated-${rowIndex}` }, entries);
}

function findAncestorNode(selection: Selection, typeName: string): ProseMirrorNode | undefined {
  for (let depth = selection.$from.depth; depth >= 0; depth -= 1) {
    const node = selection.$from.node(depth);
    if (node.type.name === typeName) {
      return node;
    }
  }

  return undefined;
}

function findRowRefBySelection(grid: S1000DTgroupGrid, selection: Selection): S1000DRowRef | undefined {
  void grid;
  void selection;
  return undefined;
}

function findEntryRefBySelection(grid: S1000DTgroupGrid, selection: Selection): S1000DEntryRef | undefined {
  void grid;
  void selection;
  return undefined;
}
