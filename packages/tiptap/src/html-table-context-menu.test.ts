import { Schema } from 'prosemirror-model';
import { EditorState, NodeSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';

import { CellSelection, createHtmlTableNode, createHtmlTableNodeSpecs } from 'prosemirror-html-table';

import {
  getHtmlTableContextMenuState,
  getHtmlTableContextTriggerButtonState,
} from './html-table-context-menu.js';
import type { HtmlTableInteractionState } from './html-table-interaction.js';
import { createColumnSelectionTransaction, createRowSelectionTransaction } from './table-utils.js';

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

describe('html table context menu state', () => {
  it('returns an invisible menu state when no table is active', () => {
    const doc = schema.nodes.doc!.createAndFill()!;
    const state = EditorState.create({ schema, doc });

    const menu = getHtmlTableContextMenuState(state, createInteractionState());

    expect(menu.visible).toBe(false);
    expect(menu.open).toBe(false);
    expect(menu.scope).toBeNull();
    expect(menu.anchor).toBeNull();
    expect(menu.actions).toEqual([]);
    expect(menu.groups).toEqual([]);
    expect(menu.primaryAction).toBeNull();
  });

  it('aggregates table-scope menu state from table node selections', () => {
    const table = createHtmlTableNode(schema, { rows: 2, cols: 2 });
    const doc = schema.nodes.doc!.create(null, [table]);
    const state = EditorState.create({
      schema,
      doc,
      selection: NodeSelection.create(doc, 0),
    });

    const menu = getHtmlTableContextMenuState(
      state,
      createInteractionState({
        activeTable: { tablePos: 0, table },
        tableSelected: true,
        geometry: createGeometry(),
      }),
    );

    expect(menu.visible).toBe(true);
    expect(menu.open).toBe(false);
    expect(menu.scope).toBe('table');
    expect(menu.anchor).toEqual({ left: 10, top: 20 });
    expect(menu.groups.map((group) => group.id)).toEqual(['table', 'danger']);
    expect(menu.primaryAction?.id).toBe('toggleHeadSection');
  });

  it('aggregates row-scope menu state with grouped actions', () => {
    const table = createHtmlTableNode(schema, { rows: 2, cols: 2 });
    const doc = schema.nodes.doc!.create(null, [table]);
    const cellPositions = findNodePositions(doc, 'htmlTableCell');
    const state = EditorState.create({
      schema,
      doc,
      selection: CellSelection.create(doc, cellPositions[0]!),
    });
    const transaction = createRowSelectionTransaction(state, 0, table, 1)!;
    const nextState = state.apply(transaction);

    const menu = getHtmlTableContextMenuState(
      nextState,
      createInteractionState({
        activeTable: { tablePos: 0, table },
        selectedAxis: { kind: 'row', index: 1, tablePos: 0 },
        geometry: createGeometry(),
      }),
    );

    expect(menu.visible).toBe(true);
    expect(menu.open).toBe(false);
    expect(menu.scope).toBe('row');
    expect(menu.anchor).toEqual({ left: 10, top: 90 });
    expect(menu.groups.map((group) => group.id)).toEqual([
      'insert',
      'structure',
      'reorder',
      'section',
      'content',
      'danger',
    ]);
    expect(menu.primaryAction?.id).toBe('addRowAfter');
  });

  it('aggregates cell-scope menu state with a cell anchor', () => {
    const table = createHtmlTableNode(schema, { rows: 2, cols: 2 });
    const doc = schema.nodes.doc!.create(null, [table]);
    const cellPositions = findNodePositions(doc, 'htmlTableCell');
    const state = EditorState.create({
      schema,
      doc,
      selection: CellSelection.create(doc, cellPositions[0]!),
    });

    const menu = getHtmlTableContextMenuState(
      state,
      createInteractionState({
        activeTable: { tablePos: 0, table },
        geometry: createGeometry(),
      }),
    );

    expect(menu.visible).toBe(true);
    expect(menu.open).toBe(false);
    expect(menu.scope).toBe('cell');
    expect(menu.anchor).toEqual({ left: 89, top: 40 });
    expect(menu.groups.map((group) => group.id)).toEqual(['structure', 'content']);
    expect(menu.primaryAction?.id).toBe('clearSelectedCells');
  });

  it('aggregates column-scope menu state from column selections', () => {
    const table = createHtmlTableNode(schema, { rows: 2, cols: 2 });
    const doc = schema.nodes.doc!.create(null, [table]);
    const cellPositions = findNodePositions(doc, 'htmlTableCell');
    const state = EditorState.create({
      schema,
      doc,
      selection: CellSelection.create(doc, cellPositions[0]!),
    });
    const transaction = createColumnSelectionTransaction(state, 0, table, 1)!;
    const nextState = state.apply(transaction);

    const menu = getHtmlTableContextMenuState(
      nextState,
      createInteractionState({
        activeTable: { tablePos: 0, table },
        selectedAxis: { kind: 'column', index: 1, tablePos: 0 },
        geometry: createGeometry(),
      }),
    );

    expect(menu.visible).toBe(true);
    expect(menu.open).toBe(false);
    expect(menu.scope).toBe('column');
    expect(menu.anchor).toEqual({ left: 150, top: 20 });
    expect(menu.primaryAction?.id).toBe('addColumnAfter');
  });

  it('derives a visible trigger button state for table and row scopes', () => {
    const table = createHtmlTableNode(schema, { rows: 2, cols: 2 });
    const doc = schema.nodes.doc!.create(null, [table]);
    const tableState = EditorState.create({
      schema,
      doc,
      selection: NodeSelection.create(doc, 0),
    });

    const tableTrigger = getHtmlTableContextTriggerButtonState(
      tableState,
      createInteractionState({
        activeTable: { tablePos: 0, table },
        tableSelected: true,
        geometry: createGeometry(),
        contextTrigger: {
          visible: true,
          left: 10,
          top: 20,
        },
      }),
    );

    expect(tableTrigger.visible).toBe(true);
    expect(tableTrigger.expanded).toBe(false);
    expect(tableTrigger.label).toBe('Table actions');
    expect(tableTrigger.title).toBe('Table actions: Toggle header section');
    expect(tableTrigger.anchor).toEqual({ left: 10, top: 20 });

    const cellPositions = findNodePositions(doc, 'htmlTableCell');
    const baseState = EditorState.create({
      schema,
      doc,
      selection: CellSelection.create(doc, cellPositions[0]!),
    });
    const rowState = baseState.apply(createRowSelectionTransaction(baseState, 0, table, 1)!);
    const rowTrigger = getHtmlTableContextTriggerButtonState(
      rowState,
      createInteractionState({
        activeTable: { tablePos: 0, table },
        selectedAxis: { kind: 'row', index: 1, tablePos: 0 },
        geometry: createGeometry(),
        contextTrigger: {
          visible: true,
          left: 10,
          top: 90,
        },
      }),
    );

    expect(rowTrigger.visible).toBe(true);
    expect(rowTrigger.expanded).toBe(false);
    expect(rowTrigger.label).toBe('Row actions');
    expect(rowTrigger.title).toBe('Row actions: Add row after');
    expect(rowTrigger.anchor).toEqual({ left: 10, top: 90 });
  });

  it('keeps trigger button hidden for cell scope even when a menu exists', () => {
    const table = createHtmlTableNode(schema, { rows: 2, cols: 2 });
    const doc = schema.nodes.doc!.create(null, [table]);
    const cellPositions = findNodePositions(doc, 'htmlTableCell');
    const state = EditorState.create({
      schema,
      doc,
      selection: CellSelection.create(doc, cellPositions[0]!),
    });

    const trigger = getHtmlTableContextTriggerButtonState(
      state,
      createInteractionState({
        activeTable: { tablePos: 0, table },
        geometry: createGeometry(),
      }),
    );

    expect(trigger.visible).toBe(false);
    expect(trigger.expanded).toBe(false);
    expect(trigger.label).toBe('Cell actions');
    expect(trigger.primaryAction?.id).toBe('clearSelectedCells');
  });

  it('marks menu and trigger button as expanded when the context menu is open', () => {
    const table = createHtmlTableNode(schema, { rows: 2, cols: 2 });
    const doc = schema.nodes.doc!.create(null, [table]);
    const state = EditorState.create({
      schema,
      doc,
      selection: NodeSelection.create(doc, 0),
    });

    const interaction = createInteractionState({
      activeTable: { tablePos: 0, table },
      tableSelected: true,
      contextMenuOpen: true,
      geometry: createGeometry(),
      contextTrigger: {
        visible: true,
        left: 10,
        top: 20,
      },
    });

    const menu = getHtmlTableContextMenuState(state, interaction);
    const trigger = getHtmlTableContextTriggerButtonState(state, interaction);

    expect(menu.visible).toBe(true);
    expect(menu.open).toBe(true);
    expect(trigger.visible).toBe(true);
    expect(trigger.expanded).toBe(true);
  });
});

function createInteractionState(
  overrides: Partial<HtmlTableInteractionState> = {},
): HtmlTableInteractionState {
  return {
    activeTable: null,
    tableSelected: false,
    hovered: null,
    selectedAxis: {
      kind: null,
      index: null,
      tablePos: null,
    },
    contextTrigger: {
      visible: false,
      left: null,
      top: null,
    },
    contextMenuOpen: false,
    geometry: null,
    resizing: null,
    ...overrides,
  };
}

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
