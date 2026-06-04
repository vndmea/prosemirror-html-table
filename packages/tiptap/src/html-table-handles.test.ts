import { describe, expect, it } from 'vitest';

import type { HtmlTableInteractionState } from './html-table-interaction.js';
import {
  canRestoreHtmlTableContextMenuFocus,
  isHtmlTableInteractionLockedByResize,
  isHtmlTableAxisHandleVisible,
  getHtmlTableCellContextTriggerRenderState,
  getHtmlTableContextMenuActionRenderState,
  getHtmlTableContextMenuAccessibleState,
  getHtmlTableContextMenuAriaControls,
  getHtmlTableContextMenuGroupAccessibleState,
  getHtmlTableContextMenuHeaderState,
  getHtmlTableContextMenuPosition,
  getHtmlTableContextMenuRenderState,
  getHtmlTableContextMenuTransformOrigin,
  getNextHtmlTableContextMenuActionIndex,
  getNextHtmlTableContextMenuTypeaheadIndex,
  getHtmlTableOverlayHandleText,
  getHtmlTableContextTriggerRenderState,
  isHtmlTableAxisHandleHovered,
  getHtmlTableSelectionAnchor,
  getHtmlTableSelectionScope,
  isHtmlTableCellHandleVisible,
  isHtmlTableContextMenuExpandedForScope,
  isHtmlTableContextMenuDismissKey,
  isHtmlTableContextMenuExitKey,
  isHtmlTableKeyboardClick,
  isHtmlTableContextMenuNavigationKey,
  isHtmlTableContextMenuTypeaheadKey,
  isHtmlTableResizeHandleVisible,
  isTableHandleVisible,
  shouldHideHtmlTableExtendButtons,
  shouldToggleHtmlTableContextMenuFromTableHandle,
  shouldToggleHtmlTableContextMenuFromAxisHandle,
  shouldCloseHtmlTableContextMenuForTarget,
} from './html-table-handles.js';
import type { HtmlTableContextTriggerButtonState } from './html-table-context-menu.js';
import type { HtmlTableContextMenuState } from './html-table-context-menu.js';
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
        selectedAxisExplicit: true,
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
        selectedAxisExplicit: true,
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

  it('hides the table handle while the active table is being resized', () => {
    const interaction = createInteractionState({
      activeTable: {
        tablePos: 5,
        table: {} as never,
      },
      resizing: {
        tablePos: 5,
        columnIndex: 1,
      },
    });

    expect(isTableHandleVisible(true, interaction, 5)).toBe(false);
  });

  it('keeps selected axis handles visible, but suppresses hover-only handles during menus and resize', () => {
    const hovered = createInteractionState({
      activeTable: {
        tablePos: 5,
        table: {} as never,
      },
      hovered: {
        kind: 'cell',
        tablePos: 5,
        rowIndex: 1,
        columnIndex: 0,
      },
    });
    const selected = createInteractionState({
      activeTable: {
        tablePos: 5,
        table: {} as never,
      },
      selectedAxis: {
        kind: 'row',
        index: 1,
        tablePos: 5,
      },
      selectedAxisExplicit: true,
    });

    expect(isHtmlTableAxisHandleVisible(hovered, 'row', 5, 1)).toBe(true);
    expect(
      isHtmlTableAxisHandleVisible({
        ...hovered,
        contextMenuOpen: true,
      }, 'row', 5, 1),
    ).toBe(false);
    expect(
      isHtmlTableAxisHandleVisible({
        ...selected,
        contextMenuOpen: true,
      }, 'row', 5, 1),
    ).toBe(true);
    expect(
      isHtmlTableAxisHandleVisible({
        ...selected,
        resizing: {
          tablePos: 5,
          columnIndex: 0,
        },
      }, 'row', 5, 1),
    ).toBe(false);
  });

  it('prefers the currently hovered axis handle over an older explicit selection on the same axis', () => {
    const interaction = createInteractionState({
      activeTable: {
        tablePos: 5,
        table: {} as never,
      },
      hovered: {
        kind: 'cell',
        tablePos: 5,
        rowIndex: 0,
        columnIndex: 2,
      },
      selectedAxis: {
        kind: 'column',
        index: 1,
        tablePos: 5,
      },
      selectedAxisExplicit: true,
    });

    expect(isHtmlTableAxisHandleVisible(interaction, 'column', 5, 1)).toBe(false);
    expect(isHtmlTableAxisHandleVisible(interaction, 'column', 5, 2)).toBe(true);
    expect(isHtmlTableAxisHandleVisible(interaction, 'row', 5, 0)).toBe(true);
    expect(isHtmlTableAxisHandleVisible(interaction, 'row', 5, 1)).toBe(false);
  });

  it('shows only the active resize handle during resize and hides resizers while menus are open', () => {
    const base = createInteractionState({
      activeTable: {
        tablePos: 5,
        table: {} as never,
      },
    });

    expect(isHtmlTableResizeHandleVisible(base, 5, 0, true)).toBe(true);
    expect(
      isHtmlTableResizeHandleVisible({
        ...base,
        contextMenuOpen: true,
      }, 5, 0, true),
    ).toBe(false);
    expect(
      isHtmlTableResizeHandleVisible({
        ...base,
        resizing: {
          tablePos: 5,
          columnIndex: 1,
        },
      }, 5, 0, true),
    ).toBe(false);
    expect(
      isHtmlTableResizeHandleVisible({
        ...base,
        resizing: {
          tablePos: 5,
          columnIndex: 1,
        },
      }, 5, 1, true),
    ).toBe(true);
  });

  it('shows the cell handle only for visible cell selections without axis or resize lock', () => {
    const base = createInteractionState({
      activeTable: {
        tablePos: 5,
        table: {} as never,
      },
    });
    const selection = {
      tablePos: 5,
      left: 0,
      right: 1,
      top: 0,
      bottom: 0,
    } as never;

    expect(isHtmlTableCellHandleVisible(base, 5, selection, true)).toBe(true);
    expect(isHtmlTableCellHandleVisible(base, 5, selection, false)).toBe(false);
    expect(
      isHtmlTableCellHandleVisible({
        ...base,
        selectedAxis: {
          kind: 'column',
          index: 0,
          tablePos: 5,
        },
        selectedAxisExplicit: true,
      }, 5, selection, true),
    ).toBe(false);
    expect(
      isHtmlTableCellHandleVisible({
        ...base,
        resizing: {
          tablePos: 5,
          columnIndex: 0,
        },
      }, 5, selection, true),
    ).toBe(false);
  });

  it('locks overlay interactions only for the actively resized table', () => {
    const base = createInteractionState({
      activeTable: {
        tablePos: 5,
        table: {} as never,
      },
    });

    expect(isHtmlTableInteractionLockedByResize(base, 5)).toBe(false);
    expect(
      isHtmlTableInteractionLockedByResize({
        ...base,
        resizing: {
          tablePos: 5,
          columnIndex: 0,
        },
      }, 5),
    ).toBe(true);
    expect(
      isHtmlTableInteractionLockedByResize({
        ...base,
        resizing: {
          tablePos: 5,
          columnIndex: 0,
        },
      }, 7),
    ).toBe(false);
  });

  it('hides extend buttons while a context menu is open or resize is active', () => {
    expect(shouldHideHtmlTableExtendButtons(createInteractionState())).toBe(false);
    expect(
      shouldHideHtmlTableExtendButtons(createInteractionState({
        contextMenuOpen: true,
      })),
    ).toBe(true);
    expect(
      shouldHideHtmlTableExtendButtons(createInteractionState({
        resizing: {
          tablePos: 5,
          columnIndex: 0,
        },
      })),
    ).toBe(true);
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
        selectedAxisExplicit: true,
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
        selectedAxisExplicit: true,
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
      wrapperRect: {
        left: 0,
        top: 0,
        right: 240,
        bottom: 80,
        width: 240,
        height: 80,
      },
      visibleTableRect: {
        left: 0,
        top: 0,
        right: 240,
        bottom: 80,
        width: 240,
        height: 80,
      },
      scrollLeft: 0,
      scrollTop: 0,
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
        selectedAxisExplicit: true,
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
        selectedAxisExplicit: true,
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

  it('clamps selection anchors to the visible wrapper bounds when the table is scrolled', () => {
    const geometry: HtmlTableGeometry = {
      tableRect: {
        left: -120,
        top: 20,
        right: 240,
        bottom: 100,
        width: 360,
        height: 80,
      },
      wrapperRect: {
        left: 40,
        top: 20,
        right: 240,
        bottom: 100,
        width: 200,
        height: 80,
      },
      visibleTableRect: {
        left: 40,
        top: 20,
        right: 240,
        bottom: 100,
        width: 200,
        height: 80,
      },
      scrollLeft: 160,
      scrollTop: 0,
      columns: [
        { index: 0, left: 0, width: 120 },
        { index: 1, left: 120, width: 120 },
        { index: 2, left: 240, width: 120 },
      ],
      rows: [
        { index: 0, top: 0, height: 40 },
        { index: 1, top: 40, height: 40 },
      ],
    };
    const base = createInteractionState({
      activeTable: {
        tablePos: 5,
        table: {} as never,
      },
    });

    expect(getHtmlTableSelectionAnchor({ ...base, tableSelected: true }, 5, geometry, -120, 20, null)).toEqual({
      left: 40,
      top: 20,
    });
    expect(
      getHtmlTableSelectionAnchor({
        ...base,
        selectedAxis: {
          kind: 'row',
          index: 1,
          tablePos: 5,
        },
        selectedAxisExplicit: true,
      }, 5, geometry, -120, 20, null),
    ).toEqual({
      left: 40,
      top: 80,
    });
    expect(
      getHtmlTableSelectionAnchor(base, 5, geometry, -120, 20, {
        tablePos: 5,
        left: 2,
        right: 2,
        top: 0,
        bottom: 1,
      } as never),
    ).toEqual({
      left: 239,
      top: 60,
    });
  });

  it('derives trigger button render state from trigger button state', () => {
    const trigger: HtmlTableContextTriggerButtonState = {
      visible: true,
      expanded: true,
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
      expanded: true,
      label: 'Row actions',
      title: 'Row actions: Add row after',
      scope: 'row',
      primaryActionId: 'addRowAfter',
    });

    expect(
      getHtmlTableContextTriggerRenderState({
        ...trigger,
        visible: false,
        expanded: false,
        anchor: null,
        label: null,
        title: null,
        primaryAction: null,
      }),
      ).toEqual({
        visible: false,
        left: null,
        top: null,
        expanded: false,
        label: null,
        title: null,
      scope: 'row',
      primaryActionId: null,
    });
  });

  it('derives context menu render state from context menu state', () => {
    const menu: HtmlTableContextMenuState = {
      visible: true,
      open: true,
      scope: 'row',
      anchor: {
        left: 10,
        top: 90,
      },
      actions: [],
      groups: [
        {
          id: 'insert',
          label: 'Insert',
          actions: [],
        },
        {
          id: 'danger',
          label: 'Danger',
          actions: [],
        },
      ],
      primaryAction: {
        id: 'addRowAfter',
        label: 'Add row after',
        scope: 'row',
        enabled: true,
      },
    };

    expect(getHtmlTableContextMenuRenderState(menu)).toEqual({
      visible: true,
      left: 10,
      top: 90,
      scope: 'row',
      primaryActionId: 'addRowAfter',
      groupCount: 2,
    });

    expect(
      getHtmlTableContextMenuRenderState({
        ...menu,
        open: false,
        anchor: null,
        primaryAction: null,
      }),
    ).toEqual({
      visible: false,
      left: null,
      top: null,
      scope: 'row',
      primaryActionId: null,
      groupCount: 2,
    });
  });

  it('derives context menu positions with placement fallback inside the wrapper viewport', () => {
    expect(getHtmlTableContextMenuPosition(
      'row',
      40,
      80,
      120,
      100,
      8,
      8,
      400,
      300,
    )).toEqual({
      left: 52,
      top: 30,
      placement: 'right-center',
    });

    expect(getHtmlTableContextMenuPosition(
      'row',
      360,
      80,
      120,
      100,
      8,
      8,
      400,
      300,
    )).toEqual({
      left: 228,
      top: 30,
      placement: 'left-center',
    });

    expect(getHtmlTableContextMenuPosition(
      'column',
      200,
      260,
      140,
      90,
      8,
      8,
      420,
      300,
    )).toEqual({
      left: 130,
      top: 158,
      placement: 'top-center',
    });
  });

  it('derives transform origins from context menu placement', () => {
    expect(getHtmlTableContextMenuTransformOrigin('right-start')).toBe('left top');
    expect(getHtmlTableContextMenuTransformOrigin('right-center')).toBe('left center');
    expect(getHtmlTableContextMenuTransformOrigin('left-center')).toBe('right center');
    expect(getHtmlTableContextMenuTransformOrigin('bottom-center')).toBe('center top');
    expect(getHtmlTableContextMenuTransformOrigin('top-center')).toBe('center bottom');
  });

  it('derives a context menu header from scope and primary action', () => {
    expect(getHtmlTableContextMenuHeaderState({
      scope: 'column',
      primaryAction: {
        id: 'addColumnAfter',
        label: 'Add column after',
        scope: 'column',
        enabled: true,
      },
    })).toEqual({
      label: 'Column actions',
      detail: 'Add column after',
    });

    expect(getHtmlTableContextMenuHeaderState({
      scope: null,
      primaryAction: null,
    })).toEqual({
      label: null,
      detail: null,
    });
  });

  it('derives accessible label and description ids from the context menu header state', () => {
    expect(getHtmlTableContextMenuAccessibleState('pmht-menu-1', {
      label: 'Cell actions',
      detail: 'Align center',
    })).toEqual({
      labelledBy: 'pmht-menu-1-title',
      describedBy: 'pmht-menu-1-detail',
    });

    expect(getHtmlTableContextMenuAccessibleState('pmht-menu-1', {
      label: null,
      detail: null,
    })).toEqual({
      labelledBy: null,
      describedBy: null,
    });
  });

  it('derives accessible ids for context menu groups', () => {
    expect(getHtmlTableContextMenuGroupAccessibleState('pmht-menu-1', 'format')).toEqual({
      labelId: 'pmht-menu-1-group-format',
    });
  });

  it('matches expanded state only for the currently open selection scope', () => {
    const menu: HtmlTableContextMenuState = {
      visible: true,
      open: true,
      scope: 'row',
      anchor: {
        left: 10,
        top: 90,
      },
      actions: [],
      groups: [],
      primaryAction: null,
    };

    expect(isHtmlTableContextMenuExpandedForScope(menu, 'row')).toBe(true);
    expect(isHtmlTableContextMenuExpandedForScope(menu, 'table')).toBe(false);
    expect(isHtmlTableContextMenuExpandedForScope({ ...menu, open: false }, 'row')).toBe(false);
  });

  it('only exposes aria-controls when the related context menu is expanded', () => {
    expect(getHtmlTableContextMenuAriaControls('pmht-menu-1', true)).toBe('pmht-menu-1');
    expect(getHtmlTableContextMenuAriaControls('pmht-menu-1', false)).toBeNull();
  });

  it('derives dynamic handle text for idle, selected, and expanded menu states', () => {
    expect(getHtmlTableOverlayHandleText('row', 1, false, false, null)).toEqual({
      label: 'Select row 2',
      title: 'Select row 2',
    });
    expect(getHtmlTableOverlayHandleText('column', 0, true, false, null)).toEqual({
      label: 'Column 1 actions',
      title: 'Open actions for column 1',
    });
    expect(getHtmlTableOverlayHandleText('table', null, true, true, 'Add caption')).toEqual({
      label: 'Table actions',
      title: 'Table actions: Add caption',
    });
  });

  it('derives context menu action render state for active and primary items', () => {
    expect(getHtmlTableContextMenuActionRenderState(
      {
        active: true,
        destructive: false,
      },
      {
        role: 'menuitem',
        checked: null,
      },
      true,
    )).toEqual({
      role: 'menuitem',
      checked: null,
      current: 'true',
      primary: true,
      destructive: false,
      active: true,
    });

    expect(getHtmlTableContextMenuActionRenderState(
      {
        destructive: true,
      },
      {
        role: 'menuitem',
        checked: null,
      },
      false,
    )).toEqual({
      role: 'menuitem',
      checked: null,
      current: 'false',
      primary: false,
      destructive: true,
      active: false,
    });
  });

  it('derives cell context trigger render state from cell menu state', () => {
    const menu: HtmlTableContextMenuState = {
      visible: true,
      open: true,
      scope: 'cell',
      anchor: {
        left: 10,
        top: 90,
      },
      actions: [],
      groups: [],
      primaryAction: {
        id: 'clearSelectedCells',
        label: 'Clear selected cells',
        scope: 'cell',
        enabled: true,
      },
    };

    expect(getHtmlTableCellContextTriggerRenderState(menu)).toEqual({
      visible: true,
      expanded: true,
      label: 'Cell actions',
      title: 'Cell actions: Clear selected cells',
      primaryActionId: 'clearSelectedCells',
    });

    expect(
      getHtmlTableCellContextTriggerRenderState({
        ...menu,
        scope: 'row',
        open: false,
      }),
    ).toEqual({
      visible: false,
      expanded: false,
      label: null,
      title: null,
      primaryActionId: null,
    });
  });

  it('keeps the context menu open for trigger, cell handle, and menu clicks, and closes it for outside targets', () => {
    const triggerChild = {} as EventTarget;
    const cellHandleChild = {} as EventTarget;
    const menuChild = {} as EventTarget;
    const outside = {} as EventTarget;
    const trigger = {
      contains(candidate: unknown) {
        return candidate === this || candidate === triggerChild;
      },
    } as HTMLButtonElement;
    const cellHandle = {
      contains(candidate: unknown) {
        return candidate === this || candidate === cellHandleChild;
      },
    } as HTMLButtonElement;
    const menu = {
      contains(candidate: unknown) {
        return candidate === this || candidate === menuChild;
      },
    } as HTMLDivElement;

    expect(shouldCloseHtmlTableContextMenuForTarget(trigger, trigger, cellHandle, menu)).toBe(false);
    expect(shouldCloseHtmlTableContextMenuForTarget(triggerChild, trigger, cellHandle, menu)).toBe(false);
    expect(shouldCloseHtmlTableContextMenuForTarget(cellHandle, trigger, cellHandle, menu)).toBe(false);
    expect(shouldCloseHtmlTableContextMenuForTarget(cellHandleChild, trigger, cellHandle, menu)).toBe(false);
    expect(shouldCloseHtmlTableContextMenuForTarget(menu, trigger, cellHandle, menu)).toBe(false);
    expect(shouldCloseHtmlTableContextMenuForTarget(menuChild, trigger, cellHandle, menu)).toBe(false);
    expect(shouldCloseHtmlTableContextMenuForTarget(outside, trigger, cellHandle, menu)).toBe(true);
    expect(shouldCloseHtmlTableContextMenuForTarget(null, trigger, cellHandle, menu)).toBe(true);
  });

  it('uses Escape as the context menu dismiss key', () => {
    expect(isHtmlTableContextMenuDismissKey('Escape')).toBe(true);
    expect(isHtmlTableContextMenuDismissKey('Enter')).toBe(false);
    expect(isHtmlTableContextMenuDismissKey('Tab')).toBe(false);
  });

  it('uses Tab as the context menu exit key', () => {
    expect(isHtmlTableContextMenuExitKey('Tab')).toBe(true);
    expect(isHtmlTableContextMenuExitKey('Escape')).toBe(false);
    expect(isHtmlTableContextMenuExitKey('Enter')).toBe(false);
  });

  it('recognizes context menu navigation keys', () => {
    expect(isHtmlTableContextMenuNavigationKey('ArrowDown')).toBe(true);
    expect(isHtmlTableContextMenuNavigationKey('ArrowUp')).toBe(true);
    expect(isHtmlTableContextMenuNavigationKey('Home')).toBe(true);
    expect(isHtmlTableContextMenuNavigationKey('End')).toBe(true);
    expect(isHtmlTableContextMenuNavigationKey('Escape')).toBe(false);
  });

  it('recognizes printable keys for context menu typeahead', () => {
    expect(isHtmlTableContextMenuTypeaheadKey({ key: 'a' })).toBe(true);
    expect(isHtmlTableContextMenuTypeaheadKey({ key: 'A' })).toBe(true);
    expect(isHtmlTableContextMenuTypeaheadKey({ key: ' ', altKey: false })).toBe(false);
    expect(isHtmlTableContextMenuTypeaheadKey({ key: 'ArrowDown' })).toBe(false);
    expect(isHtmlTableContextMenuTypeaheadKey({ key: 'f', ctrlKey: true })).toBe(false);
  });

  it('derives the next focusable context menu action index for keyboard navigation', () => {
    expect(getNextHtmlTableContextMenuActionIndex(-1, 3, 'ArrowDown')).toBe(0);
    expect(getNextHtmlTableContextMenuActionIndex(-1, 3, 'ArrowUp')).toBe(2);
    expect(getNextHtmlTableContextMenuActionIndex(0, 3, 'ArrowDown')).toBe(1);
    expect(getNextHtmlTableContextMenuActionIndex(0, 3, 'ArrowUp')).toBe(2);
    expect(getNextHtmlTableContextMenuActionIndex(1, 3, 'Home')).toBe(0);
    expect(getNextHtmlTableContextMenuActionIndex(1, 3, 'End')).toBe(2);
    expect(getNextHtmlTableContextMenuActionIndex(1, 0, 'ArrowDown')).toBe(-1);
  });

  it('finds the next matching action index for context menu typeahead', () => {
    const labels = ['Add row before', 'Add row after', 'Delete row', 'Duplicate row'];

    expect(getNextHtmlTableContextMenuTypeaheadIndex(labels, -1, 'a')).toBe(0);
    expect(getNextHtmlTableContextMenuTypeaheadIndex(labels, 0, 'a')).toBe(1);
    expect(getNextHtmlTableContextMenuTypeaheadIndex(labels, 1, 'du')).toBe(3);
    expect(getNextHtmlTableContextMenuTypeaheadIndex(labels, 3, 'de')).toBe(2);
    expect(getNextHtmlTableContextMenuTypeaheadIndex(labels, 1, 'zz')).toBe(-1);
  });

  it('treats detail-less click events as keyboard activation', () => {
    expect(isHtmlTableKeyboardClick({ detail: 0 })).toBe(true);
    expect(isHtmlTableKeyboardClick({ detail: 1 })).toBe(false);
  });

  it('restores context menu focus only to connected visible controls', () => {
    const connected = {
      isConnected: true,
      hidden: false,
      tabIndex: 0,
    } as HTMLButtonElement;
    expect(canRestoreHtmlTableContextMenuFocus(connected)).toBe(true);

    connected.hidden = true;
    expect(canRestoreHtmlTableContextMenuFocus(connected)).toBe(false);
    connected.hidden = false;
    connected.tabIndex = -1;
    expect(canRestoreHtmlTableContextMenuFocus(connected)).toBe(false);
    expect(canRestoreHtmlTableContextMenuFocus({
      isConnected: false,
      hidden: false,
      tabIndex: 0,
    } as HTMLButtonElement)).toBe(false);
    expect(canRestoreHtmlTableContextMenuFocus(null)).toBe(false);
  });

  it('toggles the context menu directly from selected row and column handles', () => {
    const rowInteraction = createInteractionState({
      selectedAxis: {
        kind: 'row',
        index: 1,
        tablePos: 5,
      },
      selectedAxisExplicit: true,
    });
    const columnInteraction = createInteractionState({
      selectedAxis: {
        kind: 'column',
        index: 2,
        tablePos: 5,
      },
      selectedAxisExplicit: true,
    });

    expect(shouldToggleHtmlTableContextMenuFromAxisHandle(rowInteraction, 'row', 1, 5)).toBe(true);
    expect(shouldToggleHtmlTableContextMenuFromAxisHandle(rowInteraction, 'row', 0, 5)).toBe(false);
    expect(shouldToggleHtmlTableContextMenuFromAxisHandle(rowInteraction, 'column', 1, 5)).toBe(false);
    expect(shouldToggleHtmlTableContextMenuFromAxisHandle(columnInteraction, 'column', 2, 5)).toBe(true);
    expect(shouldToggleHtmlTableContextMenuFromAxisHandle(columnInteraction, 'column', 2, 9)).toBe(false);
  });

  it('keeps axis handles hovered when the pointer moves onto table chrome', () => {
    const interaction = createInteractionState({
      hovered: {
        kind: 'table',
        tablePos: 5,
        rowIndex: 1,
        columnIndex: 2,
      },
    });

    expect(isHtmlTableAxisHandleHovered(interaction, 'row', 5, 1)).toBe(true);
    expect(isHtmlTableAxisHandleHovered(interaction, 'column', 5, 2)).toBe(true);
    expect(isHtmlTableAxisHandleHovered(interaction, 'row', 5, 0)).toBe(false);
    expect(isHtmlTableAxisHandleHovered(interaction, 'column', 9, 2)).toBe(false);
  });

  it('toggles the context menu directly from the selected table handle', () => {
    const selectedTable = createInteractionState({
      activeTable: {
        tablePos: 5,
        table: {} as never,
      },
      tableSelected: true,
    });
    const unselectedTable = createInteractionState({
      activeTable: {
        tablePos: 5,
        table: {} as never,
      },
    });

    expect(shouldToggleHtmlTableContextMenuFromTableHandle(selectedTable, 5)).toBe(true);
    expect(shouldToggleHtmlTableContextMenuFromTableHandle(selectedTable, 9)).toBe(false);
    expect(shouldToggleHtmlTableContextMenuFromTableHandle(unselectedTable, 5)).toBe(false);
  });
});
