import { Schema } from 'prosemirror-model';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';

import { CellSelection, createHtmlTableNode, createHtmlTableNodeSpecs } from 'prosemirror-html-table';

import {
  createHtmlTableInteractionPlugin,
  findSelectedHtmlTable,
  getHtmlTableInteractionState,
} from './html-table-interaction.js';
import { createHtmlTableSelectionPlugin } from './table-utils.js';
import { defaultHtmlTableTiptapOptions } from './options.js';
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

describe('html table interaction plugin', () => {
  it('tracks the active table for selections inside a table', () => {
    const table = createHtmlTableNode(schema, { rows: 2, cols: 2 });
    const doc = schema.nodes.doc!.create(null, [table]);
    const cellPositions = findNodePositions(doc, 'htmlTableCell');
    const state = EditorState.create({
      schema,
      doc,
      selection: TextSelection.near(doc.resolve(cellPositions[0]! + 1)),
      plugins: [createHtmlTableInteractionPlugin()],
    });

    const interaction = getHtmlTableInteractionState(state);

    expect(interaction.activeTable?.tablePos).toBe(0);
    expect(interaction.activeTable?.table).toBe(table);
    expect(interaction.tableSelected).toBe(false);
    expect(interaction.selectedAxis.kind).toBeNull();
    expect(interaction.geometry).toBeNull();
    expect(findSelectedHtmlTable(state.selection)?.tablePos).toBe(0);
  });

  it('tracks node selections on the whole table', () => {
    const table = createHtmlTableNode(schema, { rows: 1, cols: 2 });
    const doc = schema.nodes.doc!.create(null, [table]);
    const state = EditorState.create({
      schema,
      doc,
      selection: NodeSelection.create(doc, 0),
      plugins: [createHtmlTableInteractionPlugin()],
    });

    const interaction = getHtmlTableInteractionState(state);

    expect(interaction.activeTable?.tablePos).toBe(0);
    expect(interaction.tableSelected).toBe(true);
    expect(interaction.selectedAxis.kind).toBeNull();
  });

  it('does not mark tableSelected for cell selections inside a table', () => {
    const table = createHtmlTableNode(schema, { rows: 1, cols: 1 });
    const doc = schema.nodes.doc!.create(null, [table]);
    const cellPositions = findNodePositions(doc, 'htmlTableCell');
    const state = EditorState.create({
      schema,
      doc,
      selection: TextSelection.near(doc.resolve(cellPositions[0]! + 1)),
      plugins: [createHtmlTableInteractionPlugin()],
    });

    const interaction = getHtmlTableInteractionState(state);

    expect(interaction.activeTable?.tablePos).toBe(0);
    expect(interaction.tableSelected).toBe(false);
  });

  it('keeps the table active after running the table node selection command path', () => {
    const table = createHtmlTableNode(schema, { rows: 1, cols: 2 });
    const doc = schema.nodes.doc!.create(null, [table]);
    const cellPositions = findNodePositions(doc, 'htmlTableCell');
    const state = EditorState.create({
      schema,
      doc,
      selection: TextSelection.near(doc.resolve(cellPositions[0]! + 1)),
      plugins: [createHtmlTableInteractionPlugin()],
    });

    const nextState = state.apply(state.tr.setSelection(NodeSelection.create(doc, 0)));
    const interaction = getHtmlTableInteractionState(nextState);

    expect(nextState.selection).toBeInstanceOf(NodeSelection);
    expect(interaction.activeTable?.tablePos).toBe(0);
    expect(interaction.tableSelected).toBe(true);
    expect(findSelectedHtmlTable(nextState.selection)?.tablePos).toBe(0);
    expect(interaction.selectedAxis.kind).toBeNull();
  });

  it('allows selection decorations to coexist with table node selections', () => {
    const table = createHtmlTableNode(schema, { rows: 1, cols: 1 });
    const doc = schema.nodes.doc!.create(null, [table]);
    const state = EditorState.create({
      schema,
      doc,
      selection: NodeSelection.create(doc, 0),
      plugins: [
        createHtmlTableInteractionPlugin(),
        createHtmlTableSelectionPlugin(defaultHtmlTableTiptapOptions),
      ],
    });

    const interaction = getHtmlTableInteractionState(state);

    expect(interaction.activeTable?.tablePos).toBe(0);
    expect(interaction.tableSelected).toBe(true);
    expect(interaction.selectedAxis.kind).toBeNull();
  });

  it('identifies row selections as an axis selection', () => {
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
    expect(transaction).toBeDefined();

    const nextState = state.apply(transaction!);
    const interaction = getHtmlTableInteractionState(nextState);

    expect(interaction.activeTable?.tablePos).toBe(0);
    expect(interaction.tableSelected).toBe(false);
    expect(interaction.selectedAxis.kind).toBe('row');
    expect(interaction.selectedAxis.index).toBe(1);
    expect(interaction.selectedAxis.tablePos).toBe(0);
  });

  it('identifies column selections as an axis selection', () => {
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
    expect(transaction).toBeDefined();

    const nextState = state.apply(transaction!);
    const interaction = getHtmlTableInteractionState(nextState);

    expect(interaction.activeTable?.tablePos).toBe(0);
    expect(interaction.tableSelected).toBe(false);
    expect(interaction.selectedAxis.kind).toBe('column');
    expect(interaction.selectedAxis.index).toBe(1);
    expect(interaction.selectedAxis.tablePos).toBe(0);
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
