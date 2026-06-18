import { NodeSelection, TextSelection, type EditorState, type Transaction } from 'prosemirror-state';
import { Schema, type Node as ProseMirrorNode } from 'prosemirror-model';

import { S1000DCellSelection, createS1000DTableGrid, parseS1000DTableXml, s1000dTableNodeNames, type S1000DTableProfile } from 'prosemirror-html-table-s1000d';
import { s1000dTableInteractionPluginKey } from 'prosemirror-html-table-s1000d/tiptap';

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
  const [firstEntryPos] = getFirstTbodyEntryPositions(state.doc);
  if (typeof firstEntryPos !== 'number') return null;
  const tableInfo = findFirstS1000DTable(state.doc);
  if (!tableInfo) return null;
  return state.tr
    .setSelection(S1000DCellSelection.rowSelection(state.doc.resolve(firstEntryPos + 1)))
    .setMeta(s1000dTableInteractionPluginKey, {
      selectedAxis: {
        kind: 'row',
        index: 0,
        tablePos: tableInfo.tablePos,
        tgroupIndex: 0,
      },
      selectedAxisExplicit: true,
    })
    .scrollIntoView();
}

export function selectFirstBodyColumn(state: EditorState): Transaction | null {
  const [firstEntryPos] = getFirstTbodyEntryPositions(state.doc);
  if (typeof firstEntryPos !== 'number') return null;
  const tableInfo = findFirstS1000DTable(state.doc);
  if (!tableInfo) return null;
  return state.tr
    .setSelection(S1000DCellSelection.colSelection(state.doc.resolve(firstEntryPos + 1)))
    .setMeta(s1000dTableInteractionPluginKey, {
      selectedAxis: {
        kind: 'column',
        index: 0,
        tablePos: tableInfo.tablePos,
        tgroupIndex: 0,
      },
      selectedAxisExplicit: true,
    })
    .scrollIntoView();
}

export function selectFirstTwoBodyCells(state: EditorState): Transaction | null {
  const [firstEntryPos, secondEntryPos] = getFirstTbodyEntryPositions(state.doc);
  if (typeof firstEntryPos !== 'number' || typeof secondEntryPos !== 'number') return null;
  return state.tr.setSelection(S1000DCellSelection.create(state.doc, firstEntryPos, secondEntryPos)).scrollIntoView();
}

export function selectWholeTable(state: EditorState): Transaction | null {
  const tableInfo = findFirstS1000DTable(state.doc);
  if (!tableInfo) return null;
  return state.tr.setSelection(NodeSelection.create(state.doc, tableInfo.tablePos)).scrollIntoView();
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
  const tableInfo = findFirstS1000DTable(doc);
  if (!tableInfo) return null;

  const tgroup = createS1000DTableGrid(tableInfo.table).tgroups[tgroupIndex];
  if (!tgroup) return null;

  const entry = tgroup.slots[rowIndex]?.[columnIndex]?.entry;
  if (!entry) return null;

  return getNodePositions(doc).get(entry.node) ?? null;
}

export function selectGridCell(
  state: EditorState,
  rowIndex: number,
  columnIndex: number,
  tgroupIndex = 0,
): Transaction | null {
  const entryPos = findGridEntryPosition(state.doc, rowIndex, columnIndex, tgroupIndex);
  if (typeof entryPos !== 'number') return null;
  return state.tr.setSelection(S1000DCellSelection.create(state.doc, entryPos)).scrollIntoView();
}

export function selectGridRange(
  state: EditorState,
  anchorRowIndex: number,
  anchorColumnIndex: number,
  headRowIndex: number,
  headColumnIndex: number,
  tgroupIndex = 0,
): Transaction | null {
  const anchorPos = findGridEntryPosition(state.doc, anchorRowIndex, anchorColumnIndex, tgroupIndex);
  const headPos = findGridEntryPosition(state.doc, headRowIndex, headColumnIndex, tgroupIndex);
  if (typeof anchorPos !== 'number' || typeof headPos !== 'number') return null;
  return state.tr.setSelection(S1000DCellSelection.create(state.doc, anchorPos, headPos)).scrollIntoView();
}

export function selectGridRow(
  state: EditorState,
  rowIndex: number,
  tgroupIndex = 0,
): Transaction | null {
  const entryPos = findGridEntryPosition(state.doc, rowIndex, 0, tgroupIndex);
  const tableInfo = findFirstS1000DTable(state.doc);
  if (typeof entryPos !== 'number' || !tableInfo) return null;
  return state.tr
    .setSelection(S1000DCellSelection.rowSelection(state.doc.resolve(entryPos + 1)))
    .setMeta(s1000dTableInteractionPluginKey, {
      selectedAxis: {
        kind: 'row',
        index: rowIndex,
        tablePos: tableInfo.tablePos,
        tgroupIndex,
      },
      selectedAxisExplicit: true,
    })
    .scrollIntoView();
}

export function selectGridColumn(
  state: EditorState,
  columnIndex: number,
  tgroupIndex = 0,
): Transaction | null {
  const entryPos = findGridEntryPosition(state.doc, 0, columnIndex, tgroupIndex);
  const tableInfo = findFirstS1000DTable(state.doc);
  if (typeof entryPos !== 'number' || !tableInfo) return null;
  return state.tr
    .setSelection(S1000DCellSelection.colSelection(state.doc.resolve(entryPos + 1)))
    .setMeta(s1000dTableInteractionPluginKey, {
      selectedAxis: {
        kind: 'column',
        index: columnIndex,
        tablePos: tableInfo.tablePos,
        tgroupIndex,
      },
      selectedAxisExplicit: true,
    })
    .scrollIntoView();
}

function getNodePositions(doc: ProseMirrorNode): Map<ProseMirrorNode, number> {
  const nodePositions = new Map<ProseMirrorNode, number>();
  doc.descendants((node, pos) => {
    nodePositions.set(node, pos);
    return true;
  });
  return nodePositions;
}
