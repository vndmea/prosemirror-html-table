import { Schema, type Node as ProseMirrorNode } from 'prosemirror-model';
import { EditorState, NodeSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';

import {
  addFootSection,
  addHeadSection,
  addRowToBody,
  addRowToFoot,
  addRowToHead,
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  CellSelection,
  clearColumnContent,
  clearRowContent,
  clearSelectedCells,
  createHtmlTableNode,
  createHtmlTableNodeSpecs,
  deleteColumn,
  removeColgroup,
  deleteRow,
  deleteTable,
  duplicateRow,
  fixTables,
  goToNextCell,
  goToPreviousCell,
  insertHtmlTable,
  mergeCells,
  mergeOrSplit,
  moveRowDown,
  moveRowToBody,
  moveRowToFoot,
  moveRowToHead,
  moveRowUp,
  removeFootSection,
  removeHeadSection,
  normalizeHtmlTable,
  removeCaption,
  selectCell,
  selectColumn,
  selectRow,
  selectTable,
  setColgroup,
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
  return createStateForTable(table);
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

function getSection(table: ProseMirrorNode, typeName: string): ProseMirrorNode | undefined {
  for (let index = 0; index < table.childCount; index += 1) {
    const child = table.child(index);
    if (child.type.name === typeName) return child;
  }

  return undefined;
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

function createStateForTable(table: ProseMirrorNode): EditorState {
  const doc = schema.nodes.doc!.create(null, [table]);
  const firstCellPos = findNodePositions(doc, 'htmlTableHeaderCell')[0] ?? findNodePositions(doc, 'htmlTableCell')[0];

  return EditorState.create({
    schema,
    doc,
    selection: CellSelection.create(doc, firstCellPos!),
  });
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
    const state = createStateForTable(table);

    const nextState = applyCommand(state, removeCaption());

    expect(getTable(nextState.doc).child(0).type.name).toBe('htmlTableBody');
  });

  it('adds or updates a colgroup on the current table', () => {
    const insertedColgroupState = applyCommand(createStateWithTable(2, 2), setColgroup([180, 240]));
    const insertedTable = getTable(insertedColgroupState.doc);

    expect(insertedTable.child(0).type.name).toBe('htmlTableColgroup');
    expect(insertedTable.child(0).child(0).attrs.width).toBe(180);
    expect(insertedTable.child(0).child(1).attrs.width).toBe(240);

    const table = createHtmlTableNode(schema, { rows: 2, cols: 2, withCaption: true, captionText: 'Summary' });
    const updatedState = applyCommand(createStateForTable(table), setColgroup([160, 220]));
    const updatedTable = getTable(updatedState.doc);

    expect(updatedTable.child(0).type.name).toBe('htmlTableCaption');
    expect(updatedTable.child(1).type.name).toBe('htmlTableColgroup');
    expect(updatedTable.child(1).child(0).attrs.width).toBe(160);
    expect(updatedTable.child(1).child(1).attrs.width).toBe(220);
  });

  it('removes an existing colgroup from the current table', () => {
    const table = createHtmlTableNode(schema, { rows: 2, cols: 2, withCaption: true, captionText: 'Summary' });
    const stateWithColgroup = applyCommand(createStateForTable(table), setColgroup([180, 240]));
    const nextState = applyCommand(stateWithColgroup, removeColgroup());
    const nextTable = getTable(nextState.doc);

    expect(nextTable.child(0).type.name).toBe('htmlTableCaption');
    expect(nextTable.child(1).type.name).toBe('htmlTableBody');
  });

  it('moves the selected row into the table head and converts cells to headers', () => {
    const nextState = applyCommand(createStateWithTable(2, 2), moveRowToHead());
    const nextTable = getTable(nextState.doc);
    const head = getSection(nextTable, 'htmlTableHead');
    const body = getBody(nextTable);

    expect(head?.childCount).toBe(1);
    expect(head?.child(0).child(0).type.name).toBe('htmlTableHeaderCell');
    expect(body.childCount).toBe(1);
  });

  it('moves a head row back into the body and converts cells to body cells', () => {
    const table = schema.nodes.htmlTable!.create(null, [
      schema.nodes.htmlTableHead!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableHeaderCell!.create(null, [schema.nodes.paragraph!.create()]),
          schema.nodes.htmlTableHeaderCell!.create(null, [schema.nodes.paragraph!.create()]),
        ]),
      ]),
      schema.nodes.htmlTableBody!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create()]),
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create()]),
        ]),
      ]),
    ]);
    const nextState = applyCommand(createStateForTable(table), moveRowToBody());
    const nextTable = getTable(nextState.doc);
    const body = getBody(nextTable);

    expect(getSection(nextTable, 'htmlTableHead')).toBeUndefined();
    expect(body.childCount).toBe(2);
    expect(body.child(1).child(0).type.name).toBe('htmlTableCell');
  });

  it('moves the selected row into the table foot', () => {
    const nextState = applyCommand(createStateWithTable(2, 2), moveRowToFoot());
    const nextTable = getTable(nextState.doc);
    const foot = getSection(nextTable, 'htmlTableFoot');
    const body = getBody(nextTable);

    expect(foot?.childCount).toBe(1);
    expect(foot?.child(0).child(0).type.name).toBe('htmlTableCell');
    expect(body.childCount).toBe(1);
  });

  it('adds an explicit head section in the correct position', () => {
    const nextState = applyCommand(createStateWithTable(2, 2), addHeadSection());
    const nextTable = getTable(nextState.doc);
    const head = getSection(nextTable, 'htmlTableHead');

    expect(nextTable.child(0).type.name).toBe('htmlTableHead');
    expect(head?.childCount).toBe(1);
    expect(head?.child(0).child(0).type.name).toBe('htmlTableHeaderCell');
  });

  it('removes the head section and merges its rows into the body', () => {
    const table = schema.nodes.htmlTable!.create(null, [
      schema.nodes.htmlTableHead!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableHeaderCell!.create(null, [schema.nodes.paragraph!.create()]),
          schema.nodes.htmlTableHeaderCell!.create(null, [schema.nodes.paragraph!.create()]),
        ]),
      ]),
      schema.nodes.htmlTableBody!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create()]),
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create()]),
        ]),
      ]),
    ]);
    const nextState = applyCommand(createStateForTable(table), removeHeadSection());
    const nextTable = getTable(nextState.doc);
    const body = getBody(nextTable);

    expect(getSection(nextTable, 'htmlTableHead')).toBeUndefined();
    expect(body.childCount).toBe(2);
    expect(body.child(0).child(0).type.name).toBe('htmlTableCell');
  });

  it('adds and removes an explicit foot section while preserving rows', () => {
    const stateWithFoot = applyCommand(createStateWithTable(2, 2), addFootSection());
    const tableWithFoot = getTable(stateWithFoot.doc);
    const foot = getSection(tableWithFoot, 'htmlTableFoot');

    expect(foot?.childCount).toBe(1);
    expect(foot?.child(0).child(0).type.name).toBe('htmlTableCell');

    const nextState = applyCommand(stateWithFoot, removeFootSection());
    const nextTable = getTable(nextState.doc);
    const body = getBody(nextTable);

    expect(getSection(nextTable, 'htmlTableFoot')).toBeUndefined();
    expect(body.childCount).toBe(3);
    expect(body.child(2).child(0).type.name).toBe('htmlTableCell');
  });

  it('adds a new row directly into the head section', () => {
    const nextState = applyCommand(createStateWithTable(2, 2), addRowToHead());
    const nextTable = getTable(nextState.doc);
    const head = getSection(nextTable, 'htmlTableHead');

    expect(head?.childCount).toBe(1);
    expect(head?.child(0).child(0).type.name).toBe('htmlTableHeaderCell');
  });

  it('adds a new row directly into the body section', () => {
    const nextState = applyCommand(createStateWithTable(2, 2), addRowToBody());
    const nextTable = getTable(nextState.doc);
    const body = getBody(nextTable);

    expect(body.childCount).toBe(3);
    expect(body.child(2).child(0).type.name).toBe('htmlTableCell');
  });

  it('adds a new row directly into the foot section', () => {
    const nextState = applyCommand(createStateWithTable(2, 2), addRowToFoot());
    const nextTable = getTable(nextState.doc);
    const foot = getSection(nextTable, 'htmlTableFoot');

    expect(foot?.childCount).toBe(1);
    expect(foot?.child(0).child(0).type.name).toBe('htmlTableCell');
  });

  it('moves the current body row upward within the same section', () => {
    const table = schema.nodes.htmlTable!.create(null, [
      schema.nodes.htmlTableBody!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('A'))]),
        ]),
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('B'))]),
        ]),
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('C'))]),
        ]),
      ]),
    ]);
    const doc = schema.nodes.doc!.create(null, [table]);
    const cellPositions = findNodePositions(doc, 'htmlTableCell');
    const state = EditorState.create({
      schema,
      doc,
      selection: CellSelection.create(doc, cellPositions[1]!),
    });
    const movedState = applyCommand(state, moveRowUp());
    const body = getBody(getTable(movedState.doc));

    expect(body.child(0).textContent).toBe('B');
    expect(body.child(1).textContent).toBe('A');
    expect(body.child(2).textContent).toBe('C');
  });

  it('moves the current body row downward within the same section', () => {
    const table = schema.nodes.htmlTable!.create(null, [
      schema.nodes.htmlTableBody!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('A'))]),
        ]),
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('B'))]),
        ]),
      ]),
    ]);
    const state = createStateForTable(table);
    const movedState = applyCommand(state, moveRowDown());
    const body = getBody(getTable(movedState.doc));

    expect(body.child(0).textContent).toBe('B');
    expect(body.child(1).textContent).toBe('A');
  });

  it('duplicates the current row within the same section', () => {
    const table = schema.nodes.htmlTable!.create(null, [
      schema.nodes.htmlTableBody!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('A'))]),
        ]),
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('B'))]),
        ]),
      ]),
    ]);
    const state = createStateForTable(table);
    const nextState = applyCommand(state, duplicateRow());
    const body = getBody(getTable(nextState.doc));

    expect(body.childCount).toBe(3);
    expect(body.child(0).textContent).toBe('A');
    expect(body.child(1).textContent).toBe('A');
    expect(body.child(2).textContent).toBe('B');
  });

  it('does not duplicate a row that contains rowspan cells', () => {
    const table = schema.nodes.htmlTable!.create(null, [
      schema.nodes.htmlTableBody!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create({ rowspan: 2 }, [schema.nodes.paragraph!.create(null, schema.text('A'))]),
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('B'))]),
        ]),
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('C'))]),
        ]),
      ]),
    ]);
    const state = createStateForTable(table);
    let dispatched = false;

    const result = duplicateRow()(state, () => {
      dispatched = true;
    });

    expect(result).toBe(false);
    expect(dispatched).toBe(false);
  });

  it('clears the currently selected cells without changing table structure', () => {
    const table = schema.nodes.htmlTable!.create(null, [
      schema.nodes.htmlTableBody!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('A'))]),
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('B'))]),
        ]),
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('C'))]),
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('D'))]),
        ]),
      ]),
    ]);
    const doc = schema.nodes.doc!.create(null, [table]);
    const cellPositions = findNodePositions(doc, 'htmlTableCell');
    const state = EditorState.create({
      schema,
      doc,
      selection: CellSelection.create(doc, cellPositions[0]!, cellPositions[1]!),
    });
    const nextState = applyCommand(state, clearSelectedCells());
    const body = getBody(getTable(nextState.doc));

    expect(body.child(0).child(0).textContent).toBe('');
    expect(body.child(0).child(1).textContent).toBe('');
    expect(body.child(1).child(0).textContent).toBe('C');
    expect(body.child(1).child(1).textContent).toBe('D');
  });

  it('clears the current row content without deleting cells', () => {
    const table = schema.nodes.htmlTable!.create(null, [
      schema.nodes.htmlTableBody!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('A'))]),
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('B'))]),
        ]),
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('C'))]),
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('D'))]),
        ]),
      ]),
    ]);
    const state = createStateForTable(table);
    const nextState = applyCommand(state, clearRowContent());
    const body = getBody(getTable(nextState.doc));

    expect(body.child(0).childCount).toBe(2);
    expect(body.child(0).child(0).textContent).toBe('');
    expect(body.child(0).child(1).textContent).toBe('');
    expect(body.child(1).child(0).textContent).toBe('C');
    expect(body.child(1).child(1).textContent).toBe('D');
  });

  it('clears the current column content without deleting cells', () => {
    const table = schema.nodes.htmlTable!.create(null, [
      schema.nodes.htmlTableBody!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('A'))]),
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('B'))]),
        ]),
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('C'))]),
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('D'))]),
        ]),
      ]),
    ]);
    const state = createStateForTable(table);
    const nextState = applyCommand(state, clearColumnContent());
    const body = getBody(getTable(nextState.doc));

    expect(body.child(0).child(0).textContent).toBe('');
    expect(body.child(0).child(1).textContent).toBe('B');
    expect(body.child(1).child(0).textContent).toBe('');
    expect(body.child(1).child(1).textContent).toBe('D');
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
