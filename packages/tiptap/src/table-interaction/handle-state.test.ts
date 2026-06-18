import { describe, expect, it } from 'vitest';

import {
  isTableAxisHandleHovered,
  isTableAxisHandleSelected,
  isTableAxisHandleVisible,
  shouldToggleTableContextMenuFromAxisHandle,
  shouldToggleTableContextMenuFromTableHandle,
  type TableAxisInteractionStateLike,
  type TableAxisSelectionStateLike,
} from './handle-state.js';

interface AxisStateWithGroup extends TableAxisSelectionStateLike {
  tgroupIndex?: number | null;
}

describe('shared table handle state helpers', () => {
  it('matches selected handles with optional extra axis constraints', () => {
    const interaction: TableAxisInteractionStateLike<AxisStateWithGroup> = {
      hovered: null,
      selectedAxis: {
        kind: 'row',
        index: 1,
        tablePos: 5,
        tgroupIndex: 2,
      },
      selectedAxisExplicit: true,
      tableSelected: false,
      contextMenuOpen: false,
      resizing: null,
    };

    expect(isTableAxisHandleSelected(interaction, 'row', 5, 1)).toBe(true);
    expect(isTableAxisHandleSelected(interaction, 'row', 5, 1, {
      matchesSelectedAxis: (selectedAxis) => selectedAxis.tgroupIndex === 2,
    })).toBe(true);
    expect(isTableAxisHandleSelected(interaction, 'row', 5, 1, {
      matchesSelectedAxis: (selectedAxis) => selectedAxis.tgroupIndex === 0,
    })).toBe(false);
    expect(shouldToggleTableContextMenuFromAxisHandle(interaction, 'row', 5, 1)).toBe(true);
  });

  it('derives hovered handles from the shared hover state shape', () => {
    const interaction: TableAxisInteractionStateLike = {
      hovered: {
        tablePos: 5,
        rowIndex: 1,
        columnIndex: 2,
      },
      selectedAxis: {
        kind: null,
        index: null,
        tablePos: null,
      },
      selectedAxisExplicit: false,
      tableSelected: false,
      contextMenuOpen: false,
      resizing: null,
    };

    expect(isTableAxisHandleHovered(interaction, 'row', 5, 1)).toBe(true);
    expect(isTableAxisHandleHovered(interaction, 'column', 5, 2)).toBe(true);
    expect(isTableAxisHandleHovered(interaction, 'column', 5, 1)).toBe(false);
  });

  it('keeps selected handles visible while suppressing hover-only handles during menus and resize', () => {
    const hovered: TableAxisInteractionStateLike = {
      hovered: {
        tablePos: 5,
        rowIndex: 1,
        columnIndex: 0,
      },
      selectedAxis: {
        kind: null,
        index: null,
        tablePos: null,
      },
      selectedAxisExplicit: false,
      tableSelected: false,
      contextMenuOpen: false,
      resizing: null,
    };
    const selected: TableAxisInteractionStateLike = {
      hovered: null,
      selectedAxis: {
        kind: 'row',
        index: 1,
        tablePos: 5,
      },
      selectedAxisExplicit: true,
      tableSelected: false,
      contextMenuOpen: false,
      resizing: null,
    };

    expect(isTableAxisHandleVisible(hovered, 'row', 5, 1)).toBe(true);
    expect(isTableAxisHandleVisible({ ...hovered, contextMenuOpen: true }, 'row', 5, 1)).toBe(false);
    expect(isTableAxisHandleVisible({ ...selected, contextMenuOpen: true }, 'row', 5, 1)).toBe(true);
    expect(isTableAxisHandleVisible({
      ...selected,
      resizing: { tablePos: 5 },
    }, 'row', 5, 1)).toBe(false);
  });

  it('toggles table handle menus only for the active selected table', () => {
    expect(shouldToggleTableContextMenuFromTableHandle({
      tableSelected: true,
      activeTable: { tablePos: 3 },
    }, 3)).toBe(true);
    expect(shouldToggleTableContextMenuFromTableHandle({
      tableSelected: false,
      activeTable: { tablePos: 3 },
    }, 3)).toBe(false);
  });
});
