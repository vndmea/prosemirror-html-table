import { Schema, type Node as ProseMirrorNode } from 'prosemirror-model';
import { EditorState, TextSelection, type Command } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';

import {
  CellSelection,
  createHtmlTableNode,
  createHtmlTableNodeSpecs,
  findCellPos,
  findCellRange,
  findTable,
  mergeCells,
  officialCompat,
  setCellAttr,
  splitCellWithType,
  toggleHeader,
} from './index.js';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    text: { group: 'inline' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      toDOM: () => ['p', 0],
      parseDOM: [{ tag: 'p' }],
    },
    ...createHtmlTableNodeSpecs(),
  },
});

function createStateWithTable(rows = 2, cols = 2): EditorState {
  const table = createHtmlTableNode(schema, { rows, cols, withHeaderRow: true });
  const doc = schema.nodes.doc!.create(null, [table]);
  const firstCellPos = findNodePositions(doc, 'htmlTableHeaderCell')[0] ?? findNodePositions(doc, 'htmlTableCell')[0];

  return EditorState.create({
    schema,
    doc,
    selection: CellSelection.create(doc, firstCellPos!),
  });
}

function applyCommand(state: EditorState, command: Command): EditorState {
  let nextState = state;
  const result = command(state, (tr) => {
    nextState = state.apply(tr);
  });

  expect(result).toBe(true);
  return nextState;
}

function findNodePositions(doc: ProseMirrorNode, typeName: string): number[] {
  const positions: number[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name === typeName) positions.push(pos);
    return true;
  });

  return positions;
}

function getBody(table: ProseMirrorNode): ProseMirrorNode {
  for (let index = 0; index < table.childCount; index += 1) {
    const child = table.child(index);
    if (child.type.name === 'htmlTableBody') return child;
  }

  throw new Error('Expected htmlTableBody child.');
}

describe('official compat helpers', () => {
  it('finds the surrounding table from a cell selection position', () => {
    const state = createStateWithTable();
    const result = findTable(state.selection.$from);

    expect(result?.node.type.name).toBe('htmlTable');
    expect(result?.pos).toBe(0);
    expect(result?.start).toBe(1);
  });

  it('finds the current cell position from a selection hit point', () => {
    const state = createStateWithTable();
    const result = findCellPos(state.doc, state.selection.from);

    expect(result?.pos).toBe((state.selection as CellSelection).anchorCellPos);
  });

  it('finds a cell range from a text selection and hit points', () => {
    const state = createStateWithTable();
    const cellPositions = findNodePositions(state.doc, 'htmlTableHeaderCell');
    const textSelectionState = EditorState.create({
      schema,
      doc: state.doc,
      selection: TextSelection.create(state.doc, cellPositions[0]! + 2),
    });

    const result = findCellRange(textSelectionState.selection, cellPositions[0], cellPositions[1]);

    expect(result?.[0].pos).toBe(cellPositions[0]);
    expect(result?.[1].pos).toBe(cellPositions[1]);
  });

  it('aliases setCellAttr to setCellAttribute semantics', () => {
    const nextState = applyCommand(createStateWithTable(), setCellAttr('colspan', 2));
    const body = getBody(nextState.doc.firstChild!);
    const firstHeaderCell = body?.firstChild?.firstChild;

    expect(firstHeaderCell?.attrs.colspan).toBe(2);
  });

  it('routes toggleHeader(type) to the matching command', () => {
    const nextState = applyCommand(createStateWithTable(), toggleHeader('cell'));
    const body = getBody(nextState.doc.firstChild!);
    const firstHeaderCell = body?.firstChild?.firstChild;

    expect(firstHeaderCell?.type.name).toBe('htmlTableCell');
  });

  it('splits a merged cell with callback-selected cell types', () => {
    const state = createStateWithTable(1, 2);
    const cellPositions = findNodePositions(state.doc, 'htmlTableHeaderCell');
    const selectedState = EditorState.create({
      schema,
      doc: state.doc,
      selection: CellSelection.create(state.doc, cellPositions[0]!, cellPositions[1]!),
    });
    const mergedState = applyCommand(selectedState, mergeCells());
    const mergedCellPos = findNodePositions(mergedState.doc, 'htmlTableHeaderCell')[0]!;
    const mergedSelectionState = EditorState.create({
      schema,
      doc: mergedState.doc,
      selection: CellSelection.create(mergedState.doc, mergedCellPos),
    });

    const nextState = applyCommand(
      mergedSelectionState,
      splitCellWithType(({ col }) => (col === 0 ? schema.nodes.htmlTableHeaderCell! : schema.nodes.htmlTableCell!)),
    );
    const firstRow = getBody(nextState.doc.firstChild!).firstChild!;

    expect(firstRow.child(0).type.name).toBe('htmlTableHeaderCell');
    expect(firstRow.child(1).type.name).toBe('htmlTableCell');
  });

  it('exposes the compat layer through the officialCompat namespace', () => {
    expect(officialCompat.findTable).toBe(findTable);
    expect(officialCompat.findCellRange).toBe(findCellRange);
    expect(officialCompat.splitCellWithType).toBe(splitCellWithType);
  });
});
