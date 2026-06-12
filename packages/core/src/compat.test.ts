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
  HtmlTableMap,
  mergeCells,
  officialCompat,
  setCellAttr,
  splitCellWithType,
  TableMap,
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

function createStateWithoutTable(): EditorState {
  const doc = schema.nodes.doc!.create(null, [
    schema.nodes.paragraph!.create(null, schema.text('outside')),
  ]);

  return EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, 2),
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

  it('returns null when findTable is outside a table', () => {
    const state = createStateWithoutTable();

    expect(findTable(state.selection.$from)).toBeNull();
  });

  it('finds the current cell position from a selection hit point', () => {
    const state = createStateWithTable();
    const result = findCellPos(state.doc, state.selection.from);

    expect(result?.pos).toBe((state.selection as CellSelection).anchorCellPos);
  });

  it('returns undefined when findCellPos has no nearby table cell', () => {
    const state = createStateWithoutTable();

    expect(findCellPos(state.doc, state.selection.from)).toBeUndefined();
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

  it('returns null when findCellRange spans different tables', () => {
    const firstTable = createHtmlTableNode(schema, { rows: 1, cols: 1, withHeaderRow: true });
    const secondTable = createHtmlTableNode(schema, { rows: 1, cols: 1, withHeaderRow: true });
    const doc = schema.nodes.doc!.create(null, [firstTable, secondTable]);
    const cellPositions = findNodePositions(doc, 'htmlTableHeaderCell');
    const state = EditorState.create({
      schema,
      doc,
      selection: TextSelection.create(doc, cellPositions[0]! + 2),
    });

    expect(findCellRange(state.selection, cellPositions[0], cellPositions[1])).toBeNull();
  });

  it('aliases setCellAttr to setCellAttribute semantics', () => {
    const nextState = applyCommand(createStateWithTable(), setCellAttr('colspan', 2));
    const body = getBody(nextState.doc.firstChild!);
    const firstHeaderCell = body?.firstChild?.firstChild;

    expect(firstHeaderCell?.attrs.colspan).toBe(2);
  });

  it('returns false from setCellAttr when the value is unchanged', () => {
    const state = createStateWithTable();
    let dispatched = false;
    const result = setCellAttr('colspan', 1)(state, () => {
      dispatched = true;
    });

    expect(result).toBe(false);
    expect(dispatched).toBe(false);
  });

  it('routes toggleHeader(type) to the matching command', () => {
    const nextState = applyCommand(createStateWithTable(), toggleHeader('cell'));
    const body = getBody(nextState.doc.firstChild!);
    const firstHeaderCell = body?.firstChild?.firstChild;

    expect(firstHeaderCell?.type.name).toBe('htmlTableCell');
  });

  it('returns false from toggleHeader for unknown runtime types', () => {
    const state = createStateWithTable();
    const command = toggleHeader('section' as Parameters<typeof toggleHeader>[0]);

    expect(command(state)).toBe(false);
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

  it('returns false from splitCellWithType when the current cell is not merged', () => {
    const state = createStateWithTable();
    const result = splitCellWithType(() => schema.nodes.htmlTableCell!)(state);

    expect(result).toBe(false);
  });

  it('returns false from splitCellWithType outside a table', () => {
    const state = createStateWithoutTable();
    const result = splitCellWithType(() => schema.nodes.htmlTableCell!)(state);

    expect(result).toBe(false);
  });

  it('exposes the compat layer through the officialCompat namespace', () => {
    expect(TableMap).toBe(HtmlTableMap);
    expect(officialCompat.TableMap).toBe(HtmlTableMap);
    expect(officialCompat.findTable).toBe(findTable);
    expect(officialCompat.findCellPos).toBe(findCellPos);
    expect(officialCompat.findCellRange).toBe(findCellRange);
    expect(officialCompat.setCellAttr).toBe(setCellAttr);
    expect(officialCompat.splitCellWithType).toBe(splitCellWithType);
    expect(officialCompat.toggleHeader).toBe(toggleHeader);
  });
});
