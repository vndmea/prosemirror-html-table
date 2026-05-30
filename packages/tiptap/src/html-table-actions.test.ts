import { Schema } from 'prosemirror-model';
import { EditorState, NodeSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';

import { CellSelection, createHtmlTableNode, createHtmlTableNodeSpecs } from 'prosemirror-html-table';

import {
  getHtmlTableContextActionGroups,
  getHtmlTableContextActionCommand,
  getHtmlTableContextActions,
  getPrimaryHtmlTableContextAction,
  runHtmlTableContextAction,
} from './html-table-actions.js';
import {
  createHtmlTableInteractionPlugin,
  getHtmlTableInteractionState,
  htmlTableInteractionPluginKey,
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
      'setCellTextAlignLeft',
      'setCellTextAlignCenter',
      'setCellTextAlignRight',
      'setCellVerticalAlignTop',
      'setCellVerticalAlignMiddle',
      'setCellVerticalAlignBottom',
      'clearSelectedCells',
      'mergeOrSplitCells',
      'toggleHeaderCell',
    ]);
    expect(actions.every((action) => action.scope === 'cell')).toBe(true);
  });

  it('marks active cell formatting actions from the current selection attrs', () => {
    const table = createHtmlTableNode(schema, { rows: 2, cols: 2 });
    const doc = schema.nodes.doc!.create(null, [table]);
    const cellPositions = findNodePositions(doc, 'htmlTableCell');
    const state = EditorState.create({
      schema,
      doc,
      selection: CellSelection.create(doc, cellPositions[0]!),
      plugins: [createHtmlTableInteractionPlugin()],
    });

    let centeredState = state;
    const centered = getHtmlTableContextActionCommand({
      id: 'setCellTextAlignCenter',
      label: 'Align center',
      scope: 'cell',
      enabled: true,
    })(state, (transaction) => {
      centeredState = state.apply(transaction);
    });
    expect(centered).toBe(true);
    centeredState = centeredState.apply(
      centeredState.tr.setSelection(CellSelection.create(centeredState.doc, cellPositions[0]!)),
    );
    expect(centeredState.doc.firstChild?.firstChild?.firstChild?.firstChild?.attrs.textAlign).toBe('center');

    const centeredActions = getHtmlTableContextActions(centeredState, getHtmlTableInteractionState(centeredState));
    expect(centeredActions.find((action) => action.id === 'setCellTextAlignCenter')?.active).toBe(true);
    expect(centeredActions.find((action) => action.id === 'setCellTextAlignLeft')?.active).toBeFalsy();

    let middleAlignedState = state;
    const middleAligned = getHtmlTableContextActionCommand({
      id: 'setCellVerticalAlignMiddle',
      label: 'Align middle',
      scope: 'cell',
      enabled: true,
    })(state, (transaction) => {
      middleAlignedState = state.apply(transaction);
    });
    expect(middleAligned).toBe(true);
    middleAlignedState = middleAlignedState.apply(
      middleAlignedState.tr.setSelection(CellSelection.create(middleAlignedState.doc, cellPositions[0]!)),
    );
    expect(middleAlignedState.doc.firstChild?.firstChild?.firstChild?.firstChild?.attrs.verticalAlign).toBe('middle');

    const verticalActions = getHtmlTableContextActions(
      middleAlignedState,
      getHtmlTableInteractionState(middleAlignedState),
    );
    expect(verticalActions.find((action) => action.id === 'setCellVerticalAlignMiddle')?.active).toBe(true);
    expect(verticalActions.find((action) => action.id === 'setCellVerticalAlignTop')?.active).toBeFalsy();
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

  it('runs context actions through a single entry point and closes the context menu on success', () => {
    const table = createHtmlTableNode(schema, { rows: 2, cols: 2 });
    const doc = schema.nodes.doc!.create(null, [table]);
    const cellPositions = findNodePositions(doc, 'htmlTableCell');
    const baseState = EditorState.create({
      schema,
      doc,
      selection: CellSelection.create(doc, cellPositions[0]!),
      plugins: [createHtmlTableInteractionPlugin()],
    });
    const rowState = baseState.apply(createRowSelectionTransaction(baseState, 0, table, 1)!);
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
    const action = getHtmlTableContextActions(openState, getHtmlTableInteractionState(openState)).find(
      (item) => item.id === 'addRowAfter',
    );

    expect(action?.enabled).toBe(true);
    expect(getHtmlTableInteractionState(openState).contextMenuOpen).toBe(true);

    let transactionState = openState;
    const applied = runHtmlTableContextAction(openState, action!, (transaction) => {
      expect(transaction.getMeta(htmlTableInteractionPluginKey)).toEqual({
        contextMenuOpen: false,
      });
      transactionState = openState.apply(transaction);
    });

    expect(applied).toBe(true);
    expect(findNodePositions(transactionState.doc, 'htmlTableRow')).toHaveLength(3);
    expect(getHtmlTableInteractionState(transactionState).contextMenuOpen).toBe(false);
  });

  it('groups actions into stable popover sections', () => {
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

    const groups = getHtmlTableContextActionGroups(
      getHtmlTableContextActions(nextState, getHtmlTableInteractionState(nextState)),
    );

    expect(groups.map((group) => group.id)).toEqual([
      'insert',
      'structure',
      'reorder',
      'section',
      'content',
      'danger',
    ]);
    expect(groups.find((group) => group.id === 'danger')?.actions.map((action) => action.id)).toEqual([
      'deleteRow',
    ]);
  });

  it('derives a primary action that matches the current scope', () => {
    const table = createHtmlTableNode(schema, { rows: 2, cols: 2 });
    const doc = schema.nodes.doc!.create(null, [table]);
    const state = EditorState.create({
      schema,
      doc,
      selection: NodeSelection.create(doc, 0),
      plugins: [createHtmlTableInteractionPlugin()],
    });

    const tablePrimary = getPrimaryHtmlTableContextAction(
      getHtmlTableContextActions(state, getHtmlTableInteractionState(state)),
    );

    expect(tablePrimary?.id).toBe('toggleHeadSection');

    const cellPositions = findNodePositions(doc, 'htmlTableCell');
    const mergedCellState = EditorState.create({
      schema,
      doc,
      selection: CellSelection.create(doc, cellPositions[0]!, cellPositions[3]!),
      plugins: [createHtmlTableInteractionPlugin()],
    });
    const mergedCellPrimary = getPrimaryHtmlTableContextAction(
      getHtmlTableContextActions(mergedCellState, getHtmlTableInteractionState(mergedCellState)),
    );

    expect(mergedCellPrimary?.id).toBe('mergeOrSplitCells');

    const singleCellState = EditorState.create({
      schema,
      doc,
      selection: CellSelection.create(doc, cellPositions[0]!),
      plugins: [createHtmlTableInteractionPlugin()],
    });
    const singleCellPrimary = getPrimaryHtmlTableContextAction(
      getHtmlTableContextActions(singleCellState, getHtmlTableInteractionState(singleCellState)),
    );

    expect(singleCellPrimary?.id).toBe('clearSelectedCells');
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
