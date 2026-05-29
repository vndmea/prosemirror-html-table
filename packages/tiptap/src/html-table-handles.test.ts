import { describe, expect, it } from 'vitest';

import type { HtmlTableInteractionState } from './html-table-interaction.js';
import { isTableHandleVisible } from './html-table-handles.js';

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

    expect(isTableHandleVisible(interaction, 5)).toBe(true);
  });

  it('keeps the table handle visible for row and column selections', () => {
    const base = {
      activeTable: {
        tablePos: 5,
        table: {} as never,
      },
    };

    expect(
      isTableHandleVisible(createInteractionState({
        ...base,
        selectedAxis: {
          kind: 'row',
          index: 1,
          tablePos: 5,
        },
      }), 5),
    ).toBe(true);

    expect(
      isTableHandleVisible(createInteractionState({
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

    expect(isTableHandleVisible(interaction, 5)).toBe(true);
  });

  it('hides the table handle when there is no active table or the table differs', () => {
    expect(isTableHandleVisible(createInteractionState(), 5)).toBe(false);
    expect(
      isTableHandleVisible(createInteractionState({
        activeTable: {
          tablePos: 7,
          table: {} as never,
        },
      }), 5),
    ).toBe(false);
  });
});
