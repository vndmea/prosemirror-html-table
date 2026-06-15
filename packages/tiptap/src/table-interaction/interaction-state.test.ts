import { describe, expect, it } from 'vitest';

import {
  buildTableInteractionState,
  createDefaultTableInteractionState,
  deriveTableContextTriggerState,
  type TableInteractionMeta,
  type TableSelectedAxisState,
} from './interaction-state.js';

describe('shared table interaction state', () => {
  it('builds interaction state while preserving explicit axis context and open menus', () => {
    const previous = createDefaultTableInteractionState<string, ReturnType<typeof createGeometry>>();
    const nextState = buildTableInteractionState({
      state: { id: 'doc' },
      selection: { tablePos: 8, axis: null as TableSelectedAxisState | null, tableSelected: false },
      previous: {
        ...previous,
        activeTable: { tablePos: 8, table: 'table' },
        selectedAxis: {
          kind: 'column',
          index: 1,
          tablePos: 8,
        },
        selectedAxisExplicit: true,
        geometry: createGeometry(),
        contextMenuOpen: true,
      },
      meta: {
        geometry: createGeometry(),
      },
      getSelectionTableReference: (selection) => ({
        tablePos: selection.tablePos,
        table: 'table',
      }),
      isTableNodeSelection: (selection) => selection.tableSelected,
      getSelectedAxisState: (selection) => selection.axis ?? emptyAxisState(),
      deriveContextTriggerState: deriveTableContextTriggerState,
    });

    expect(nextState.activeTable?.tablePos).toBe(8);
    expect(nextState.selectedAxis.kind).toBe('column');
    expect(nextState.selectedAxisExplicit).toBe(true);
    expect(nextState.contextTrigger.visible).toBe(true);
    expect(nextState.contextMenuOpen).toBe(true);
  });

  it('resets context-menu state when selection changes and the caller disallows opening', () => {
    const nextState = buildTableInteractionState({
      state: { id: 'doc' },
      selection: { tablePos: 8, axis: emptyAxisState(), tableSelected: false },
      previous: {
        ...createDefaultTableInteractionState<string, ReturnType<typeof createGeometry>>(),
        activeTable: { tablePos: 8, table: 'table' },
        contextMenuOpen: true,
      },
      meta: {
        geometry: createGeometry(),
        contextMenuOpen: true,
      } satisfies TableInteractionMeta<string, ReturnType<typeof createGeometry>>,
      selectionChanged: true,
      getSelectionTableReference: (selection) => ({
        tablePos: selection.tablePos,
        table: 'table',
      }),
      isTableNodeSelection: () => false,
      getSelectedAxisState: (selection) => selection.axis,
      canOpenContextMenu: () => false,
    });

    expect(nextState.contextMenuOpen).toBe(false);
    expect(nextState.contextTrigger.visible).toBe(false);
  });

  it('derives trigger anchors for table, row, and column scopes from shared geometry', () => {
    const table = { tablePos: 0, table: 'table' };
    const geometry = createGeometry();

    expect(deriveTableContextTriggerState(table, true, emptyAxisState(), geometry)).toEqual({
      visible: true,
      left: 10,
      top: 20,
    });
    expect(deriveTableContextTriggerState(table, false, { kind: 'row', index: 1, tablePos: 0 }, geometry)).toEqual({
      visible: true,
      left: 10,
      top: 90,
    });
    expect(deriveTableContextTriggerState(table, false, { kind: 'column', index: 1, tablePos: 0 }, geometry)).toEqual({
      visible: true,
      left: 150,
      top: 20,
    });
  });
});

function emptyAxisState(): TableSelectedAxisState {
  return {
    kind: null,
    index: null,
    tablePos: null,
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
