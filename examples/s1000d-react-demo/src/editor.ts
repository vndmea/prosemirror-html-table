import { TextSelection, type EditorState, type Transaction } from 'prosemirror-state';
import { Schema, type Node as ProseMirrorNode } from 'prosemirror-model';

import { S1000DCellSelection, createS1000DTableGrid, parseS1000DTableXml, s1000dTableNodeNames, type S1000DTableProfile } from 'prosemirror-html-table-s1000d';
import {
  createS1000DCellRangeTr,
  createS1000DCellSelectTr,
  createS1000DColumnSelectTr,
  createS1000DRowSelectTr,
  createS1000DTableSelectTr,
  findS1000DGridEntryPosition,
} from 'prosemirror-html-table-s1000d/tiptap';

export function createDocFromS1000DXml(
  schema: Schema,
  xml: string,
  profile: S1000DTableProfile,
): ProseMirrorNode {
  const table = parseS1000DTableXml(xml, schema, { profile });
  const doc = schema.topNodeType.createAndFill(null, [table]);

  if (!doc) {
    throw new Error('Unable to create a ProseMirror document from the S1000D XML sample.');
  }

  return doc;
}

export function findFirstS1000DTable(doc: ProseMirrorNode): {
  table: ProseMirrorNode;
  tablePos: number;
} | null {
  let result: { table: ProseMirrorNode; tablePos: number } | null = null;

  doc.descendants((node, pos) => {
    if (node.type.name === s1000dTableNodeNames.table) {
      result = { table: node, tablePos: pos };
      return false;
    }
    return true;
  });

  return result;
}

export function getFirstTbodyEntryPositions(doc: ProseMirrorNode): number[] {
  const tableInfo = findFirstS1000DTable(doc);
  if (!tableInfo) return [];

  const nodePositions = getNodePositions(doc);

  const firstTgroup = createS1000DTableGrid(tableInfo.table).tgroups[0];
  if (!firstTgroup) return [];

  return firstTgroup.entries
    .filter((entry) => entry.section === 'tbody')
    .map((entry) => nodePositions.get(entry.node))
    .filter((pos): pos is number => typeof pos === 'number');
}

export function selectFirstBodyCell(state: EditorState): Transaction | null {
  const [firstEntryPos] = getFirstTbodyEntryPositions(state.doc);
  if (typeof firstEntryPos !== 'number') return null;
  return state.tr.setSelection(S1000DCellSelection.create(state.doc, firstEntryPos)).scrollIntoView();
}

export function selectFirstBodyRow(state: EditorState): Transaction | null {
  const tableInfo = findFirstS1000DTable(state.doc);
  if (!tableInfo) return null;
  const firstTgroup = createS1000DTableGrid(tableInfo.table).tgroups[0];
  const firstBodyRow = firstTgroup?.rows.find((row) => row.section === 'tbody');
  if (!firstBodyRow) return null;
  return createS1000DRowSelectTr(state, firstBodyRow.rowIndex, 0);
}

export function selectFirstBodyColumn(state: EditorState): Transaction | null {
  if (getFirstTbodyEntryPositions(state.doc).length === 0) return null;
  return createS1000DColumnSelectTr(state, 0, 0);
}

export function selectFirstTwoBodyCells(state: EditorState): Transaction | null {
  const [firstEntryPos, secondEntryPos] = getFirstTbodyEntryPositions(state.doc);
  if (typeof firstEntryPos !== 'number' || typeof secondEntryPos !== 'number') return null;
  return state.tr.setSelection(S1000DCellSelection.create(state.doc, firstEntryPos, secondEntryPos)).scrollIntoView();
}

export function selectWholeTable(state: EditorState): Transaction | null {
  return createS1000DTableSelectTr(state);
}

export function focusFirstBodyCell(state: EditorState): Transaction | null {
  const [firstEntryPos] = getFirstTbodyEntryPositions(state.doc);
  if (typeof firstEntryPos !== 'number') return null;
  return state.tr.setSelection(TextSelection.near(state.doc.resolve(firstEntryPos + 1))).scrollIntoView();
}

export function findGridEntryPosition(
  doc: ProseMirrorNode,
  rowIndex: number,
  columnIndex: number,
  tgroupIndex = 0,
): number | null {
  return findS1000DGridEntryPosition(doc, rowIndex, columnIndex, tgroupIndex);
}

export function selectGridCell(
  state: EditorState,
  rowIndex: number,
  columnIndex: number,
  tgroupIndex = 0,
): Transaction | null {
  return createS1000DCellSelectTr(state, rowIndex, columnIndex, tgroupIndex);
}

export function selectGridRange(
  state: EditorState,
  anchorRowIndex: number,
  anchorColumnIndex: number,
  headRowIndex: number,
  headColumnIndex: number,
  tgroupIndex = 0,
): Transaction | null {
  return createS1000DCellRangeTr(
    state,
    anchorRowIndex,
    anchorColumnIndex,
    headRowIndex,
    headColumnIndex,
    tgroupIndex,
  );
}

export function selectGridRow(
  state: EditorState,
  rowIndex: number,
  tgroupIndex = 0,
): Transaction | null {
  return createS1000DRowSelectTr(state, rowIndex, tgroupIndex);
}

export function selectGridColumn(
  state: EditorState,
  columnIndex: number,
  tgroupIndex = 0,
): Transaction | null {
  return createS1000DColumnSelectTr(state, columnIndex, tgroupIndex);
}

function getNodePositions(doc: ProseMirrorNode): Map<ProseMirrorNode, number> {
  const nodePositions = new Map<ProseMirrorNode, number>();
  doc.descendants((node, pos) => {
    nodePositions.set(node, pos);
    return true;
  });
  return nodePositions;
}
