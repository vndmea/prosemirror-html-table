import { Schema, type Node as ProseMirrorNode } from 'prosemirror-model';
import { EditorState, NodeSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';

import {
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  CellSelection,
  createHtmlTableNode,
  createHtmlTableNodeSpecs,
  deleteColumn,
  deleteRow,
  deleteTable,
  fixTables,
  goToNextCell,
  goToPreviousCell,
  insertHtmlTable,
  mergeCells,
  mergeOrSplit,
  normalizeHtmlTable,
  removeCaption,
  selectCell,
  selectColumn,
  selectRow,
  selectTable,
  setCaption,
  setCellAttribute,
  splitCell,
  toggleHeaderCell,
  toggleHeaderColumn,
  toggleHeaderRow,
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

function applyCommand(state: EditorState, command: ReturnType<typeof addRowAfter>): EditorState {
  let nextState = state;
  const result = command(state, (tr) => {
    nextState = state.apply(tr);
  });

  expect(result).toBe(true);
  return nextState;
}

function getTable(doc: ProseMirrorNode): ProseMirrorNode {
  const table = doc.firstChild;

  if (!table || table.type.name !== 'htmlTable') {
    throw new Error('Expected first document child to be htmlTable.');
  }

  return table;
}

function getBody(table: ProseMirrorNode): ProseMirrorNode {
  for (let index = 0; index < table.childCount; index += 1) {
    const child = table.child(index);
    if (child.type.name === 'htmlTableBody') return child;
  }

  throw new Error('Expected htmlTableBody child.');
}

function getSelectedCellType(state: EditorState): string | undefined {
  const { $from } = state.selection;

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === 'htmlTableHeaderCell' || node.type.name === 'htmlTableCell') {
      return node.type.name;
    }
  }

  return undefined;
}

function findNodePositions(doc: ProseMirrorNode, typeName: string): number[] {
  const positions: number[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name === typeName) {
      positions.push(pos);
    }

    return true;
  });

  return positions;
}

describe('html table commands', () => {
  it('inserts a generated HTML table at the current selection', () => {
    const state = EditorState.create({
      schema,
      doc: schema.nodes.doc!.create(null, [schema.nodes.paragraph!.create()]),
    });
    let nextState = state;

    const result = insertHtmlTable({ rows: 2, cols: 2, withHeaderRow: true, withCaption: true, captionText: 'Demo' })(
      state,
      (tr) => {
        nextState = state.apply(tr);
      },
    );

    expect(result).toBe(true);
    expect(nextState.doc.firstChild?.type.name).toBe('htmlTable');
    expect(nextState.doc.firstChild?.child(0).type.name).toBe('htmlTableCaption');
    expect(nextState.doc.firstChild?.child(1).type.name).toBe('htmlTableBody');
  });

  it('adds rows before and after the selected row', () => {
    const afterState = applyCommand(createStateWithTable(2, 2), addRowAfter());
    expect(getBody(getTable(afterState.doc)).childCount).toBe(3);

    const beforeState = applyCommand(createStateWithTable(2, 2), addRowBefore());
    expect(getBody(getTable(beforeState.doc)).childCount).toBe(3);
  });

  it('deletes the selected row but keeps the last body row', () => {
    const nextState = applyCommand(createStateWithTable(2, 2), deleteRow());
    expect(getBody(getTable(nextState.doc)).childCount).toBe(1);

    const singleRowState = createStateWithTable(1, 2);
    const result = deleteRow()(singleRowState, () => {
      throw new Error('deleteRow should not dispatch for the last body row.');
    });

    expect(result).toBe(false);
  });

  it('adds columns before and after the selected cell', () => {
    const afterState = applyCommand(createStateWithTable(2, 2), addColumnAfter());
    expect(getBody(getTable(afterState.doc)).child(0).childCount).toBe(3);
    expect(getBody(getTable(afterState.doc)).child(1).childCount).toBe(3);

    const beforeState = applyCommand(createStateWithTable(2, 2), addColumnBefore());
    expect(getBody(getTable(beforeState.doc)).child(0).childCount).toBe(3);
    expect(getBody(getTable(beforeState.doc)).child(1).childCount).toBe(3);
  });

  it('deletes the selected column but keeps the last column', () => {
    const nextState = applyCommand(createStateWithTable(2, 2), deleteColumn());
    expect(getBody(getTable(nextState.doc)).child(0).childCount).toBe(1);
    expect(getBody(getTable(nextState.doc)).child(1).childCount).toBe(1);

    const singleColumnState = createStateWithTable(2, 1);
    const result = deleteColumn()(singleColumnState, () => {
      throw new Error('deleteColumn should not dispatch for the last column.');
    });

    expect(result).toBe(false);
  });

  it('deletes the selected table', () => {
    const table = createHtmlTableNode(schema, { rows: 2, cols: 2 });
    const trailingParagraph = schema.nodes.paragraph!.create();
    const doc = schema.nodes.doc!.create(null, [table, trailingParagraph]);
    const firstCellPos = findNodePositions(doc, 'htmlTableCell')[0] ?? findNodePositions(doc, 'htmlTableHeaderCell')[0];
    const state = EditorState.create({
      schema,
      doc,
      selection: CellSelection.create(doc, firstCellPos!),
    });

    const nextState = applyCommand(state, deleteTable());

    expect(nextState.doc.firstChild?.type.name).toBe('paragraph');
  });

  it('sets an attribute on the selected cell', () => {
    const nextState = applyCommand(createStateWithTable(2, 2), setCellAttribute('colspan', 2));
    const firstCell = getBody(getTable(nextState.doc)).child(0).child(0);

    expect(firstCell.attrs.colspan).toBe(2);
  });

  it('adds or updates a caption on the current table', () => {
    const insertedCaptionState = applyCommand(createStateWithTable(2, 2), setCaption('Summary'));
    expect(getTable(insertedCaptionState.doc).child(0).type.name).toBe('htmlTableCaption');
    expect(getTable(insertedCaptionState.doc).child(0).textContent).toBe('Summary');

    const table = createHtmlTableNode(schema, { rows: 2, cols: 2, withCaption: true, captionText: 'Before' });
    const doc = schema.nodes.doc!.create(null, [table]);
    const firstCellPos = findNodePositions(doc, 'htmlTableCell')[0] ?? findNodePositions(doc, 'htmlTableHeaderCell')[0];
    const state = EditorState.create({
      schema,
      doc,
      selection: CellSelection.create(doc, firstCellPos!),
    });
    const updatedCaptionState = applyCommand(state, setCaption('After'));

    expect(getTable(updatedCaptionState.doc).child(0).textContent).toBe('After');
  });

  it('removes an existing caption from the current table', () => {
    const table = createHtmlTableNode(schema, { rows: 2, cols: 2, withCaption: true, captionText: 'Summary' });
    const doc = schema.nodes.doc!.create(null, [table]);
    const firstCellPos = findNodePositions(doc, 'htmlTableCell')[0] ?? findNodePositions(doc, 'htmlTableHeaderCell')[0];
    const state = EditorState.create({
      schema,
      doc,
      selection: CellSelection.create(doc, firstCellPos!),
    });

    const nextState = applyCommand(state, removeCaption());

    expect(getTable(nextState.doc).child(0).type.name).toBe('htmlTableBody');
  });

  it('toggles the selected cell between header and body cell types', () => {
    const nextState = applyCommand(createStateWithTable(2, 2), toggleHeaderCell());
    const firstCell = getBody(getTable(nextState.doc)).child(0).child(0);

    expect(firstCell.type.name).toBe('htmlTableCell');
  });

  it('toggles the selected row between header and body cell types', () => {
    const nextState = applyCommand(createStateWithTable(2, 2), toggleHeaderRow());
    const firstRow = getBody(getTable(nextState.doc)).child(0);

    expect(firstRow.child(0).type.name).toBe('htmlTableCell');
    expect(firstRow.child(1).type.name).toBe('htmlTableCell');
  });

  it('toggles the selected column between header and body cell types', () => {
    const nextState = applyCommand(createStateWithTable(2, 2), toggleHeaderColumn());
    const body = getBody(getTable(nextState.doc));

    expect(body.child(0).child(0).type.name).toBe('htmlTableHeaderCell');
    expect(body.child(1).child(0).type.name).toBe('htmlTableHeaderCell');
    expect(body.child(1).child(1).type.name).toBe('htmlTableCell');
  });

  it('moves the selection to the next and previous table cells', () => {
    const nextState = applyCommand(createStateWithTable(2, 2), goToNextCell());
    expect(getSelectedCellType(nextState)).toBe('htmlTableHeaderCell');
    expect(nextState.selection.from).toBeGreaterThan(1);

    const previousState = applyCommand(nextState, goToPreviousCell());
    expect(getSelectedCellType(previousState)).toBe('htmlTableHeaderCell');
    expect(previousState.selection.from).toBeLessThan(nextState.selection.from);
  });

  it('cycles cell navigation when requested', () => {
    const firstState = createStateWithTable(1, 1);
    const nextState = applyCommand(firstState, goToNextCell({ cycle: true }));

    expect(getSelectedCellType(nextState)).toBe('htmlTableHeaderCell');
  });

  it('selects the current cell as a node selection', () => {
    const nextState = applyCommand(createStateWithTable(2, 2), selectCell());

    expect(nextState.selection).toBeInstanceOf(CellSelection);
    expect(getSelectedCellType(nextState)).toBe('htmlTableHeaderCell');
  });

  it('selects the current row as a text range', () => {
    const nextState = applyCommand(createStateWithTable(2, 2), selectRow());

    expect(nextState.selection).toBeInstanceOf(CellSelection);
    expect(nextState.selection.empty).toBe(false);
  });

  it('selects the current column as a text range', () => {
    const nextState = applyCommand(createStateWithTable(2, 2), selectColumn());

    expect(nextState.selection).toBeInstanceOf(CellSelection);
    expect(nextState.selection.empty).toBe(false);
  });

  it('selects the whole table as a node selection', () => {
    const nextState = applyCommand(createStateWithTable(2, 2), selectTable());

    expect(nextState.selection).toBeInstanceOf(NodeSelection);
    expect((nextState.selection as NodeSelection).node.type.name).toBe('htmlTable');
  });

  it('merges a rectangular cell selection', () => {
    const state = createStateWithTable(2, 2);
    const cellPositions = [
      ...findNodePositions(state.doc, 'htmlTableHeaderCell'),
      ...findNodePositions(state.doc, 'htmlTableCell'),
    ];
    const selectedState = EditorState.create({
      schema,
      doc: state.doc,
      selection: CellSelection.create(state.doc, cellPositions[0]!, cellPositions[cellPositions.length - 1]!),
    });

    const nextState = applyCommand(selectedState, mergeCells());
    const firstCell = getBody(getTable(nextState.doc)).child(0).child(0);

    expect(firstCell.attrs.colspan).toBe(2);
    expect(firstCell.attrs.rowspan).toBe(2);
  });

  it('splits a merged cell back into individual cells', () => {
    const state = createStateWithTable(1, 2);
    const cellPositions = findNodePositions(state.doc, 'htmlTableHeaderCell');
    const selectedState = EditorState.create({
      schema,
      doc: state.doc,
      selection: CellSelection.create(state.doc, cellPositions[0]!, cellPositions[1]!),
    });
    const mergedState = applyCommand(selectedState, mergeCells());
    const nextState = applyCommand(mergedState, splitCell());
    const firstRow = getBody(getTable(nextState.doc)).child(0);

    expect(firstRow.childCount).toBe(2);
    expect(firstRow.child(0).attrs.colspan).toBe(1);
  });

  it('merges first and splits on repeated mergeOrSplit', () => {
    const state = createStateWithTable(2, 2);
    const cellPositions = [
      ...findNodePositions(state.doc, 'htmlTableHeaderCell'),
      ...findNodePositions(state.doc, 'htmlTableCell'),
    ];
    const selectedState = EditorState.create({
      schema,
      doc: state.doc,
      selection: CellSelection.create(state.doc, cellPositions[0]!, cellPositions[cellPositions.length - 1]!),
    });

    const mergedState = applyCommand(selectedState, mergeOrSplit());
    expect(getBody(getTable(mergedState.doc)).child(0).child(0).attrs.colspan).toBe(2);

    const mergedCellPos = (findNodePositions(mergedState.doc, 'htmlTableHeaderCell')[0]
      ?? findNodePositions(mergedState.doc, 'htmlTableCell')[0])!;
    const mergeFocusedState = EditorState.create({
      schema,
      doc: mergedState.doc,
      selection: CellSelection.create(mergedState.doc, mergedCellPos),
    });
    const splitState = applyCommand(mergeFocusedState, mergeOrSplit());
    expect(getBody(getTable(splitState.doc)).child(0).child(0).attrs.colspan).toBe(1);
  });

  it('normalizes malformed table structure and clamps invalid spans', () => {
    const overflowCell = schema.nodes.htmlTableCell!.create(
      {
        colspan: 3,
        rowspan: 99,
      },
      [schema.nodes.paragraph!.create()],
    );
    const body = schema.nodes.htmlTableBody!.create(null, [
      schema.nodes.htmlTableRow!.create(null, [overflowCell]),
      schema.nodes.htmlTableRow!.create(null, []),
    ]);
    const malformed = schema.nodes.htmlTable!.create(null, [body]);
    const normalized = normalizeHtmlTable(malformed);
    const normalizedBody = getBody(normalized);

    expect(normalizedBody.child(0).child(0).attrs.rowspan).toBe(2);
    expect(normalizedBody.child(0).childCount).toBeGreaterThan(0);
    expect(normalizedBody.child(1).childCount).toBeGreaterThan(0);
  });

  it('fixes malformed tables across the document', () => {
    const malformed = schema.nodes.htmlTable!.create(null, []);
    const doc = schema.nodes.doc!.create(null, [malformed]);
    const state = EditorState.create({ schema, doc });
    const nextState = applyCommand(state, fixTables());

    expect(getBody(getTable(nextState.doc)).childCount).toBe(1);
  });
});
