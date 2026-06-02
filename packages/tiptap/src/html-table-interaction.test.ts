import { Schema } from 'prosemirror-model';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';

import { CellSelection, createHtmlTableNode, createHtmlTableNodeSpecs } from 'prosemirror-html-table';

import {
  createHtmlTableInteractionPlugin,
  findSelectedHtmlTable,
  getHtmlTableContextTriggerState,
  getHtmlTableInteractionState,
  htmlTableInteractionPluginKey,
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
    expect(interaction.contextTrigger.visible).toBe(false);
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
    expect(interaction.contextTrigger.visible).toBe(false);
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
    expect(interaction.contextTrigger.visible).toBe(false);
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
    expect(interaction.contextTrigger.visible).toBe(false);
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
    expect(interaction.contextTrigger.visible).toBe(false);
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
    expect(interaction.contextTrigger.visible).toBe(false);
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
    expect(interaction.contextTrigger.visible).toBe(false);
  });

  it('derives context trigger anchors for table, row, and column scopes when geometry exists', () => {
    const tableReference = {
      tablePos: 0,
      table: createHtmlTableNode(schema, { rows: 2, cols: 2 }),
    };
    const geometry = createGeometry();

    expect(
      getHtmlTableContextTriggerState(
        tableReference,
        true,
        { kind: null, index: null, tablePos: null },
        geometry,
      ),
    ).toEqual({
      visible: true,
      left: 10,
      top: 20,
    });

    expect(
      getHtmlTableContextTriggerState(
        tableReference,
        false,
        { kind: 'row', index: 1, tablePos: 0 },
        geometry,
      ),
    ).toEqual({
      visible: true,
      left: 10,
      top: 90,
    });

    expect(
      getHtmlTableContextTriggerState(
        tableReference,
        false,
        { kind: 'column', index: 1, tablePos: 0 },
        geometry,
      ),
    ).toEqual({
      visible: true,
      left: 150,
      top: 20,
    });
  });

  it('clamps context trigger anchors to the visible wrapper bounds when the table is scrolled', () => {
    const tableReference = {
      tablePos: 0,
      table: createHtmlTableNode(schema, { rows: 2, cols: 3 }),
    };
    const geometry = {
      ...createGeometry(),
      tableRect: {
        left: -110,
        top: 20,
        right: 250,
        bottom: 120,
        width: 360,
        height: 100,
      },
      wrapperRect: {
        left: 10,
        top: 20,
        right: 210,
        bottom: 120,
        width: 200,
        height: 100,
      },
      visibleTableRect: {
        left: 10,
        top: 20,
        right: 210,
        bottom: 120,
        width: 200,
        height: 100,
      },
      scrollLeft: 120,
    };

    expect(
      getHtmlTableContextTriggerState(
        tableReference,
        true,
        { kind: null, index: null, tablePos: null },
        geometry,
      ),
    ).toEqual({
      visible: true,
      left: 10,
      top: 20,
    });

    expect(
      getHtmlTableContextTriggerState(
        tableReference,
        false,
        { kind: 'row', index: 1, tablePos: 0 },
        geometry,
      ),
    ).toEqual({
      visible: true,
      left: 10,
      top: 90,
    });
  });

  it('opens the context menu only while the trigger is visible and closes it on selection changes', () => {
    const table = createHtmlTableNode(schema, { rows: 2, cols: 2 });
    const doc = schema.nodes.doc!.create(null, [table]);
    const cellPositions = findNodePositions(doc, 'htmlTableCell');
    const baseState = EditorState.create({
      schema,
      doc,
      selection: CellSelection.create(doc, cellPositions[0]!),
      plugins: [createHtmlTableInteractionPlugin()],
    });
    const rowState = baseState.apply(
      createRowSelectionTransaction(baseState, 0, table, 1)!.setMeta(htmlTableInteractionPluginKey, {
        selectedAxis: {
          kind: 'row',
          index: 1,
          tablePos: 0,
        },
        selectedAxisExplicit: true,
      }),
    );
    const geometryState = rowState.apply(
      rowState.tr.setMeta(htmlTableInteractionPluginKey, {
        geometry: createGeometry(),
      }),
    );
    const openState = geometryState.apply(
      geometryState.tr.setMeta(htmlTableInteractionPluginKey, {
        contextMenuOpen: true,
      }),
    );

    expect(getHtmlTableInteractionState(openState).contextTrigger.visible).toBe(true);
    expect(getHtmlTableInteractionState(openState).contextMenuOpen).toBe(true);

    const nextCellState = openState.apply(
      openState.tr.setSelection(TextSelection.near(openState.doc.resolve(cellPositions[1]! + 1))),
    );

    expect(getHtmlTableInteractionState(nextCellState).contextMenuOpen).toBe(false);

    const hiddenOpenState = baseState.apply(
      baseState.tr.setMeta(htmlTableInteractionPluginKey, {
        contextMenuOpen: true,
      }),
    );

    expect(getHtmlTableInteractionState(hiddenOpenState).contextTrigger.visible).toBe(false);
    expect(getHtmlTableInteractionState(hiddenOpenState).contextMenuOpen).toBe(true);
  });

  it('keeps the context trigger visible for column handles that store axis state via plugin meta', () => {
    const table = createHtmlTableNode(schema, { rows: 2, cols: 2 });
    const doc = schema.nodes.doc!.create(null, [table]);
    const cellPositions = findNodePositions(doc, 'htmlTableCell');
    const baseState = EditorState.create({
      schema,
      doc,
      selection: TextSelection.near(doc.resolve(cellPositions[0]! + 1)),
      plugins: [createHtmlTableInteractionPlugin()],
    });

    const columnState = baseState.apply(
      baseState.tr.setMeta(htmlTableInteractionPluginKey, {
        selectedAxis: {
          kind: 'column',
          index: 1,
          tablePos: 0,
        },
        geometry: createGeometry(),
      }),
    );
    const openState = columnState.apply(
      columnState.tr.setMeta(htmlTableInteractionPluginKey, {
        contextMenuOpen: true,
      }),
    );

    expect(getHtmlTableInteractionState(openState).selectedAxis.kind).toBe('column');
    expect(getHtmlTableInteractionState(openState).contextTrigger.visible).toBe(true);
    expect(getHtmlTableInteractionState(openState).contextMenuOpen).toBe(true);
  });
});

function createGeometry() {
  return {
    tableRect: {
      left: 10,
      top: 20,
      right: 210,
      bottom: 120,
      width: 200,
      height: 100,
    },
    wrapperRect: {
      left: 10,
      top: 20,
      right: 210,
      bottom: 120,
      width: 200,
      height: 100,
    },
    visibleTableRect: {
      left: 10,
      top: 20,
      right: 210,
      bottom: 120,
      width: 200,
      height: 100,
    },
    scrollLeft: 0,
    scrollTop: 0,
    columns: [
      { index: 0, left: 0, width: 80 },
      { index: 1, left: 80, width: 120 },
    ],
    rows: [
      { index: 0, top: 0, height: 40 },
      { index: 1, top: 40, height: 60 },
    ],
  };
}

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
