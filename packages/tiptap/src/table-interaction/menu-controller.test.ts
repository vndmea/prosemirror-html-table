import { describe, expect, it } from 'vitest';

import {
  canToggleTableContextTriggerMenu,
  closeTableContextSubmenu,
  consumeTableContextSubmenuAutoFocus,
  consumeTableContextSubmenuTriggerToFocus,
  createTableContextMenuActionButton,
  createTableContextMenuPanel,
  createTableContextMenuSubmenuButton,
  createTableContextSubmenuState,
  getTableMenuLiveAnchor,
  openTableContextSubmenu,
  positionTableContextMenuElement,
  positionTableContextSubmenuElement,
  resolveOpenTableContextSubmenu,
  syncTableContextSubmenuTriggerExpandedState,
  getScopedTableMenuToggleAction,
  getTableMenuAnchorForElement,
  getTableMenuToggleAction,
} from './menu-controller.js';

function createMockButton() {
  const attributes = new Map<string, string>();
  const classes = new Set<string>();
  const button = {
    attributes,
    children: [] as unknown[],
    className: '',
    classList: {
      contains: (name: string) => classes.has(name),
      toggle: (name: string, enabled: boolean) => {
        if (enabled) {
          classes.add(name);
        } else {
          classes.delete(name);
        }
      },
    },
    dataset: {} as Record<string, string>,
    disabled: false,
    hidden: false,
    isConnected: true,
    setAttribute(name: string, value: string) {
      attributes.set(name, value);
    },
    getAttribute(name: string) {
      return attributes.get(name) ?? null;
    },
    removeAttribute(name: string) {
      attributes.delete(name);
    },
    addEventListener() {},
    append(...children: unknown[]) {
      button.children.push(...children);
    },
    querySelectorAll(selector: string) {
      if (selector !== 'button[data-submenu-id]') {
        return [];
      }

      return button.children.filter((child): child is ReturnType<typeof createMockButton> => (
        typeof child === 'object' &&
        child !== null &&
        'dataset' in child &&
        typeof (child as { dataset?: { submenuId?: string } }).dataset?.submenuId === 'string'
      ));
    },
    style: {} as Record<string, string>,
    tabIndex: 0,
    textContent: '',
    type: 'button',
  };

  return button;
}

function createMockOwnerDocument() {
  return {
    createElement: () => createMockButton(),
  } as unknown as Document;
}

describe('shared table menu controller helpers', () => {
  it('computes a control anchor from the element center point', () => {
    expect(getTableMenuAnchorForElement({
      getBoundingClientRect: () => ({
        left: 10,
        top: 20,
        width: 40,
        height: 30,
      }) as DOMRect,
    })).toEqual({
      left: 30,
      top: 35,
    });
    expect(getTableMenuAnchorForElement(null)).toBeNull();
  });

  it('derives open or close actions for generic and scoped menus', () => {
    expect(getTableMenuToggleAction(false)).toBe('open');
    expect(getTableMenuToggleAction(true)).toBe('close');
    expect(getScopedTableMenuToggleAction(false, null, 'row')).toBe('open');
    expect(getScopedTableMenuToggleAction(true, 'row', 'row')).toBe('close');
    expect(getScopedTableMenuToggleAction(true, 'row', 'column')).toBe('open');
  });

  it('blocks context-trigger toggles when hidden or resizing', () => {
    expect(canToggleTableContextTriggerMenu(true)).toBe(true);
    expect(canToggleTableContextTriggerMenu(false)).toBe(false);
    expect(canToggleTableContextTriggerMenu(true, { blockedByResize: true })).toBe(false);
  });

  it('tracks shared submenu state transitions', () => {
    const state = createTableContextSubmenuState();
    expect(openTableContextSubmenu(state, 'color', true)).toBe(true);
    expect(state.openSubmenuId).toBe('color');
    expect(consumeTableContextSubmenuAutoFocus(state)).toBe(true);
    expect(consumeTableContextSubmenuAutoFocus(state)).toBe(false);
    expect(openTableContextSubmenu(state, 'color', true)).toBe(false);
    expect(closeTableContextSubmenu(state, true)).toBe('color');
    expect(state.openSubmenuId).toBeNull();
    expect(consumeTableContextSubmenuTriggerToFocus(state)).toBe('color');
    expect(consumeTableContextSubmenuTriggerToFocus(state)).toBeNull();
  });

  it('builds shared menu panels and updates submenu trigger state', () => {
    const ownerDocument = createMockOwnerDocument();
    const button = createTableContextMenuSubmenuButton(ownerDocument, {
      className: 'submenu-button',
      expanded: false,
      key: 'alignment',
      label: 'Alignment',
      testId: 'submenu-button',
    });
    const panel = createTableContextMenuPanel(ownerDocument, {
      createElement: () => button,
      entries: [{ kind: 'submenu' as const, key: 'alignment' }],
      groupClassName: 'panel',
      groupName: 'cell',
    });
    expect(panel.dataset.group).toBe('cell');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    syncTableContextSubmenuTriggerExpandedState(panel, 'alignment');
    expect(button.getAttribute('aria-expanded')).toBe('true');
  });

  it('creates shared action buttons and resolves open submenu entries', () => {
    const ownerDocument = createMockOwnerDocument();
    const actionButton = createTableContextMenuActionButton(ownerDocument, {
      actionId: 'delete-row',
      active: true,
      className: 'action-button',
      destructive: true,
      label: 'Delete row',
      testId: 'action-button',
    });
    expect(actionButton.dataset.actionId).toBe('delete-row');
    expect(actionButton.classList.contains('is-active')).toBe(true);
    expect(actionButton.classList.contains('is-destructive')).toBe(true);

    expect(resolveOpenTableContextSubmenu([
      {
        items: [],
        key: 'structure',
        kind: 'submenu',
        label: 'Structure',
      },
    ], 'structure')?.label).toBe('Structure');
  });

  it('reuses live anchors and positioning helpers', () => {
    const selected = {
      getBoundingClientRect: () => ({ left: 20, top: 40, width: 10, height: 20 }) as DOMRect,
    };
    const root = {
      querySelector: () => selected,
    };
    expect(getTableMenuLiveAnchor(root, 'row', { left: 1, top: 2 }, {
      row: ['button.is-selected'],
    })).toEqual({ left: 25, top: 50 });
    expect(getTableMenuLiveAnchor(root, 'cell', { left: 7, top: 9 }, {
      cell: [],
    })).toEqual({ left: 7, top: 9 });

    const menu = {
      dataset: {} as Record<string, string>,
      offsetHeight: 80,
      offsetWidth: 120,
      style: {
        removeProperty() {},
      } as unknown as CSSStyleDeclaration,
    } as HTMLDivElement;
    positionTableContextMenuElement(menu, {
      anchor: { left: 70, top: 90 },
      bounds: { left: 0, top: 0, right: 200, bottom: 200 },
      hostRect: { left: 10, top: 20 } as DOMRect,
      scope: 'cell',
    });
    expect(menu.style.left).not.toBe('');
    expect(menu.dataset.placement).not.toBe('');

    const submenu = {
      dataset: {} as Record<string, string>,
      offsetHeight: 60,
      offsetWidth: 100,
      style: {
        removeProperty() {},
      } as unknown as CSSStyleDeclaration,
    } as HTMLDivElement;
    positionTableContextSubmenuElement(submenu, {
      bounds: { left: 0, top: 0, right: 240, bottom: 240 },
      gap: 6,
      hostRect: { left: 10, top: 20 } as DOMRect,
      triggerRect: { left: 80, right: 120, top: 70 } as Pick<DOMRect, 'left' | 'right' | 'top'>,
    });
    expect(submenu.style.top).not.toBe('');
    expect(submenu.dataset.placement).not.toBe('');
  });
});
