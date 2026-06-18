import { Schema } from 'prosemirror-model';
import { EditorState, NodeSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';

import { CellSelection, createHtmlTableNode, createHtmlTableNodeSpecs } from 'prosemirror-html-table';

import {
  findHtmlTableContextMenuAction,
  getHtmlTableContextMenuState,
  getHtmlTableContextTriggerButtonState,
  runHtmlTableContextMenuAction,
} from './html-table-context-menu.js';
import { htmlTableInteractionPluginKey } from './html-table-interaction.js';
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
    expect(menu.actions.map((action) => action.id)).toContain('toggleCaption');
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
        selectedAxisExplicit: true,
        geometry: createGeometry(),
      }),
    );

    expect(menu.visible).toBe(true);
    expect(menu.open).toBe(false);
    expect(menu.scope).toBe('row');
    expect(menu.anchor).toEqual({ left: 10, top: 90 });
    expect(menu.groups.map((group) => group.id)).toEqual([
      'insert',
      'format',
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
    expect(menu.groups.map((group) => group.id)).toEqual(['format', 'structure', 'content']);
    expect(menu.primaryAction?.id).toBe('clearSelectedCells');
  });

  it('appends custom cell actions from the table option resolver', () => {
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
      {
        contextActionResolver: ({ scope }) => (
          scope === 'cell'
            ? [{
              id: 'copySelection',
              label: 'Copy selection',
              scope,
              enabled: true,
              group: 'external',
              shortcut: 'Mod+C',
              run: () => true,
            }]
            : []
        ),
      },
    );

    expect(menu.actions.map((action) => action.id)).toContain('copySelection');
    expect(menu.groups.map((group) => group.id)).toEqual(['format', 'structure', 'content', 'external']);
    expect(findHtmlTableContextMenuAction(menu, 'copySelection')?.label).toBe('Copy selection');
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
        selectedAxisExplicit: true,
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
    expect(tableTrigger.title).toBe('Table actions: Add header section');
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
        selectedAxisExplicit: true,
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

  it('finds and runs menu actions through the aggregated menu state', () => {
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
    const toggleHead = findHtmlTableContextMenuAction(menu, 'toggleHeadSection');

    expect(toggleHead?.enabled).toBe(true);

    let nextState = state;
    const applied = runHtmlTableContextMenuAction(state, interaction, 'toggleHeadSection', (transaction) => {
      expect(transaction.getMeta(htmlTableInteractionPluginKey)).toEqual({
        contextMenuOpen: false,
      });
      nextState = state.apply(transaction);
    });

    expect(applied).toBe(true);
    expect(nextState.doc.firstChild?.firstChild?.type.name).toBe('htmlTableHead');
  });

  it('refuses to run actions that are missing from the current menu scope', () => {
    const table = createHtmlTableNode(schema, { rows: 2, cols: 2 });
    const doc = schema.nodes.doc!.create(null, [table]);
    const cellPositions = findNodePositions(doc, 'htmlTableCell');
    const state = EditorState.create({
      schema,
      doc,
      selection: CellSelection.create(doc, cellPositions[0]!),
    });
    const interaction = createInteractionState({
      activeTable: { tablePos: 0, table },
      geometry: createGeometry(),
    });

    expect(runHtmlTableContextMenuAction(state, interaction, 'deleteTable')).toBe(false);
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
      selectedAxisExplicit: false,
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
