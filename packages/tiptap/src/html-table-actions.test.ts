import { Schema } from 'prosemirror-model';
import { EditorState, NodeSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';

import { CellSelection, createHtmlTableNode, createHtmlTableNodeSpecs } from 'prosemirror-html-table';

import {
  getHtmlTableContextActionCommand,
  getHtmlTableContextActions,
} from './html-table-actions.js';
import {
  createHtmlTableInteractionPlugin,
  getHtmlTableInteractionState,
} from './html-table-interaction.js';
import {
  createColumnSelectionTransaction,
  createRowSelectionTransaction,
} from './table-utils.js';

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

describe('html table context actions', () => {
  it('derives table-scope actions for whole-table selections', () => {
    const table = createHtmlTableNode(schema, { rows: 2, cols: 2 });
    const doc = schema.nodes.doc!.create(null, [table]);
    const state = EditorState.create({
      schema,
      doc,
      selection: NodeSelection.create(doc, 0),
      plugins: [createHtmlTableInteractionPlugin()],
    });

    const actions = getHtmlTableContextActions(state, getHtmlTableInteractionState(state));

    expect(actions.map((action) => action.id)).toEqual([
      'deleteTable',
      'toggleColgroup',
      'toggleHeadSection',
      'toggleFootSection',
    ]);
    expect(actions.every((action) => action.scope === 'table')).toBe(true);
    expect(actions.find((action) => action.id === 'deleteTable')?.enabled).toBe(true);
  });

  it('derives row-scope actions for row selections', () => {
    const table = createHtmlTableNode(schema, { rows: 2, cols: 2 });
    const doc = schema.nodes.doc!.create(null, [table]);
    const cellPositions = findNodePositions(doc, 'htmlTableCell');
    const state = EditorState.create({
      schema,
      doc,
      selection: CellSelection.create(doc, cellPositions[0]!),
      plugins: [createHtmlTableInteractionPlugin()],
    });
    const transaction = createRowSelectionTransaction(state, 0, table, 1);
    const nextState = state.apply(transaction!);

    const actions = getHtmlTableContextActions(nextState, getHtmlTableInteractionState(nextState));

    expect(actions.map((action) => action.id)).toEqual([
      'addRowBefore',
      'addRowAfter',
      'deleteRow',
      'moveRowUp',
      'moveRowDown',
      'duplicateRow',
      'clearRowContent',
      'moveRowToHead',
      'moveRowToBody',
      'moveRowToFoot',
    ]);
    expect(actions.every((action) => action.scope === 'row')).toBe(true);
  });

  it('derives column-scope actions for column selections', () => {
    const table = createHtmlTableNode(schema, { rows: 2, cols: 2 });
    const doc = schema.nodes.doc!.create(null, [table]);
    const cellPositions = findNodePositions(doc, 'htmlTableCell');
    const state = EditorState.create({
      schema,
      doc,
      selection: CellSelection.create(doc, cellPositions[0]!),
      plugins: [createHtmlTableInteractionPlugin()],
    });
    const transaction = createColumnSelectionTransaction(state, 0, table, 1);
    const nextState = state.apply(transaction!);

    const actions = getHtmlTableContextActions(nextState, getHtmlTableInteractionState(nextState));

    expect(actions.map((action) => action.id)).toEqual([
      'addColumnBefore',
      'addColumnAfter',
      'deleteColumn',
      'moveColumnLeft',
      'moveColumnRight',
      'duplicateColumn',
      'clearColumnContent',
      'sortBodyRowsAsc',
      'sortBodyRowsDesc',
    ]);
    expect(actions.every((action) => action.scope === 'column')).toBe(true);
  });

  it('derives cell-scope actions for ordinary cell selections', () => {
    const table = createHtmlTableNode(schema, { rows: 2, cols: 2 });
    const doc = schema.nodes.doc!.create(null, [table]);
    const cellPositions = findNodePositions(doc, 'htmlTableCell');
    const state = EditorState.create({
      schema,
      doc,
      selection: CellSelection.create(doc, cellPositions[0]!),
      plugins: [createHtmlTableInteractionPlugin()],
    });

    const actions = getHtmlTableContextActions(state, getHtmlTableInteractionState(state));

    expect(actions.map((action) => action.id)).toEqual([
      'clearSelectedCells',
      'mergeOrSplitCells',
      'toggleHeaderCell',
    ]);
    expect(actions.every((action) => action.scope === 'cell')).toBe(true);
  });

  it('resolves executable commands from context actions', () => {
    const table = createHtmlTableNode(schema, { rows: 2, cols: 2 });
    const doc = schema.nodes.doc!.create(null, [table]);
    const state = EditorState.create({
      schema,
      doc,
      selection: NodeSelection.create(doc, 0),
      plugins: [createHtmlTableInteractionPlugin()],
    });
    const actions = getHtmlTableContextActions(state, getHtmlTableInteractionState(state));
    const toggleHead = actions.find((action) => action.id === 'toggleHeadSection');

    expect(toggleHead).toBeDefined();

    let transactionState = state;
    const applied = getHtmlTableContextActionCommand(toggleHead!)(state, (transaction) => {
      transactionState = state.apply(transaction);
    });

    expect(applied).toBe(true);
    expect(transactionState.doc.firstChild?.firstChild?.type.name).toBe('htmlTableHead');
  });
});

function findNodePositions(doc: import('prosemirror-model').Node, typeName: string): number[] {
  const positions: number[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name === typeName) {
      positions.push(pos);
    }

    return true;
  });

  return positions;
}
