import { Schema, type Node as ProseMirrorNode } from 'prosemirror-model';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
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
  duplicateColumn,
  duplicateRow,
  fixTables,
  goToNextCell,
  goToPreviousCell,
  insertHtmlTable,
  mergeCells,
  mergeOrSplit,
  moveRowDown,
  moveRowToIndex,
  moveColumnLeft,
  moveColumnToIndex,
  moveColumnRight,
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
  setCellBackgroundColor,
  setCellTextAlign,
  setCellVerticalAlign,
  splitCell,
  sortBodyRowsByColumn,
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

function getSelectedCellNode(state: EditorState): ProseMirrorNode | undefined {
  const { $from } = state.selection;

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === 'htmlTableHeaderCell' || node.type.name === 'htmlTableCell') {
      return node;
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

  it('keeps colgroup widths in sync when adding columns', () => {
    const table = schema.nodes.htmlTable!.create(null, [
      schema.nodes.htmlTableColgroup!.create(null, [
        schema.nodes.htmlTableCol!.create({ span: null, width: 120 }),
        schema.nodes.htmlTableCol!.create({ span: null, width: 240 }),
      ]),
      schema.nodes.htmlTableBody!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('A'))]),
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('B'))]),
        ]),
      ]),
    ]);
    const afterState = applyCommand(createStateForTable(table), addColumnAfter());
    const afterColgroup = getSection(getTable(afterState.doc), 'htmlTableColgroup');

    expect(afterColgroup?.childCount).toBe(3);
    expect(afterColgroup?.child(0).attrs.width).toBe(120);
    expect(afterColgroup?.child(1).attrs.width).toBe(240);
    expect(afterColgroup?.child(2).attrs.width).toBe(240);

    const beforeState = applyCommand(createStateForTable(table), addColumnBefore());
    const beforeColgroup = getSection(getTable(beforeState.doc), 'htmlTableColgroup');

    expect(beforeColgroup?.childCount).toBe(3);
    expect(beforeColgroup?.child(0).attrs.width).toBe(120);
    expect(beforeColgroup?.child(1).attrs.width).toBe(120);
    expect(beforeColgroup?.child(2).attrs.width).toBe(240);
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

  it('deletes a selected column consistently across head body and foot sections', () => {
    const table = schema.nodes.htmlTable!.create(null, [
      schema.nodes.htmlTableHead!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableHeaderCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('Task'))]),
          schema.nodes.htmlTableHeaderCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('Status'))]),
        ]),
      ]),
      schema.nodes.htmlTableBody!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('Open panel'))]),
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('Done'))]),
        ]),
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('Inspect connector'))]),
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('Pending'))]),
        ]),
      ]),
      schema.nodes.htmlTableFoot!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('Total'))]),
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('2 tasks'))]),
        ]),
      ]),
    ]);
    const baseState = createStateForTable(table);
    const selectedColumnState = applyCommand(baseState, selectColumn());
    const nextState = applyCommand(selectedColumnState, deleteColumn());
    const nextTable = getTable(nextState.doc);

    expect(getSection(nextTable, 'htmlTableHead')?.child(0).childCount).toBe(1);
    expect(getBody(nextTable).child(0).childCount).toBe(1);
    expect(getBody(nextTable).child(1).childCount).toBe(1);
    expect(getSection(nextTable, 'htmlTableFoot')?.child(0).childCount).toBe(1);
  });

  it('keeps colgroup widths in sync when deleting columns', () => {
    const table = schema.nodes.htmlTable!.create(null, [
      schema.nodes.htmlTableColgroup!.create(null, [
        schema.nodes.htmlTableCol!.create({ span: null, width: 120 }),
        schema.nodes.htmlTableCol!.create({ span: null, width: 240 }),
        schema.nodes.htmlTableCol!.create({ span: null, width: 360 }),
      ]),
      schema.nodes.htmlTableBody!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('A'))]),
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('B'))]),
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
    const nextState = applyCommand(state, deleteColumn());
    const colgroup = getSection(getTable(nextState.doc), 'htmlTableColgroup');

    expect(colgroup?.childCount).toBe(2);
    expect(colgroup?.child(0).attrs.width).toBe(120);
    expect(colgroup?.child(1).attrs.width).toBe(360);
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

  it('sets text alignment for the current cell selection', () => {
    const state = createStateWithTable(2, 2);
    const cellPositions = findNodePositions(state.doc, 'htmlTableHeaderCell');
    const selectedState = EditorState.create({
      schema,
      doc: state.doc,
      selection: CellSelection.create(state.doc, cellPositions[0]!, cellPositions[1]!),
    });
    const nextState = applyCommand(selectedState, setCellTextAlign('center'));
    const firstRow = getBody(getTable(nextState.doc)).child(0);

    expect(firstRow.child(0).attrs.textAlign).toBe('center');
    expect(firstRow.child(1).attrs.textAlign).toBe('center');
  });

  it('sets background color for the current cell', () => {
    const nextState = applyCommand(createStateWithTable(2, 2), setCellBackgroundColor('#ffeeaa'));
    const firstCell = getBody(getTable(nextState.doc)).child(0).child(0);

    expect(firstCell.attrs.backgroundColor).toBe('#ffeeaa');
  });

  it('sets vertical alignment for the current cell selection', () => {
    const state = createStateWithTable(2, 2);
    const cellPositions = findNodePositions(state.doc, 'htmlTableHeaderCell');
    const selectedState = EditorState.create({
      schema,
      doc: state.doc,
      selection: CellSelection.create(state.doc, cellPositions[0]!, cellPositions[1]!),
    });
    const nextState = applyCommand(selectedState, setCellVerticalAlign('middle'));
    const firstRow = getBody(getTable(nextState.doc)).child(0);

    expect(firstRow.child(0).attrs.verticalAlign).toBe('middle');
    expect(firstRow.child(1).attrs.verticalAlign).toBe('middle');
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

  it('does not move a row across sections when rowspan cells are involved', () => {
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

    const result = moveRowToHead()(state, () => {
      dispatched = true;
    });

    expect(result).toBe(false);
    expect(dispatched).toBe(false);
  });

  it('moves the selected row to a specific position inside another tbody section', () => {
    const table = schema.nodes.htmlTable!.create(null, [
      schema.nodes.htmlTableBody!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('A'))]),
        ]),
      ]),
      schema.nodes.htmlTableBody!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('C'))]),
        ]),
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('D'))]),
        ]),
      ]),
    ]);
    const state = createStateForTable(table);
    const nextState = applyCommand(state, moveRowToBody({ targetSectionIndex: 1, targetRowIndex: 1 }));
    const nextTable = getTable(nextState.doc);
    const body = getBody(nextTable);

    expect(body.childCount).toBe(3);
    expect(body.child(0).textContent).toBe('C');
    expect(body.child(1).textContent).toBe('A');
    expect(body.child(2).textContent).toBe('D');
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

  it('inserts a new row at a specific position inside a targeted tbody section', () => {
    const table = schema.nodes.htmlTable!.create(null, [
      schema.nodes.htmlTableBody!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('A'))]),
        ]),
      ]),
      schema.nodes.htmlTableBody!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('B'))]),
        ]),
      ]),
    ]);
    const nextState = applyCommand(createStateForTable(table), addRowToBody({ targetSectionIndex: 1, targetRowIndex: 0 }));
    const nextTable = getTable(nextState.doc);
    const secondBody = nextTable.child(1);

    expect(secondBody.childCount).toBe(2);
    expect(secondBody.child(0).textContent).toBe('');
    expect(secondBody.child(1).textContent).toBe('B');
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

  it('does not reorder rows when rowspan cells are involved', () => {
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

    const result = moveRowDown()(state, () => {
      dispatched = true;
    });

    expect(result).toBe(false);
    expect(dispatched).toBe(false);
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

  it('duplicates the current column and preserves colgroup widths', () => {
    const table = schema.nodes.htmlTable!.create(null, [
      schema.nodes.htmlTableColgroup!.create(null, [
        schema.nodes.htmlTableCol!.create({ span: null, width: 120 }),
        schema.nodes.htmlTableCol!.create({ span: null, width: 240 }),
      ]),
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
    const nextState = applyCommand(state, duplicateColumn());
    const nextTable = getTable(nextState.doc);
    const body = getBody(nextTable);
    const colgroup = getSection(nextTable, 'htmlTableColgroup');

    expect(body.child(0).childCount).toBe(3);
    expect(body.child(0).child(0).textContent).toBe('A');
    expect(body.child(0).child(1).textContent).toBe('A');
    expect(body.child(0).child(2).textContent).toBe('B');
    expect(body.child(1).child(0).textContent).toBe('C');
    expect(body.child(1).child(1).textContent).toBe('C');
    expect(body.child(1).child(2).textContent).toBe('D');
    expect(colgroup?.childCount).toBe(3);
    expect(colgroup?.child(0).attrs.width).toBe(120);
    expect(colgroup?.child(1).attrs.width).toBe(120);
    expect(colgroup?.child(2).attrs.width).toBe(240);
  });

  it('does not duplicate a column that is covered by merged cells', () => {
    const table = schema.nodes.htmlTable!.create(null, [
      schema.nodes.htmlTableBody!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create({ colspan: 2 }, [schema.nodes.paragraph!.create(null, schema.text('A'))]),
        ]),
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('B'))]),
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('C'))]),
        ]),
      ]),
    ]);
    const state = createStateForTable(table);
    let dispatched = false;

    const result = duplicateColumn()(state, () => {
      dispatched = true;
    });

    expect(result).toBe(false);
    expect(dispatched).toBe(false);
  });

  it('sorts tbody rows by the selected column in ascending order', () => {
    const table = schema.nodes.htmlTable!.create(null, [
      schema.nodes.htmlTableHead!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableHeaderCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('Name'))]),
          schema.nodes.htmlTableHeaderCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('Score'))]),
        ]),
      ]),
      schema.nodes.htmlTableBody!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('c'))]),
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('30'))]),
        ]),
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('a'))]),
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('10'))]),
        ]),
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('b'))]),
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('20'))]),
        ]),
      ]),
    ]);
    const state = createStateForTable(table);
    const nextState = applyCommand(state, sortBodyRowsByColumn());
    const body = getBody(getTable(nextState.doc));

    expect(body.child(0).textContent).toBe('a10');
    expect(body.child(1).textContent).toBe('b20');
    expect(body.child(2).textContent).toBe('c30');
  });

  it('keeps selection inside the same logical tbody row after sorting', () => {
    const table = schema.nodes.htmlTable!.create(null, [
      schema.nodes.htmlTableHead!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableHeaderCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('Name'))]),
          schema.nodes.htmlTableHeaderCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('Score'))]),
        ]),
      ]),
      schema.nodes.htmlTableBody!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('c'))]),
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('30'))]),
        ]),
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('a'))]),
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('10'))]),
        ]),
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('b'))]),
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('20'))]),
        ]),
      ]),
    ]);
    const doc = schema.nodes.doc!.create(null, [table]);
    const bodyCellPositions = findNodePositions(doc, 'htmlTableCell');
    const state = EditorState.create({
      schema,
      doc,
      selection: CellSelection.create(doc, bodyCellPositions[0]!),
    });
    const nextState = applyCommand(state, sortBodyRowsByColumn());
    const body = getBody(getTable(nextState.doc));

    expect(body.child(0).textContent).toBe('a10');
    expect(body.child(1).textContent).toBe('b20');
    expect(body.child(2).textContent).toBe('c30');
    expect(getSelectedCellType(nextState)).toBe('htmlTableCell');
    expect(getSelectedCellNode(nextState)?.textContent).toBe('c');
  });

  it('sorts only the active tbody section when the selection is inside it', () => {
    const table = schema.nodes.htmlTable!.create(null, [
      schema.nodes.htmlTableBody!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('a'))]),
        ]),
      ]),
      schema.nodes.htmlTableBody!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('c'))]),
        ]),
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('b'))]),
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
    const nextState = applyCommand(state, sortBodyRowsByColumn());
    const nextTable = getTable(nextState.doc);
    const firstBody = nextTable.child(0);
    const secondBody = nextTable.child(1);

    expect(firstBody.child(0).textContent).toBe('a');
    expect(secondBody.child(0).textContent).toBe('b');
    expect(secondBody.child(1).textContent).toBe('c');
  });

  it('sorts tbody rows by the selected column in descending order', () => {
    const table = schema.nodes.htmlTable!.create(null, [
      schema.nodes.htmlTableBody!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('a'))]),
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('10'))]),
        ]),
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('c'))]),
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('30'))]),
        ]),
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('b'))]),
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('20'))]),
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
    const nextState = applyCommand(state, sortBodyRowsByColumn({ direction: 'desc' }));
    const body = getBody(getTable(nextState.doc));

    expect(body.child(0).textContent).toBe('c30');
    expect(body.child(1).textContent).toBe('b20');
    expect(body.child(2).textContent).toBe('a10');
  });

  it('moves the current column left and preserves colgroup widths', () => {
    const table = schema.nodes.htmlTable!.create(null, [
      schema.nodes.htmlTableColgroup!.create(null, [
        schema.nodes.htmlTableCol!.create({ span: null, width: 120 }),
        schema.nodes.htmlTableCol!.create({ span: null, width: 240 }),
        schema.nodes.htmlTableCol!.create({ span: null, width: 360 }),
      ]),
      schema.nodes.htmlTableBody!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('A'))]),
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('B'))]),
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('C'))]),
        ]),
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('D'))]),
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('E'))]),
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('F'))]),
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
    const nextState = applyCommand(state, moveColumnLeft());
    const nextTable = getTable(nextState.doc);
    const body = getBody(nextTable);
    const colgroup = getSection(nextTable, 'htmlTableColgroup');

    expect(body.child(0).textContent).toBe('BAC');
    expect(body.child(1).textContent).toBe('EDF');
    expect(colgroup?.child(0).attrs.width).toBe(240);
    expect(colgroup?.child(1).attrs.width).toBe(120);
    expect(colgroup?.child(2).attrs.width).toBe(360);
  });

  it('moves the current column right', () => {
    const table = schema.nodes.htmlTable!.create(null, [
      schema.nodes.htmlTableBody!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('A'))]),
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('B'))]),
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('C'))]),
        ]),
      ]),
    ]);
    const state = createStateForTable(table);
    const nextState = applyCommand(state, moveColumnRight());
    const body = getBody(getTable(nextState.doc));

    expect(body.child(0).textContent).toBe('BAC');
  });

  it('keeps selection inside the moved column after reordering across sections', () => {
    const table = schema.nodes.htmlTable!.create(null, [
      schema.nodes.htmlTableHead!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableHeaderCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('H1'))]),
          schema.nodes.htmlTableHeaderCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('H2'))]),
          schema.nodes.htmlTableHeaderCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('H3'))]),
        ]),
      ]),
      schema.nodes.htmlTableBody!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('A1'))]),
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('A2'))]),
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('A3'))]),
        ]),
      ]),
      schema.nodes.htmlTableFoot!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('F1'))]),
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('F2'))]),
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('F3'))]),
        ]),
      ]),
    ]);
    const doc = schema.nodes.doc!.create(null, [table]);
    const headerPositions = findNodePositions(doc, 'htmlTableHeaderCell');
    const state = EditorState.create({
      schema,
      doc,
      selection: CellSelection.create(doc, headerPositions[1]!),
    });
    const nextState = applyCommand(state, moveColumnRight());
    const nextTable = getTable(nextState.doc);

    expect(getSection(nextTable, 'htmlTableHead')?.child(0).textContent).toBe('H1H3H2');
    expect(getBody(nextTable).child(0).textContent).toBe('A1A3A2');
    expect(getSection(nextTable, 'htmlTableFoot')?.child(0).textContent).toBe('F1F3F2');
    expect(getSelectedCellType(nextState)).toBe('htmlTableHeaderCell');
    expect(getSelectedCellNode(nextState)?.textContent).toBe('H2');
  });

  it('does not move a column when merged cells are present', () => {
    const table = schema.nodes.htmlTable!.create(null, [
      schema.nodes.htmlTableBody!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create({ colspan: 2 }, [schema.nodes.paragraph!.create(null, schema.text('A'))]),
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('B'))]),
        ]),
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('C'))]),
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('D'))]),
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('E'))]),
        ]),
      ]),
    ]);
    const state = createStateForTable(table);
    let dispatched = false;

    const result = moveColumnRight()(state, () => {
      dispatched = true;
    });

    expect(result).toBe(false);
    expect(dispatched).toBe(false);
  });

  it('does not sort tbody rows when merged cells are present', () => {
    const table = schema.nodes.htmlTable!.create(null, [
      schema.nodes.htmlTableBody!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create({ colspan: 2 }, [schema.nodes.paragraph!.create(null, schema.text('A'))]),
        ]),
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('B'))]),
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('C'))]),
        ]),
      ]),
    ]);
    const state = createStateForTable(table);
    let dispatched = false;

    const result = sortBodyRowsByColumn()(state, () => {
      dispatched = true;
    });

    expect(result).toBe(false);
    expect(dispatched).toBe(false);
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

  it('keeps the selection inside the toggled cell after toggling a header cell', () => {
    const nextState = applyCommand(createStateWithTable(2, 2), toggleHeaderCell());

    expect(getSelectedCellType(nextState)).toBe('htmlTableCell');
    expect(getSelectedCellNode(nextState)?.textContent).toBe('');
  });

  it('does not toggle a header cell when multiple logical cells are selected', () => {
    const state = createStateWithTable(2, 2);
    const cellPositions = findNodePositions(state.doc, 'htmlTableHeaderCell');
    const selectedState = EditorState.create({
      schema,
      doc: state.doc,
      selection: CellSelection.create(state.doc, cellPositions[0]!, cellPositions[1]!),
    });

    expect(toggleHeaderCell()(selectedState)).toBe(false);
  });

  it('toggles the selected row between header and body cell types', () => {
    const nextState = applyCommand(createStateWithTable(2, 2), toggleHeaderRow());
    const firstRow = getBody(getTable(nextState.doc)).child(0);

    expect(firstRow.child(0).type.name).toBe('htmlTableCell');
    expect(firstRow.child(1).type.name).toBe('htmlTableCell');
  });

  it('keeps the selection inside the toggled row after toggling a header row', () => {
    const nextState = applyCommand(createStateWithTable(2, 2), toggleHeaderRow());

    expect(getSelectedCellType(nextState)).toBe('htmlTableCell');
    expect(getSelectedCellNode(nextState)?.textContent).toBe('');
  });

  it('toggles the selected column between header and body cell types', () => {
    const nextState = applyCommand(createStateWithTable(2, 2), toggleHeaderColumn());
    const body = getBody(getTable(nextState.doc));

    expect(body.child(0).child(0).type.name).toBe('htmlTableHeaderCell');
    expect(body.child(1).child(0).type.name).toBe('htmlTableHeaderCell');
    expect(body.child(1).child(1).type.name).toBe('htmlTableCell');
  });

  it('keeps the selection inside a valid cell after toggling a column header state', () => {
    const state = createStateWithTable(2, 2);
    const nextState = applyCommand(state, toggleHeaderColumn());

    expect(getSelectedCellType(nextState)).toBe('htmlTableHeaderCell');
    expect(getSelectedCellNode(nextState)?.textContent).toBe('');
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

  it('keeps cell selections hidden from native DOM painting', () => {
    const nextState = applyCommand(createStateWithTable(2, 2), selectColumn());

    expect(nextState.selection).toBeInstanceOf(CellSelection);
    expect(nextState.selection.visible).toBe(false);
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
    const splitCellPos = findNodePositions(nextState.doc, 'htmlTableHeaderCell')[0]!;
    const firstCellNodeSize = firstRow.child(0).nodeSize;

    expect(firstRow.childCount).toBe(2);
    expect(firstRow.child(0).attrs.colspan).toBe(1);
    expect(nextState.selection).toBeInstanceOf(TextSelection);
    expect(nextState.selection.from).toBeGreaterThan(splitCellPos);
    expect(nextState.selection.from).toBeLessThan(splitCellPos + firstCellNodeSize);
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
    const splitCellPos = findNodePositions(splitState.doc, 'htmlTableHeaderCell')[0]!;
    const firstCellNodeSize = getBody(getTable(splitState.doc)).child(0).child(0).nodeSize;
    expect(getBody(getTable(splitState.doc)).child(0).child(0).attrs.colspan).toBe(1);
    expect(splitState.selection).toBeInstanceOf(TextSelection);
    expect(splitState.selection.from).toBeGreaterThan(splitCellPos);
    expect(splitState.selection.from).toBeLessThan(splitCellPos + firstCellNodeSize);
  });

  it('splits a rowspan and colspan cell back into a valid rectangular grid', () => {
    const table = schema.nodes.htmlTable!.create(null, [
      schema.nodes.htmlTableBody!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create({ colspan: 2, rowspan: 2 }, [
            schema.nodes.paragraph!.create(null, schema.text('A')),
          ]),
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('B'))]),
        ]),
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('C'))]),
        ]),
      ]),
    ]);
    const state = createStateForTable(table);
    const nextState = applyCommand(state, splitCell());
    const body = getBody(getTable(nextState.doc));

    expect(body.child(0).childCount).toBe(3);
    expect(body.child(1).childCount).toBe(3);
    expect(body.child(0).child(0).attrs.colspan).toBe(1);
    expect(body.child(0).child(0).attrs.rowspan).toBe(1);
    expect(getSelectedCellNode(nextState)?.textContent).toBe('A');
  });

  it('keeps selection inside the duplicated column across head body and foot sections', () => {
    const table = schema.nodes.htmlTable!.create(null, [
      schema.nodes.htmlTableHead!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableHeaderCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('H1'))]),
          schema.nodes.htmlTableHeaderCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('H2'))]),
        ]),
      ]),
      schema.nodes.htmlTableBody!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('A1'))]),
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('A2'))]),
        ]),
      ]),
      schema.nodes.htmlTableFoot!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('F1'))]),
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('F2'))]),
        ]),
      ]),
    ]);
    const state = createStateForTable(table);
    const nextState = applyCommand(state, duplicateColumn());
    const nextTable = getTable(nextState.doc);

    expect(getSection(nextTable, 'htmlTableHead')?.child(0).childCount).toBe(3);
    expect(getBody(nextTable).child(0).childCount).toBe(3);
    expect(getSection(nextTable, 'htmlTableFoot')?.child(0).childCount).toBe(3);
    expect(getSelectedCellNode(nextState)?.textContent).toBe('H1');
  });

  it('keeps selection inside a valid remaining cell after deleting a column across sections', () => {
    const table = schema.nodes.htmlTable!.create(null, [
      schema.nodes.htmlTableHead!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableHeaderCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('H1'))]),
          schema.nodes.htmlTableHeaderCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('H2'))]),
          schema.nodes.htmlTableHeaderCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('H3'))]),
        ]),
      ]),
      schema.nodes.htmlTableBody!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('A1'))]),
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('A2'))]),
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('A3'))]),
        ]),
      ]),
      schema.nodes.htmlTableFoot!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('F1'))]),
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('F2'))]),
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('F3'))]),
        ]),
      ]),
    ]);
    const doc = schema.nodes.doc!.create(null, [table]);
    const headerPositions = findNodePositions(doc, 'htmlTableHeaderCell');
    const state = EditorState.create({
      schema,
      doc,
      selection: CellSelection.create(doc, headerPositions[1]!),
    });
    const nextState = applyCommand(state, deleteColumn());
    const nextTable = getTable(nextState.doc);

    expect(getSection(nextTable, 'htmlTableHead')?.child(0).childCount).toBe(2);
    expect(getBody(nextTable).child(0).childCount).toBe(2);
    expect(getSection(nextTable, 'htmlTableFoot')?.child(0).childCount).toBe(2);
    expect(getSelectedCellType(nextState)).toBe('htmlTableHeaderCell');
    expect(getSelectedCellNode(nextState)?.textContent).toBe('H3');
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

  it('moves a row to an earlier index within the same section in one command', () => {
    const table = schema.nodes.htmlTable!.create(null, [
      schema.nodes.htmlTableBody!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('A'))])]),
        schema.nodes.htmlTableRow!.create(null, [schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('B'))])]),
        schema.nodes.htmlTableRow!.create(null, [schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('C'))])]),
      ]),
    ]);
    const doc = schema.nodes.doc!.create(null, [table]);
    const cellPositions = findNodePositions(doc, 'htmlTableCell');
    const state = EditorState.create({
      schema,
      doc,
      selection: CellSelection.create(doc, cellPositions[2]!),
    });

    const nextState = applyCommand(state, moveRowToIndex({ fromRowIndex: 2, toRowIndex: 0 }));
    const body = getBody(getTable(nextState.doc));

    expect(body.child(0).textContent).toBe('C');
    expect(body.child(1).textContent).toBe('A');
    expect(body.child(2).textContent).toBe('B');
    expect(getSelectedCellNode(nextState)?.textContent).toBe('C');
  });

  it('moves a row across sections when allowCrossSectionMove is enabled', () => {
    const table = schema.nodes.htmlTable!.create(null, [
      schema.nodes.htmlTableHead!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [schema.nodes.htmlTableHeaderCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('H'))])]),
      ]),
      schema.nodes.htmlTableBody!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('A'))])]),
        schema.nodes.htmlTableRow!.create(null, [schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('B'))])]),
      ]),
    ]);
    const doc = schema.nodes.doc!.create(null, [table]);
    const bodyCellPositions = findNodePositions(doc, 'htmlTableCell');
    const state = EditorState.create({
      schema,
      doc,
      selection: CellSelection.create(doc, bodyCellPositions[1]!),
    });

    const nextState = applyCommand(
      state,
      moveRowToIndex({ fromRowIndex: 2, toRowIndex: 0, allowCrossSectionMove: true }),
    );
    const nextTable = getTable(nextState.doc);

    expect(getSection(nextTable, 'htmlTableHead')?.child(0).textContent).toBe('B');
    expect(getSection(nextTable, 'htmlTableHead')?.child(0).child(0).type.name).toBe('htmlTableHeaderCell');
    expect(getSection(nextTable, 'htmlTableHead')?.child(1).textContent).toBe('H');
    expect(getBody(nextTable).child(0).textContent).toBe('A');
  });

  it('does not move a row across sections by default', () => {
    const table = schema.nodes.htmlTable!.create(null, [
      schema.nodes.htmlTableHead!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [schema.nodes.htmlTableHeaderCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('H'))])]),
      ]),
      schema.nodes.htmlTableBody!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('A'))])]),
      ]),
    ]);
    const state = createStateForTable(table);

    expect(moveRowToIndex({ fromRowIndex: 1, toRowIndex: 0 })(state)).toBe(false);
  });

  it('moves a column to a later index and keeps colgroup widths aligned', () => {
    const table = schema.nodes.htmlTable!.create(null, [
      schema.nodes.htmlTableColgroup!.create(null, [
        schema.nodes.htmlTableCol!.create({ span: null, width: 120 }),
        schema.nodes.htmlTableCol!.create({ span: null, width: 240 }),
        schema.nodes.htmlTableCol!.create({ span: null, width: 360 }),
      ]),
      schema.nodes.htmlTableBody!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('A'))]),
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('B'))]),
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('C'))]),
        ]),
      ]),
    ]);
    const doc = schema.nodes.doc!.create(null, [table]);
    const cellPositions = findNodePositions(doc, 'htmlTableCell');
    const state = EditorState.create({
      schema,
      doc,
      selection: CellSelection.create(doc, cellPositions[0]!),
    });

    const nextState = applyCommand(state, moveColumnToIndex({ fromColumnIndex: 0, toColumnIndex: 2 }));
    const nextTable = getTable(nextState.doc);
    const body = getBody(nextTable);
    const colgroup = getSection(nextTable, 'htmlTableColgroup');

    expect(body.child(0).textContent).toBe('BCA');
    expect(colgroup?.child(0).attrs.width).toBe(240);
    expect(colgroup?.child(1).attrs.width).toBe(360);
    expect(colgroup?.child(2).attrs.width).toBe(120);
  });

  it('does not move a column to an arbitrary index when merged cells are involved', () => {
    const table = schema.nodes.htmlTable!.create(null, [
      schema.nodes.htmlTableBody!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create({ colspan: 2 }, [schema.nodes.paragraph!.create(null, schema.text('A'))]),
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('B'))]),
        ]),
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('C'))]),
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('D'))]),
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('E'))]),
        ]),
      ]),
    ]);
    const state = createStateForTable(table);

    expect(moveColumnToIndex({ fromColumnIndex: 0, toColumnIndex: 2 })(state)).toBe(false);
  });
});
