import { describe, expect, it } from 'vitest';

import type { HtmlTableInteractionState } from './html-table-interaction.js';
import {
  getHtmlTableContextTriggerRenderState,
  getHtmlTableSelectionAnchor,
  getHtmlTableSelectionScope,
  isTableHandleVisible,
} from './html-table-handles.js';
import type { HtmlTableContextTriggerButtonState } from './html-table-context-menu.js';
import type { HtmlTableGeometry } from './table-dom.js';

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
    geometry: null,
    resizing: null,
    ...overrides,
  };
}

describe('html table handles', () => {
  it('shows the table handle whenever the table is active', () => {
    const interaction = createInteractionState({
      activeTable: {
        tablePos: 5,
        table: {} as never,
      },
    });

    expect(isTableHandleVisible(true, interaction, 5)).toBe(true);
  });

  it('keeps the table handle visible for row and column selections', () => {
    const base = {
      activeTable: {
        tablePos: 5,
        table: {} as never,
      },
    };

    expect(
      isTableHandleVisible(true, createInteractionState({
        ...base,
        selectedAxis: {
          kind: 'row',
          index: 1,
          tablePos: 5,
        },
      }), 5),
    ).toBe(true);

    expect(
      isTableHandleVisible(true, createInteractionState({
        ...base,
        selectedAxis: {
          kind: 'column',
          index: 1,
          tablePos: 5,
        },
      }), 5),
    ).toBe(true);
  });

  it('keeps the table handle visible for whole-table node selections', () => {
    const interaction = createInteractionState({
      activeTable: {
        tablePos: 5,
        table: {} as never,
      },
      tableSelected: true,
    });

    expect(isTableHandleVisible(true, interaction, 5)).toBe(true);
  });

  it('hides the table handle when there is no active table or the table differs', () => {
    expect(isTableHandleVisible(true, createInteractionState(), 5)).toBe(false);
    expect(
      isTableHandleVisible(true, createInteractionState({
        activeTable: {
          tablePos: 7,
          table: {} as never,
        },
      }), 5),
    ).toBe(false);
  });

  it('hides the table handle entirely when table node selection is disabled', () => {
    const interaction = createInteractionState({
      activeTable: {
        tablePos: 5,
        table: {} as never,
      },
      tableSelected: true,
    });

    expect(isTableHandleVisible(false, interaction, 5)).toBe(false);
  });

  it('derives table, row, column, and cell selection scopes for the overlay', () => {
    const base = createInteractionState({
      activeTable: {
        tablePos: 5,
        table: {} as never,
      },
    });

    expect(getHtmlTableSelectionScope({ ...base, tableSelected: true }, 5, null)).toBe('table');
    expect(
      getHtmlTableSelectionScope({
        ...base,
        selectedAxis: {
          kind: 'row',
          index: 1,
          tablePos: 5,
        },
      }, 5, null),
    ).toBe('row');
    expect(
      getHtmlTableSelectionScope({
        ...base,
        selectedAxis: {
          kind: 'column',
          index: 1,
          tablePos: 5,
        },
      }, 5, null),
    ).toBe('column');
    expect(
      getHtmlTableSelectionScope(base, 5, {
        tablePos: 5,
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
      } as never),
    ).toBe('cell');
    expect(getHtmlTableSelectionScope(base, 5, null)).toBeNull();
  });

  it('derives selection anchors for table, row, column, and cell scopes', () => {
    const geometry: HtmlTableGeometry = {
      tableRect: {
        left: 0,
        top: 0,
        right: 240,
        bottom: 80,
        width: 240,
        height: 80,
      },
      columns: [
        { index: 0, left: 0, width: 100 },
        { index: 1, left: 100, width: 140 },
      ],
      rows: [
        { index: 0, top: 0, height: 30 },
        { index: 1, top: 30, height: 50 },
      ],
    };
    const base = createInteractionState({
      activeTable: {
        tablePos: 5,
        table: {} as never,
      },
    });

    expect(getHtmlTableSelectionAnchor({ ...base, tableSelected: true }, 5, geometry, 20, 10, null)).toEqual({
      left: 20,
      top: 10,
    });
    expect(
      getHtmlTableSelectionAnchor({
        ...base,
        selectedAxis: {
          kind: 'row',
          index: 1,
          tablePos: 5,
        },
      }, 5, geometry, 20, 10, null),
    ).toEqual({
      left: 20,
      top: 65,
    });
    expect(
      getHtmlTableSelectionAnchor({
        ...base,
        selectedAxis: {
          kind: 'column',
          index: 1,
          tablePos: 5,
        },
      }, 5, geometry, 20, 10, null),
    ).toEqual({
      left: 190,
      top: 10,
    });
    expect(
      getHtmlTableSelectionAnchor(base, 5, geometry, 20, 10, {
        tablePos: 5,
        left: 0,
        right: 1,
        top: 0,
        bottom: 1,
      } as never),
    ).toEqual({
      left: 259,
      top: 50,
    });
  });

  it('derives trigger button render state from trigger button state', () => {
    const trigger: HtmlTableContextTriggerButtonState = {
      visible: true,
      scope: 'row',
      anchor: {
        left: 10,
        top: 90,
      },
      label: 'Row actions',
      title: 'Row actions: Add row after',
      primaryAction: {
        id: 'addRowAfter',
        label: 'Add row after',
        scope: 'row',
        enabled: true,
      },
      groups: [],
    };

    expect(getHtmlTableContextTriggerRenderState(trigger)).toEqual({
      visible: true,
      left: 10,
      top: 90,
      label: 'Row actions',
      title: 'Row actions: Add row after',
      scope: 'row',
      primaryActionId: 'addRowAfter',
    });

    expect(
      getHtmlTableContextTriggerRenderState({
        ...trigger,
        visible: false,
        anchor: null,
        label: null,
        title: null,
        primaryAction: null,
      }),
    ).toEqual({
      visible: false,
      left: null,
      top: null,
      label: null,
      title: null,
      scope: 'row',
      primaryActionId: null,
    });
  });
});
