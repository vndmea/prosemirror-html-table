import { describe, expect, it } from 'vitest';

import {
  canToggleTableContextTriggerMenu,
  getScopedTableMenuToggleAction,
  getTableMenuAnchorForElement,
  getTableMenuToggleAction,
} from './menu-controller.js';

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
});
