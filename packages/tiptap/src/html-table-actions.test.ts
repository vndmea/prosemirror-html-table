import { Schema } from 'prosemirror-model';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';

import { CellSelection, createHtmlTableNode, createHtmlTableNodeSpecs } from 'prosemirror-html-table';

import {
  getHtmlTableContextActionGroups,
  getHtmlTableContextActionCommand,
  getHtmlTableContextActionMenuItemState,
  getHtmlTableContextActionShortcutState,
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
      'toggleCaption',
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
    const nextState = applyExplicitRowSelection(state, table, 1);

    const actions = getHtmlTableContextActions(nextState, getHtmlTableInteractionState(nextState));

    expect(actions.map((action) => action.id)).toEqual([
      'addRowBefore',
      'addRowAfter',
      'deleteRow',
      'moveRowUp',
      'moveRowDown',
      'duplicateRow',
      'toggleHeaderRow',
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
    const nextState = applyExplicitColumnSelection(state, table, 1);

    const actions = getHtmlTableContextActions(nextState, getHtmlTableInteractionState(nextState));

    expect(actions.map((action) => action.id)).toEqual([
      'addColumnBefore',
      'addColumnAfter',
      'deleteColumn',
      'moveColumnLeft',
      'moveColumnRight',
      'duplicateColumn',
      'toggleHeaderColumn',
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
      'setCellBackgroundColorBlue',
      'setCellBackgroundColorGreen',
      'setCellBackgroundColorYellow',
      'clearCellBackgroundColor',
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

  it('marks active cell background actions from the current selection attrs', () => {
    const table = createHtmlTableNode(schema, { rows: 2, cols: 2 });
    const doc = schema.nodes.doc!.create(null, [table]);
    const cellPositions = findNodePositions(doc, 'htmlTableCell');
    const state = EditorState.create({
      schema,
      doc,
      selection: CellSelection.create(doc, cellPositions[0]!),
      plugins: [createHtmlTableInteractionPlugin()],
    });

    let coloredState = state;
    const colored = getHtmlTableContextActionCommand({
      id: 'setCellBackgroundColorBlue',
      label: 'Background blue',
      scope: 'cell',
      enabled: true,
    })(state, (transaction) => {
      coloredState = state.apply(transaction);
    });

    expect(colored).toBe(true);
    coloredState = coloredState.apply(
      coloredState.tr.setSelection(CellSelection.create(coloredState.doc, cellPositions[0]!)),
    );
    expect(coloredState.doc.firstChild?.firstChild?.firstChild?.firstChild?.attrs.backgroundColor).toBe('#dbeafe');

    const actions = getHtmlTableContextActions(coloredState, getHtmlTableInteractionState(coloredState));
    expect(actions.find((action) => action.id === 'setCellBackgroundColorBlue')?.active).toBe(true);
    expect(actions.find((action) => action.id === 'clearCellBackgroundColor')?.active).toBeFalsy();
  });

  it('marks toggleHeaderCell as active when the current cell selection is header cells', () => {
    const table = createHtmlTableNode(schema, { rows: 2, cols: 2 });
    const doc = schema.nodes.doc!.create(null, [table]);
    const cellPositions = findNodePositions(doc, 'htmlTableCell');
    const state = EditorState.create({
      schema,
      doc,
      selection: CellSelection.create(doc, cellPositions[0]!),
      plugins: [createHtmlTableInteractionPlugin()],
    });

    let headerCellState = state;
    const toggled = getHtmlTableContextActionCommand({
      id: 'toggleHeaderCell',
      label: 'Toggle header cell',
      scope: 'cell',
      enabled: true,
    })(state, (transaction) => {
      headerCellState = state.apply(transaction);
    });

    expect(toggled).toBe(true);
    headerCellState = headerCellState.apply(
      headerCellState.tr.setSelection(CellSelection.create(headerCellState.doc, cellPositions[0]!)),
    );

    const actions = getHtmlTableContextActions(headerCellState, getHtmlTableInteractionState(headerCellState));
    expect(actions.find((action) => action.id === 'toggleHeaderCell')?.active).toBe(true);
    expect(actions.find((action) => action.id === 'toggleHeaderCell')?.label).toBe('Unset header cell');
  });

  it('marks row and column header toggle actions as active when the selection is fully header cells', () => {
    const table = createHtmlTableNode(schema, { rows: 2, cols: 2 });
    const doc = schema.nodes.doc!.create(null, [table]);
    const cellPositions = findNodePositions(doc, 'htmlTableCell');
    const state = EditorState.create({
      schema,
      doc,
      selection: CellSelection.create(doc, cellPositions[0]!),
      plugins: [createHtmlTableInteractionPlugin()],
    });

    let rowHeaderState = applyExplicitRowSelection(state, table, 0);
    const toggledRow = getHtmlTableContextActionCommand({
      id: 'toggleHeaderRow',
      label: 'Toggle header row',
      scope: 'row',
      enabled: true,
    })(rowHeaderState, (transaction) => {
      rowHeaderState = rowHeaderState.apply(transaction);
    });
    expect(toggledRow).toBe(true);
    rowHeaderState = rowHeaderState.apply(
      rowHeaderState.tr.setSelection(CellSelection.create(rowHeaderState.doc, cellPositions[0]!)),
    );
    rowHeaderState = applyExplicitRowSelection(
      rowHeaderState,
      rowHeaderState.doc.firstChild as typeof table,
      0,
    );
    const rowActions = getHtmlTableContextActions(rowHeaderState, getHtmlTableInteractionState(rowHeaderState));
    expect(rowActions.find((action) => action.id === 'toggleHeaderRow')?.active).toBe(true);
    expect(rowActions.find((action) => action.id === 'toggleHeaderRow')?.label).toBe('Unset header row');

    let columnHeaderState = applyExplicitColumnSelection(state, table, 0);
    const toggledColumn = getHtmlTableContextActionCommand({
      id: 'toggleHeaderColumn',
      label: 'Toggle header column',
      scope: 'column',
      enabled: true,
    })(columnHeaderState, (transaction) => {
      columnHeaderState = columnHeaderState.apply(transaction);
    });
    expect(toggledColumn).toBe(true);
    columnHeaderState = columnHeaderState.apply(
      columnHeaderState.tr.setSelection(CellSelection.create(columnHeaderState.doc, cellPositions[0]!)),
    );
    columnHeaderState = applyExplicitColumnSelection(
      columnHeaderState,
      columnHeaderState.doc.firstChild as typeof table,
      0,
    );
    const columnActions = getHtmlTableContextActions(columnHeaderState, getHtmlTableInteractionState(columnHeaderState));
    expect(columnActions.find((action) => action.id === 'toggleHeaderColumn')?.active).toBe(true);
    expect(columnActions.find((action) => action.id === 'toggleHeaderColumn')?.label).toBe('Unset header column');
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

  it('marks toggleCaption as active when the current table already has a caption', () => {
    const table = createHtmlTableNode(schema, { rows: 2, cols: 2, withCaption: true, captionText: 'Summary' });
    const doc = schema.nodes.doc!.create(null, [table]);
    const state = EditorState.create({
      schema,
      doc,
      selection: NodeSelection.create(doc, 0),
      plugins: [createHtmlTableInteractionPlugin()],
    });

    const actions = getHtmlTableContextActions(state, getHtmlTableInteractionState(state));
    expect(actions.find((action) => action.id === 'toggleCaption')?.active).toBe(true);
    expect(actions.find((action) => action.id === 'toggleCaption')?.label).toBe('Remove caption');
  });

  it('uses additive labels for inactive table and header toggle actions', () => {
    const table = createHtmlTableNode(schema, { rows: 2, cols: 2 });
    const doc = schema.nodes.doc!.create(null, [table]);
    const tableState = EditorState.create({
      schema,
      doc,
      selection: NodeSelection.create(doc, 0),
      plugins: [createHtmlTableInteractionPlugin()],
    });
    const tableActions = getHtmlTableContextActions(tableState, getHtmlTableInteractionState(tableState));
    expect(tableActions.find((action) => action.id === 'toggleCaption')?.label).toBe('Add caption');
    expect(tableActions.find((action) => action.id === 'toggleColgroup')?.label).toBe('Add colgroup');
    expect(tableActions.find((action) => action.id === 'toggleHeadSection')?.label).toBe('Add header section');
    expect(tableActions.find((action) => action.id === 'toggleFootSection')?.label).toBe('Add footer section');

    const cellPositions = findNodePositions(doc, 'htmlTableCell');
    const cellState = EditorState.create({
      schema,
      doc,
      selection: CellSelection.create(doc, cellPositions[0]!),
      plugins: [createHtmlTableInteractionPlugin()],
    });
    const cellActions = getHtmlTableContextActions(cellState, getHtmlTableInteractionState(cellState));
    expect(cellActions.find((action) => action.id === 'toggleHeaderCell')?.label).toBe('Set header cell');
  });

  it('derives plain menu item semantics for toggle, formatting, and destructive actions', () => {
    expect(getHtmlTableContextActionMenuItemState({
      id: 'toggleCaption',
      label: 'Remove caption',
      scope: 'table',
      enabled: true,
      active: true,
    })).toEqual({
      role: 'menuitem',
      checked: null,
    });

    expect(getHtmlTableContextActionMenuItemState({
      id: 'setCellTextAlignCenter',
      label: 'Align center',
      scope: 'cell',
      enabled: true,
      active: false,
    })).toEqual({
      role: 'menuitem',
      checked: null,
    });

    expect(getHtmlTableContextActionMenuItemState({
      id: 'deleteRow',
      label: 'Delete row',
      scope: 'row',
      enabled: true,
    })).toEqual({
      role: 'menuitem',
      checked: null,
    });
  });

  it('derives aria-keyshortcuts for the actions that expose keyboard affordances', () => {
    expect(getHtmlTableContextActionShortcutState({
      id: 'mergeOrSplitCells',
      label: 'Merge or split cells',
      scope: 'cell',
      enabled: true,
    })).toEqual({
      ariaKeyshortcuts: 'Enter',
    });

    expect(getHtmlTableContextActionShortcutState({
      id: 'sortBodyRowsAsc',
      label: 'Sort ascending',
      scope: 'column',
      enabled: true,
    })).toEqual({
      ariaKeyshortcuts: 'Alt+ArrowUp',
    });

    expect(getHtmlTableContextActionShortcutState({
      id: 'addRowAfter',
      label: 'Add row after',
      scope: 'row',
      enabled: true,
    })).toEqual({
      ariaKeyshortcuts: null,
    });
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
    const rowState = applyExplicitRowSelection(baseState, table, 1);
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

  it('materializes a column selection before running column-scope context actions', () => {
    const table = createHtmlTableNode(schema, { rows: 2, cols: 2 });
    const doc = schema.nodes.doc!.create(null, [table]);
    const cellPositions = findNodePositions(doc, 'htmlTableCell');
    const baseState = EditorState.create({
      schema,
      doc,
      selection: TextSelection.near(doc.resolve(cellPositions[0]! + 1)),
      plugins: [createHtmlTableInteractionPlugin()],
    });
    const interactionState = baseState.apply(
      baseState.tr.setMeta(htmlTableInteractionPluginKey, {
        selectedAxis: {
          kind: 'column',
          index: 0,
          tablePos: 0,
        },
        selectedAxisExplicit: true,
        geometry: createGeometry(),
        contextMenuOpen: true,
      }),
    );
    const interaction = getHtmlTableInteractionState(interactionState);
    const action = getHtmlTableContextActions(interactionState, interaction).find((item) => item.id === 'deleteColumn');

    expect(action?.enabled).toBe(true);

    let nextState = interactionState;
    const applied = runHtmlTableContextAction(interactionState, action!, (transaction) => {
      nextState = interactionState.apply(transaction);
    }, {}, interaction);

    expect(applied).toBe(true);
    expect(
      findNodePositions(nextState.doc, 'htmlTableHeaderCell').length +
      findNodePositions(nextState.doc, 'htmlTableCell').length,
    ).toBe(2);
  });

  it('runs column actions against the selected axis even when the editor selection sits in another cell', () => {
    const table = schema.nodes.htmlTable!.create(null, [
      schema.nodes.htmlTableHead!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableHeaderCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('Task'))]),
          schema.nodes.htmlTableHeaderCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('Notes'))]),
          schema.nodes.htmlTableHeaderCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('Status'))]),
        ]),
      ]),
      schema.nodes.htmlTableBody!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('Open panel'))]),
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create()]),
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('Done'))]),
        ]),
      ]),
      schema.nodes.htmlTableFoot!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('Total'))]),
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create()]),
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('2 tasks'))]),
        ]),
      ]),
    ]);
    const doc = schema.nodes.doc!.create(null, [table]);
    const cellPositions = findNodePositions(doc, 'htmlTableCell');
    const baseState = EditorState.create({
      schema,
      doc,
      selection: TextSelection.near(doc.resolve(cellPositions[cellPositions.length - 1]! + 1)),
      plugins: [createHtmlTableInteractionPlugin()],
    });
    const interactionState = baseState.apply(
      baseState.tr.setMeta(htmlTableInteractionPluginKey, {
        selectedAxis: {
          kind: 'column',
          index: 0,
          tablePos: 0,
        },
        selectedAxisExplicit: true,
        geometry: createGeometry(),
        contextMenuOpen: true,
      }),
    );
    const interaction = getHtmlTableInteractionState(interactionState);
    const action = getHtmlTableContextActions(interactionState, interaction).find((item) => item.id === 'deleteColumn');

    let nextState = interactionState;
    const applied = runHtmlTableContextAction(interactionState, action!, (transaction) => {
      nextState = interactionState.apply(transaction);
    }, {}, interaction);

    expect(applied).toBe(true);
    expect(nextState.doc.textContent).not.toContain('Task');
    expect(nextState.doc.textContent).toContain('Status');
    expect(getTableCellCount(nextState.doc)).toBe(6);
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
    const nextState = applyExplicitRowSelection(state, table, 1);

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

function applyExplicitRowSelection(
  state: EditorState,
  table: import('prosemirror-model').Node,
  rowIndex: number,
) {
  return state.apply(
    createRowSelectionTransaction(state, 0, table, rowIndex)!.setMeta(htmlTableInteractionPluginKey, {
      selectedAxis: {
        kind: 'row',
        index: rowIndex,
        tablePos: 0,
      },
      selectedAxisExplicit: true,
    }),
  );
}

function applyExplicitColumnSelection(
  state: EditorState,
  table: import('prosemirror-model').Node,
  columnIndex: number,
) {
  return state.apply(
    createColumnSelectionTransaction(state, 0, table, columnIndex)!.setMeta(htmlTableInteractionPluginKey, {
      selectedAxis: {
        kind: 'column',
        index: columnIndex,
        tablePos: 0,
      },
      selectedAxisExplicit: true,
    }),
  );
}

function getTableCellCount(doc: import('prosemirror-model').Node): number {
  return findNodePositions(doc, 'htmlTableHeaderCell').length + findNodePositions(doc, 'htmlTableCell').length;
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
