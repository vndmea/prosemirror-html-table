import { Schema, type Node as ProseMirrorNode } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';

import {
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  createHtmlTableNode,
  createHtmlTableNodeSpecs,
  deleteColumn,
  deleteRow,
  deleteTable,
  insertHtmlTable,
  setCellAttribute,
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
  const paragraphPos = findFirstNodePos(doc, 'paragraph');

  return EditorState.create({
    schema,
    doc,
    selection: TextSelection.near(doc.resolve(paragraphPos + 1)),
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

function findFirstNodePos(doc: ProseMirrorNode, typeName: string): number {
  let found: number | undefined;

  doc.descendants((node, pos) => {
    if (node.type.name === typeName) {
      found = pos;
      return false;
    }

    return true;
  });

  if (found === undefined) {
    throw new Error(`Unable to find node: ${typeName}`);
  }

  return found;
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
    const state = EditorState.create({
      schema,
      doc,
      selection: TextSelection.near(doc.resolve(findFirstNodePos(doc, 'paragraph') + 1)),
    });

    const nextState = applyCommand(state, deleteTable());

    expect(nextState.doc.firstChild?.type.name).toBe('paragraph');
  });

  it('sets an attribute on the selected cell', () => {
    const nextState = applyCommand(createStateWithTable(2, 2), setCellAttribute('colspan', 2));
    const firstCell = getBody(getTable(nextState.doc)).child(0).child(0);

    expect(firstCell.attrs.colspan).toBe(2);
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
});
