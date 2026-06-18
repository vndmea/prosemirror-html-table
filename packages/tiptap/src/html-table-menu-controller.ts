import { NodeSelection } from '@tiptap/pm/state';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import {
  CellSelection,
  distributeColumns,
  fitTableToWidth,
} from 'prosemirror-html-table';

import {
  getHtmlTableContextActionMenuItemState,
  getHtmlTableContextActionShortcutState,
  type HtmlTableContextActionId,
} from './html-table-actions.js';
import {
  getHtmlTableContextMenuState,
  runHtmlTableContextMenuAction,
  type HtmlTableContextMenuState,
  type HtmlTableContextTriggerButtonState,
} from './html-table-context-menu.js';
import {
  getHtmlTableInteractionState,
  type HtmlTableInteractionState,
  htmlTableInteractionPluginKey,
} from './html-table-interaction.js';
import {
  getHtmlTableContextMenuPosition,
  getHtmlTableContextSubmenuPosition,
  getHtmlTableContextSubmenuTransformOrigin,
  getHtmlTableContextMenuTransformOrigin,
  getHtmlTableOverlayViewportBounds,
  getHtmlTableSelectionScope,
  type HtmlTableSelectionScope,
} from './html-table-overlay-geometry.js';
import {
  createTableContextMenuElement,
  focusMenuButtonWithoutScroll,
  getEnabledMenuButtons,
  MenuTypeaheadController,
  canRestoreMenuFocus,
  getTableMenuToggleAction,
  getNextMenuActionIndex,
  isKeyboardClick,
  isMenuDismissKey,
  isMenuExitKey,
  isMenuNavigationKey,
  isMenuTypeaheadKey,
  shouldCloseMenuForTarget,
} from './table-interaction/menu-controller.js';
import { getRenderedHtmlTableContext } from './table-dom.js';
import {
  createColumnSelectionTransaction,
  createRowSelectionTransaction,
  getTableSelectionInfo,
} from './table-utils.js';

const SUBMENU_GAP = 6;

const MENU_SCOPE_LABELS: Record<HtmlTableSelectionScope, string> = {
  table: 'Table actions',
  row: 'Row actions',
  column: 'Column actions',
  cell: 'Cell actions',
};

const COLOR_ACTION_IDS: HtmlTableContextActionId[] = [
  'setCellBackgroundColorBlue',
  'setCellBackgroundColorGreen',
  'setCellBackgroundColorYellow',
  'clearCellBackgroundColor',
];

const ALIGNMENT_ACTION_IDS: HtmlTableContextActionId[] = [
  'setCellTextAlignLeft',
  'setCellTextAlignCenter',
  'setCellTextAlignRight',
  'setCellVerticalAlignTop',
  'setCellVerticalAlignMiddle',
  'setCellVerticalAlignBottom',
];

const CELL_STRUCTURE_ACTION_IDS: HtmlTableContextActionId[] = [
  'mergeCells',
  'splitCell',
  'toggleHeaderCell',
];

interface HtmlTableActionSummary {
  id: HtmlTableContextActionId;
  label: string;
  scope: HtmlTableSelectionScope;
  enabled: boolean;
  active?: boolean;
  destructive?: boolean;
}

export interface HtmlTableContextTriggerRenderState {
  visible: boolean;
  left: number | null;
  top: number | null;
  expanded: boolean;
  label: string | null;
  title: string | null;
  scope: HtmlTableSelectionScope | null;
  primaryActionId: string | null;
}

export interface HtmlTableContextMenuRenderState {
  visible: boolean;
  left: number | null;
  top: number | null;
  scope: HtmlTableSelectionScope | null;
  primaryActionId: string | null;
  groupCount: number;
}

export interface HtmlTableCellContextTriggerRenderState {
  visible: boolean;
  expanded: boolean;
  label: string | null;
  title: string | null;
  primaryActionId: string | null;
}

export interface HtmlTableOverlayHandleText {
  label: string;
  title: string;
}

export interface HtmlTableContextMenuActionRenderState {
  role: string;
  checked: 'true' | 'false' | null;
  current: 'true' | 'false';
  primary: boolean;
  destructive: boolean;
  active: boolean;
}

export interface HtmlTableContextMenuHeaderState {
  label: string | null;
  detail: string | null;
}

export interface HtmlTableContextMenuAccessibleState {
  labelledBy: string | null;
  describedBy: string | null;
}

export interface HtmlTableContextMenuGroupAccessibleState {
  labelId: string;
}

interface HtmlTableContextMenuActionEntry {
  kind: 'action';
  key: string;
  label: string;
  actionId: HtmlTableContextActionId;
  enabled: boolean;
  active: boolean;
  primary: boolean;
  destructive: boolean;
  shortcut: string | null;
}

interface HtmlTableContextMenuSubmenuEntry {
  kind: 'submenu';
  key: string;
  label: string;
  items: HtmlTableContextMenuActionEntry[];
}

type HtmlTableContextMenuEntry = HtmlTableContextMenuActionEntry | HtmlTableContextMenuSubmenuEntry;

type HtmlTableMenuContext =
  | { scope: 'table'; tablePos: number }
  | { scope: 'row'; tablePos: number; rowIndex: number }
  | { scope: 'column'; tablePos: number; columnIndex: number }
  | { scope: 'cell'; tablePos: number; anchorCellPos: number; headCellPos: number };

interface HtmlTableMenuControllerOptions {
  getView: () => EditorView;
  root: HTMLDivElement;
  contextMenuId: string;
  contextMenu: HTMLDivElement;
  contextTriggerButton: HTMLButtonElement;
  cellSelectionHandle: HTMLButtonElement;
  suppressPointerClick: () => void;
}

export function getHtmlTableContextTriggerRenderState(
  trigger: HtmlTableContextTriggerButtonState,
): HtmlTableContextTriggerRenderState {
  return {
    visible: trigger.visible,
    left: trigger.anchor?.left ?? null,
    top: trigger.anchor?.top ?? null,
    expanded: trigger.expanded,
    label: trigger.label,
    title: trigger.title,
    scope: trigger.scope,
    primaryActionId: trigger.primaryAction?.id ?? null,
  };
}

export function getHtmlTableContextMenuRenderState(
  menu: HtmlTableContextMenuState,
): HtmlTableContextMenuRenderState {
  return {
    visible: Boolean(menu.open && menu.anchor),
    left: menu.anchor?.left ?? null,
    top: menu.anchor?.top ?? null,
    scope: menu.scope,
    primaryActionId: menu.primaryAction?.id ?? null,
    groupCount: menu.groups.length,
  };
}

export function getHtmlTableContextMenuAriaControls(
  menuId: string,
  expanded: boolean,
): string | null {
  return expanded ? menuId : null;
}

export function getHtmlTableOverlayHandleText(
  kind: 'table' | 'row' | 'column',
  index: number | null,
  selected: boolean,
  expanded: boolean,
  primaryActionLabel: string | null,
): HtmlTableOverlayHandleText {
  const target =
    kind === 'table'
      ? 'Table'
      : kind === 'row'
        ? `Row ${index !== null ? index + 1 : ''}`.trim()
        : `Column ${index !== null ? index + 1 : ''}`.trim();
  const actionTarget =
    kind === 'table'
      ? 'table'
      : kind === 'row'
        ? `row ${index !== null ? index + 1 : ''}`.trim()
        : `column ${index !== null ? index + 1 : ''}`.trim();

  if (expanded) {
    const title = primaryActionLabel
      ? `${target} actions: ${primaryActionLabel}`
      : `${target} actions`;
    return {
      label: `${target} actions`,
      title,
    };
  }

  if (selected) {
    return {
      label: `${target} actions`,
      title: `Open actions for ${actionTarget}`,
    };
  }

  return {
    label: kind === 'table' ? 'Select table' : `Select ${actionTarget}`,
    title: kind === 'table' ? 'Select table' : `Select ${actionTarget}`,
  };
}

export function getHtmlTableContextMenuActionRenderState(
  action: {
    active?: boolean;
    destructive?: boolean;
  },
  menuItemState: {
    role: string;
    checked: boolean | null;
  },
  primary: boolean,
): HtmlTableContextMenuActionRenderState {
  return {
    role: menuItemState.role,
    checked:
      menuItemState.checked === null
        ? null
        : menuItemState.checked
          ? 'true'
          : 'false',
    current: primary ? 'true' : 'false',
    primary,
    destructive: Boolean(action.destructive),
    active: Boolean(action.active),
  };
}

export function getHtmlTableContextMenuHeaderState(
  menu: Pick<HtmlTableContextMenuState, 'scope' | 'primaryAction'>,
): HtmlTableContextMenuHeaderState {
  const label = menu.scope ? MENU_SCOPE_LABELS[menu.scope] : null;
  return {
    label,
    detail: menu.primaryAction?.label ?? null,
  };
}

export function getHtmlTableContextMenuAccessibleState(
  menuId: string,
  header: HtmlTableContextMenuHeaderState,
): HtmlTableContextMenuAccessibleState {
  return {
    labelledBy: header.label ? `${menuId}-title` : null,
    describedBy: header.detail ? `${menuId}-detail` : null,
  };
}

export function getHtmlTableContextMenuGroupAccessibleState(
  menuId: string,
  groupId: string,
): HtmlTableContextMenuGroupAccessibleState {
  return {
    labelId: `${menuId}-group-${groupId}`,
  };
}

export {
  canRestoreMenuFocus as canRestoreHtmlTableContextMenuFocus,
  getNextMenuActionIndex as getNextHtmlTableContextMenuActionIndex,
  getNextMenuTypeaheadIndex as getNextHtmlTableContextMenuTypeaheadIndex,
  isKeyboardClick as isHtmlTableKeyboardClick,
  isMenuDismissKey as isHtmlTableContextMenuDismissKey,
  isMenuExitKey as isHtmlTableContextMenuExitKey,
  isMenuNavigationKey as isHtmlTableContextMenuNavigationKey,
  isMenuTypeaheadKey as isHtmlTableContextMenuTypeaheadKey,
  shouldCloseMenuForTarget as shouldCloseHtmlTableContextMenuForTarget,
} from './table-interaction/menu-controller.js';

export function getHtmlTableCellContextTriggerRenderState(
  menu: HtmlTableContextMenuState,
): HtmlTableCellContextTriggerRenderState {
  const visible = menu.scope === 'cell';
  return {
    visible,
    expanded: visible && menu.visible && menu.open,
    label: visible ? 'Cell actions' : null,
    title:
      visible && menu.primaryAction
        ? `Cell actions: ${menu.primaryAction.label}`
        : visible
          ? 'Cell actions'
          : null,
    primaryActionId: visible ? menu.primaryAction?.id ?? null : null,
  };
}

export class HtmlTableMenuController {
  private readonly getView: () => EditorView;
  private readonly root: HTMLDivElement;
  private readonly contextMenuId: string;
  private readonly contextMenu: HTMLDivElement;
  private readonly contextSubmenu: HTMLDivElement;
  private readonly contextTriggerButton: HTMLButtonElement;
  private readonly cellSelectionHandle: HTMLButtonElement;
  private readonly suppressPointerClick: () => void;
  private readonly menuTypeahead = new MenuTypeaheadController();
  private lastContextMenuOpen = false;
  private contextMenuFocusTarget: HTMLButtonElement | null = null;
  private restoreContextMenuFocusOnClose = false;
  private contextMenuContext: HtmlTableMenuContext | null = null;
  private openContextSubmenuId: string | null = null;
  private focusFirstSubmenuActionOnOpen = false;
  private submenuTriggerToFocus: string | null = null;
  private lastHostRect: DOMRect | null = null;
  private lastViewportInset = 12;

  constructor(options: HtmlTableMenuControllerOptions) {
    this.getView = options.getView;
    this.root = options.root;
    this.contextMenuId = options.contextMenuId;
    this.contextMenu = options.contextMenu;
    this.contextSubmenu = this.createContextSubmenu();
    this.contextMenu.addEventListener('mouseover', (event) => this.handleMenuPointerOver(event));
    this.contextMenu.addEventListener('focusin', (event) => this.handleMenuFocusIn(event));
    this.contextTriggerButton = options.contextTriggerButton;
    this.cellSelectionHandle = options.cellSelectionHandle;
    this.suppressPointerClick = options.suppressPointerClick;
    this.root.append(this.contextSubmenu);
  }

  destroy(): void {
    this.menuTypeahead.destroy();
  }

  sync(menu: HtmlTableContextMenuState, hostRect: DOMRect, viewportInset: number): void {
    this.lastHostRect = hostRect;
    this.lastViewportInset = viewportInset;
    const renderState = getHtmlTableContextMenuRenderState(menu);
    const focusedMenuItemKey = this.getFocusedContextMenuItemKey();

    this.contextMenu.hidden = !renderState.visible;
    this.contextMenu.setAttribute('aria-hidden', String(!renderState.visible));
    this.contextMenu.dataset.scope = renderState.scope ?? '';
    this.contextMenu.dataset.primaryAction = renderState.primaryActionId ?? '';
    this.contextMenu.removeAttribute('aria-labelledby');
    this.contextMenu.removeAttribute('aria-describedby');

    if (!renderState.visible || renderState.left === null || renderState.top === null) {
      this.contextMenuContext = null;
      this.openContextSubmenuId = null;
      this.focusFirstSubmenuActionOnOpen = false;
      this.submenuTriggerToFocus = null;
      this.resetContextMenuTypeahead();
      this.restoreContextMenuFocusIfNeeded();
      this.contextMenu.replaceChildren();
      this.contextMenu.dataset.placement = '';
      this.contextMenu.style.removeProperty('left');
      this.contextMenu.style.removeProperty('top');
      this.contextMenu.style.removeProperty('max-height');
      this.contextMenu.style.removeProperty('transform-origin');
      this.hideContextSubmenu();
      this.lastContextMenuOpen = false;
      return;
    }

    if (!menu.open) {
      this.openContextSubmenuId = null;
    }

    const rootEntries = this.buildContextMenuEntries(menu);
    this.contextMenu.replaceChildren(this.buildContextMenuPanel(rootEntries, menu.scope ?? 'table', menu.primaryAction?.id ?? null));
    const menuWidth = this.contextMenu.offsetWidth;
    const menuHeight = this.contextMenu.offsetHeight;
    const defaultView = this.root.ownerDocument.defaultView;
    if (!defaultView) {
      return;
    }

    const viewportBounds = getHtmlTableOverlayViewportBounds(
      hostRect,
      defaultView.innerWidth,
      defaultView.innerHeight,
      viewportInset,
    );
    const availableHeight = Math.max(160, viewportBounds.bottom - viewportBounds.top);
    const position = getHtmlTableContextMenuPosition(
      renderState.scope ?? 'table',
      renderState.left - hostRect.left,
      renderState.top - hostRect.top,
      menuWidth,
      menuHeight,
      viewportBounds.left,
      viewportBounds.top,
      viewportBounds.right,
      viewportBounds.bottom,
    );

    this.contextMenu.style.left = `${position.left}px`;
    this.contextMenu.style.top = `${position.top}px`;
    this.contextMenu.style.maxHeight = `${availableHeight}px`;
    this.contextMenu.dataset.placement = position.placement;
    this.contextMenu.style.transformOrigin = getHtmlTableContextMenuTransformOrigin(position.placement);
    this.syncContextSubmenu(menu, hostRect, viewportBounds, availableHeight);
    this.restoreContextMenuFocus(menu, focusedMenuItemKey);
  }

  toggleFromControl(
    interaction: HtmlTableInteractionState,
    focusTarget: HTMLButtonElement | null,
  ): void {
    const nextOpen = getTableMenuToggleAction(interaction.contextMenuOpen) === 'open';
    this.contextMenuFocusTarget = focusTarget;
    this.restoreContextMenuFocusOnClose = !nextOpen;
    this.contextMenuContext = nextOpen ? this.captureContextMenuContext(interaction) : null;
    this.openContextSubmenuId = null;
    this.focusFirstSubmenuActionOnOpen = false;
    this.submenuTriggerToFocus = null;
    this.view.dispatch(
      this.view.state.tr.setMeta(htmlTableInteractionPluginKey, {
        contextMenuOpen: nextOpen,
      }),
    );
  }

  handleMenuMouseDown(event: MouseEvent): void {
    this.suppressPointerClick();
    this.runContextMenuActionFromEvent(event);
  }

  handleMenuPointerOver(event: MouseEvent): void {
    this.syncHoveredContextSubmenuFromEventTarget(event.target);
  }

  handleMenuFocusIn(event: FocusEvent): void {
    this.syncHoveredContextSubmenuFromEventTarget(event.target);
  }

  handleMenuClick(event: MouseEvent): void {
    if (!isKeyboardClick(event)) {
      return;
    }

    this.runContextMenuActionFromEvent(event);
  }

  handleMenuKeyDown(event: KeyboardEvent): void {
    if (isMenuExitKey(event.key)) {
      this.closeContextMenu(false);
      return;
    }

    if (isMenuDismissKey(event.key)) {
      if (this.openContextSubmenuId) {
        event.preventDefault();
        event.stopPropagation();
        this.closeContextSubmenu(true);
        return;
      }

      this.closeContextMenu(true);
      return;
    }

    const activePanel = this.getActiveContextMenuPanel();
    const enabledButtons = this.getEnabledContextMenuActionButtons(activePanel);
    if (enabledButtons.length === 0) {
      return;
    }

    if (isMenuNavigationKey(event.key)) {
      event.preventDefault();
      event.stopPropagation();

      const currentIndex = enabledButtons.findIndex((button) => button === this.root.ownerDocument.activeElement);
      const nextIndex = getNextMenuActionIndex(currentIndex, enabledButtons.length, event.key);
      if (enabledButtons[nextIndex]) {
        focusMenuButtonWithoutScroll(enabledButtons[nextIndex]);
      }
      return;
    }

    if (!isMenuTypeaheadKey(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const labels = enabledButtons.map((button) => button.textContent?.trim() ?? '');
    const currentIndex = enabledButtons.findIndex((button) => button === this.root.ownerDocument.activeElement);
    const nextIndex = this.menuTypeahead.advance(labels, currentIndex, event.key);
    if (nextIndex < 0) {
      return;
    }

    if (enabledButtons[nextIndex]) {
      focusMenuButtonWithoutScroll(enabledButtons[nextIndex]);
    }
  }

  handleDocumentMouseDown(event: MouseEvent): void {
    const interaction = getHtmlTableInteractionState(this.view.state);
    if (!interaction.contextMenuOpen) {
      return;
    }

    if (!shouldCloseMenuForTarget(
      event.target,
      this.contextTriggerButton,
      this.cellSelectionHandle,
      this.contextMenu,
      this.contextSubmenu,
    )) {
      return;
    }

    this.closeContextMenu(false);
  }

  handleDocumentKeyDown(event: KeyboardEvent): void {
    const interaction = getHtmlTableInteractionState(this.view.state);
    if (!interaction.contextMenuOpen || !isMenuDismissKey(event.key)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.closeContextMenu(true);
  }

  private get view(): EditorView {
    return this.getView();
  }

  private createContextSubmenu(): HTMLDivElement {
    return createTableContextMenuElement(this.root.ownerDocument, {
      className: 'html-table-overlay__context-menu html-table-overlay__context-menu--submenu',
      id: `${this.contextMenuId}-submenu`,
      testId: 'pmht-context-submenu',
      onMouseDown: (event) => this.handleMenuMouseDown(event),
      onClick: (event) => this.handleMenuClick(event),
      onKeyDown: (event) => this.handleMenuKeyDown(event),
      onMouseOver: (event) => this.handleMenuPointerOver(event),
      onFocusIn: (event) => this.handleMenuFocusIn(event),
    });
  }

  private buildContextMenuEntries(menu: HtmlTableContextMenuState): HtmlTableContextMenuEntry[] {
    if (menu.scope === 'cell') {
      return this.buildCellContextMenuEntries(menu);
    }

    if (menu.scope === 'row') {
      return this.buildRowContextMenuEntries(menu);
    }

    if (menu.scope === 'column') {
      return this.buildColumnContextMenuEntries(menu);
    }

    return menu.groups.flatMap((group) =>
      group.actions.map((action) => this.createActionEntry(action, menu.primaryAction?.id === action.id)),
    );
  }

  private buildCellContextMenuEntries(menu: HtmlTableContextMenuState): HtmlTableContextMenuEntry[] {
    const actionsById = this.getActionsById(menu);
    const entries: HtmlTableContextMenuEntry[] = [];

    this.appendSubmenuEntry(entries, 'color', 'Color', COLOR_ACTION_IDS, actionsById, menu.primaryAction?.id ?? null);
    this.appendSubmenuEntry(entries, 'alignment', 'Alignment', ALIGNMENT_ACTION_IDS, actionsById, menu.primaryAction?.id ?? null);
    this.appendSubmenuEntry(entries, 'structure', 'Structure', CELL_STRUCTURE_ACTION_IDS, actionsById, menu.primaryAction?.id ?? null);
    this.appendActionEntry(entries, actionsById, 'clearSelectedCells', menu.primaryAction?.id ?? null);

    return entries;
  }

  private buildRowContextMenuEntries(menu: HtmlTableContextMenuState): HtmlTableContextMenuEntry[] {
    const actionsById = this.getActionsById(menu);
    const entries: HtmlTableContextMenuEntry[] = [];

    this.appendActionEntry(entries, actionsById, 'toggleHeaderRow', menu.primaryAction?.id ?? null);
    this.appendActionEntry(entries, actionsById, 'addRowBefore', menu.primaryAction?.id ?? null);
    this.appendActionEntry(entries, actionsById, 'addRowAfter', menu.primaryAction?.id ?? null);
    this.appendSubmenuEntry(entries, 'color', 'Color', COLOR_ACTION_IDS, actionsById, menu.primaryAction?.id ?? null);
    this.appendSubmenuEntry(entries, 'alignment', 'Alignment', ALIGNMENT_ACTION_IDS, actionsById, menu.primaryAction?.id ?? null);
    this.appendActionEntry(entries, actionsById, 'moveRowUp', menu.primaryAction?.id ?? null);
    this.appendActionEntry(entries, actionsById, 'moveRowDown', menu.primaryAction?.id ?? null);
    this.appendActionEntry(entries, actionsById, 'moveRowToHead', menu.primaryAction?.id ?? null);
    this.appendActionEntry(entries, actionsById, 'moveRowToBody', menu.primaryAction?.id ?? null);
    this.appendActionEntry(entries, actionsById, 'moveRowToFoot', menu.primaryAction?.id ?? null);
    this.appendActionEntry(entries, actionsById, 'clearRowContent', menu.primaryAction?.id ?? null);
    this.appendActionEntry(entries, actionsById, 'duplicateRow', menu.primaryAction?.id ?? null);
    this.appendActionEntry(entries, actionsById, 'deleteRow', menu.primaryAction?.id ?? null);

    return entries;
  }

  private buildColumnContextMenuEntries(menu: HtmlTableContextMenuState): HtmlTableContextMenuEntry[] {
    const actionsById = this.getActionsById(menu);
    const entries: HtmlTableContextMenuEntry[] = [];

    this.appendActionEntry(entries, actionsById, 'moveColumnLeft', menu.primaryAction?.id ?? null);
    this.appendActionEntry(entries, actionsById, 'moveColumnRight', menu.primaryAction?.id ?? null);
    this.appendActionEntry(entries, actionsById, 'addColumnBefore', menu.primaryAction?.id ?? null);
    this.appendActionEntry(entries, actionsById, 'addColumnAfter', menu.primaryAction?.id ?? null);
    this.appendActionEntry(entries, actionsById, 'sortBodyRowsAsc', menu.primaryAction?.id ?? null);
    this.appendActionEntry(entries, actionsById, 'sortBodyRowsDesc', menu.primaryAction?.id ?? null);
    this.appendSubmenuEntry(entries, 'color', 'Color', COLOR_ACTION_IDS, actionsById, menu.primaryAction?.id ?? null);
    this.appendSubmenuEntry(entries, 'alignment', 'Alignment', ALIGNMENT_ACTION_IDS, actionsById, menu.primaryAction?.id ?? null);
    this.appendActionEntry(entries, actionsById, 'clearColumnContent', menu.primaryAction?.id ?? null);
    this.appendActionEntry(entries, actionsById, 'duplicateColumn', menu.primaryAction?.id ?? null);
    this.appendActionEntry(entries, actionsById, 'toggleHeaderColumn', menu.primaryAction?.id ?? null);
    this.appendActionEntry(entries, actionsById, 'deleteColumn', menu.primaryAction?.id ?? null);

    return entries;
  }

  private getActionsById(
    menu: HtmlTableContextMenuState,
  ): Map<HtmlTableContextActionId, HtmlTableContextMenuState['actions'][number]> {
    return new Map(menu.actions.map((action) => [action.id, action]));
  }

  private appendActionEntry(
    entries: HtmlTableContextMenuEntry[],
    actionsById: Map<HtmlTableContextActionId, HtmlTableContextMenuState['actions'][number]>,
    actionId: HtmlTableContextActionId,
    primaryActionId: string | null,
  ): void {
    const action = actionsById.get(actionId);
    if (!action) {
      return;
    }

    entries.push(this.createActionEntry(action, primaryActionId === action.id));
  }

  private appendSubmenuEntry(
    entries: HtmlTableContextMenuEntry[],
    key: string,
    label: string,
    actionIds: HtmlTableContextActionId[],
    actionsById: Map<HtmlTableContextActionId, HtmlTableContextMenuState['actions'][number]>,
    primaryActionId: string | null,
  ): void {
    const items = actionIds
      .map((actionId) => actionsById.get(actionId))
      .filter((action): action is HtmlTableContextMenuState['actions'][number] => Boolean(action))
      .map((action) => this.createActionEntry(action, primaryActionId === action.id));

    if (items.length === 0) {
      return;
    }

    entries.push({
      kind: 'submenu',
      key,
      label,
      items,
    });
  }

  private buildContextMenuPanel(
    entries: HtmlTableContextMenuEntry[],
    scope: HtmlTableSelectionScope,
    primaryActionId: string | null,
  ): HTMLElement {
    const groupElement = this.root.ownerDocument.createElement('div');
    groupElement.className = 'html-table-overlay__context-menu-group html-table-overlay__context-menu-group--stack';
    groupElement.dataset.group = scope;
    groupElement.setAttribute('role', 'group');

    for (const entry of entries) {
      groupElement.append(
        entry.kind === 'submenu'
          ? this.createContextMenuSubmenuButton(entry)
          : this.createContextMenuActionButton(
              {
                id: entry.actionId,
                label: entry.label,
                scope,
                enabled: entry.enabled,
                active: entry.active,
                destructive: entry.destructive,
              },
              primaryActionId === entry.actionId,
              entry.shortcut,
            ),
      );
    }

    return groupElement;
  }

  private createContextMenuSubmenuButton(entry: HtmlTableContextMenuSubmenuEntry): HTMLButtonElement {
    const button = this.root.ownerDocument.createElement('button');
    button.type = 'button';
    button.className = 'html-table-overlay__context-menu-action has-submenu';
    button.dataset.menuKey = entry.key;
    button.dataset.submenuId = entry.key;
    button.dataset.testid = 'pmht-context-menu-action';
    button.setAttribute('role', 'menuitem');
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-expanded', this.openContextSubmenuId === entry.key ? 'true' : 'false');
    button.textContent = entry.label;
    return button;
  }

  private createContextMenuActionButton(
    action: HtmlTableActionSummary,
    primary: boolean,
    ariaKeyshortcutsOverride?: string | null,
  ): HTMLButtonElement {
    const menuItemState = getHtmlTableContextActionMenuItemState(action);
    const shortcutState = ariaKeyshortcutsOverride !== undefined
      ? { ariaKeyshortcuts: ariaKeyshortcutsOverride }
      : getHtmlTableContextActionShortcutState(action);
    const renderState = getHtmlTableContextMenuActionRenderState(action, menuItemState, primary);
    const button = this.root.ownerDocument.createElement('button');
    button.type = 'button';
    button.className = 'html-table-overlay__context-menu-action';
    button.dataset.actionId = action.id;
    button.dataset.menuKey = action.id;
    button.dataset.testid = 'pmht-context-menu-action';
    button.disabled = !action.enabled;
    button.textContent = action.label;
    button.setAttribute('role', renderState.role);
    if (shortcutState.ariaKeyshortcuts) {
      button.setAttribute('aria-keyshortcuts', shortcutState.ariaKeyshortcuts);
    } else {
      button.removeAttribute('aria-keyshortcuts');
    }
    button.removeAttribute('aria-checked');
    button.setAttribute('aria-current', renderState.current);
    button.classList.toggle('is-destructive', renderState.destructive);
    return button;
  }

  private createActionEntry(
    action: HtmlTableContextMenuState['actions'][number],
    primary: boolean,
  ): HtmlTableContextMenuActionEntry {
    return {
      kind: 'action',
      key: action.id,
      label: this.getContextActionDisplayLabel(action.id, action.label),
      actionId: action.id,
      enabled: action.enabled,
      active: Boolean(action.active),
      primary,
      destructive: Boolean(action.destructive),
      shortcut: getHtmlTableContextActionShortcutState(action).ariaKeyshortcuts,
    };
  }

  private getContextActionDisplayLabel(actionId: HtmlTableContextActionId, fallback: string): string {
    if (actionId === 'clearSelectedCells') {
      return 'Clear contents';
    }

    if (actionId === 'clearCellBackgroundColor') {
      return 'Clear color';
    }

    return fallback;
  }

  private syncContextSubmenu(
    menu: HtmlTableContextMenuState,
    hostRect: DOMRect,
    viewportBounds: ReturnType<typeof getHtmlTableOverlayViewportBounds>,
    availableHeight: number,
  ): void {
    const submenu = this.resolveOpenContextSubmenu(menu);
    if (!submenu) {
      this.hideContextSubmenu();
      return;
    }

    const trigger = this.contextMenu.querySelector<HTMLButtonElement>(`button[data-submenu-id="${submenu.key}"]`);
    if (!trigger) {
      this.openContextSubmenuId = null;
      this.hideContextSubmenu();
      return;
    }

    this.contextSubmenu.replaceChildren(
      this.buildContextMenuPanel(submenu.items, menu.scope ?? 'cell', menu.primaryAction?.id ?? null),
    );
    this.contextSubmenu.hidden = false;
    this.contextSubmenu.setAttribute('aria-hidden', 'false');
    this.contextSubmenu.dataset.scope = menu.scope ?? '';
    this.contextSubmenu.style.maxHeight = `${availableHeight}px`;

    const triggerRect = trigger.getBoundingClientRect();
    const submenuWidth = this.contextSubmenu.offsetWidth;
    const submenuHeight = this.contextSubmenu.offsetHeight;
    const position = getHtmlTableContextSubmenuPosition(
      triggerRect.left - hostRect.left,
      triggerRect.right - hostRect.left,
      triggerRect.top - hostRect.top,
      submenuWidth,
      submenuHeight,
      viewportBounds.left,
      viewportBounds.top,
      viewportBounds.right,
      viewportBounds.bottom,
      SUBMENU_GAP,
      -6,
    );

    this.contextSubmenu.style.left = `${position.left}px`;
    this.contextSubmenu.style.top = `${position.top}px`;
    this.contextSubmenu.dataset.placement = position.placement;
    this.contextSubmenu.style.transformOrigin = getHtmlTableContextSubmenuTransformOrigin(position.placement);
  }

  private resolveOpenContextSubmenu(
    menu: HtmlTableContextMenuState,
  ): HtmlTableContextMenuSubmenuEntry | null {
    if (!this.openContextSubmenuId) {
      return null;
    }

    const submenu = this.buildContextMenuEntries(menu).find(
      (entry): entry is HtmlTableContextMenuSubmenuEntry =>
        entry.kind === 'submenu' && entry.key === this.openContextSubmenuId,
    );

    if (!submenu) {
      this.openContextSubmenuId = null;
      return null;
    }

    return submenu;
  }

  private getFocusedContextMenuItemKey(): string | null {
    const activeElement = this.root.ownerDocument.activeElement;
    return activeElement instanceof HTMLButtonElement && this.root.contains(activeElement)
      ? activeElement.dataset.menuKey ?? null
      : null;
  }

  private getActiveContextMenuPanel(): HTMLDivElement {
    const activeElement = this.root.ownerDocument.activeElement;
    if (activeElement instanceof HTMLElement && this.contextSubmenu.contains(activeElement) && !this.contextSubmenu.hidden) {
      return this.contextSubmenu;
    }

    return this.contextMenu;
  }

  private getEnabledContextMenuActionButtons(container: ParentNode): HTMLButtonElement[] {
    return getEnabledMenuButtons(container, 'button[data-menu-key]');
  }

  private rerenderOpenContextMenu(): void {
    const interaction = getHtmlTableInteractionState(this.view.state);
    const menu = getHtmlTableContextMenuState(this.view.state, interaction);
    if (this.lastHostRect) {
      this.sync(menu, this.lastHostRect, this.lastViewportInset);
      return;
    }

    this.contextMenu.replaceChildren(this.buildContextMenuPanel(
      this.buildContextMenuEntries(menu),
      menu.scope ?? 'table',
      menu.primaryAction?.id ?? null,
    ));
    this.restoreContextMenuFocus(menu, null);
  }

  private resetContextMenuTypeahead(): void {
    this.menuTypeahead.reset();
  }

  private restoreContextMenuFocus(menu: HtmlTableContextMenuState, focusedMenuItemKey: string | null): void {
    const menuButtons = this.getEnabledContextMenuActionButtons(this.contextMenu);
    const submenuButtons = this.contextSubmenu.hidden
      ? []
      : this.getEnabledContextMenuActionButtons(this.contextSubmenu);
    const enabledButtons = menuButtons.concat(submenuButtons);
    if (enabledButtons.length === 0) {
      this.lastContextMenuOpen = menu.open;
      return;
    }

    if (this.focusFirstSubmenuActionOnOpen && submenuButtons.length > 0) {
      if (submenuButtons[0]) {
        focusMenuButtonWithoutScroll(submenuButtons[0]);
      }
      this.focusFirstSubmenuActionOnOpen = false;
      this.lastContextMenuOpen = menu.open;
      return;
    }

    if (this.submenuTriggerToFocus) {
      const trigger = menuButtons.find((button) => button.dataset.submenuId === this.submenuTriggerToFocus);
      this.submenuTriggerToFocus = null;
      if (trigger) {
        focusMenuButtonWithoutScroll(trigger);
        this.lastContextMenuOpen = menu.open;
        return;
      }
    }

    if (focusedMenuItemKey) {
      const focusedButton = enabledButtons.find((button) => button.dataset.menuKey === focusedMenuItemKey);
      if (focusedButton) {
        focusMenuButtonWithoutScroll(focusedButton);
        this.lastContextMenuOpen = menu.open;
        return;
      }
    }

    if (menu.open && !this.lastContextMenuOpen) {
      const primaryActionId = menu.primaryAction?.id ?? null;
      const primaryButton = primaryActionId
        ? menuButtons.find((button) => button.dataset.actionId === primaryActionId)
        : null;
      const nextButton = primaryButton ?? menuButtons[0] ?? submenuButtons[0];
      if (nextButton) {
        focusMenuButtonWithoutScroll(nextButton);
      }
    }

    this.lastContextMenuOpen = menu.open;
  }

  private restoreContextMenuFocusIfNeeded(): void {
    if (!this.lastContextMenuOpen || !this.restoreContextMenuFocusOnClose) {
      this.restoreContextMenuFocusOnClose = false;
      return;
    }

    if (canRestoreMenuFocus(this.contextMenuFocusTarget)) {
      focusMenuButtonWithoutScroll(this.contextMenuFocusTarget);
    }

    this.restoreContextMenuFocusOnClose = false;
  }

  private closeContextMenu(restoreFocus: boolean): void {
    const interaction = getHtmlTableInteractionState(this.view.state);
    if (!interaction.contextMenuOpen) {
      return;
    }

    this.restoreContextMenuFocusOnClose = restoreFocus;
    this.contextMenuContext = null;
    this.openContextSubmenuId = null;
    this.focusFirstSubmenuActionOnOpen = false;
    this.submenuTriggerToFocus = null;
    this.view.dispatch(
      this.view.state.tr.setMeta(htmlTableInteractionPluginKey, {
        contextMenuOpen: false,
      }),
    );
  }

  private closeContextSubmenu(restoreFocusToTrigger: boolean): void {
    if (!this.openContextSubmenuId) {
      return;
    }

    this.submenuTriggerToFocus = restoreFocusToTrigger ? this.openContextSubmenuId : null;
    this.openContextSubmenuId = null;
    this.focusFirstSubmenuActionOnOpen = false;
    this.resetContextMenuTypeahead();
    this.rerenderOpenContextMenu();
  }

  private openContextSubmenu(submenuId: string, focusFirstAction: boolean): void {
    if (this.openContextSubmenuId === submenuId) {
      return;
    }

    this.openContextSubmenuId = submenuId;
    this.focusFirstSubmenuActionOnOpen = focusFirstAction;
    this.submenuTriggerToFocus = null;
    this.resetContextMenuTypeahead();
    this.rerenderOpenContextMenu();
  }

  private syncHoveredContextSubmenuFromEventTarget(target: EventTarget | null): void {
    const button =
      target instanceof HTMLElement
        ? (target.closest('button[data-menu-key]') as HTMLButtonElement | null)
        : null;
    if (!button) {
      return;
    }

    const submenuId = button.dataset.submenuId;
    if (submenuId) {
      this.clearContextMenuFocusForPointerHover();
      this.openContextSubmenu(submenuId, false);
      return;
    }

    if (button.dataset.actionId && this.openContextSubmenuId && this.contextMenu.contains(button)) {
      this.clearContextMenuFocusForPointerHover();
      this.closeContextSubmenu(false);
    }
  }

  private clearContextMenuFocusForPointerHover(): void {
    const activeElement = this.root.ownerDocument.activeElement;
    if (
      activeElement instanceof HTMLElement &&
      (this.contextMenu.contains(activeElement) || this.contextSubmenu.contains(activeElement))
    ) {
      activeElement.blur();
    }
  }

  private hideContextSubmenu(): void {
    this.contextSubmenu.hidden = true;
    this.contextSubmenu.setAttribute('aria-hidden', 'true');
    this.contextSubmenu.replaceChildren();
    this.contextSubmenu.dataset.scope = '';
    this.contextSubmenu.dataset.placement = '';
    this.contextSubmenu.style.removeProperty('left');
    this.contextSubmenu.style.removeProperty('top');
    this.contextSubmenu.style.removeProperty('max-height');
    this.contextSubmenu.style.removeProperty('transform-origin');
  }

  private captureContextMenuContext(interaction: HtmlTableInteractionState): HtmlTableMenuContext | null {
    const tablePos = interaction.activeTable?.tablePos ?? null;
    if (tablePos === null) {
      return null;
    }

    const selectionInfo = getTableSelectionInfo(this.view.state.doc, this.view.state.selection);
    const scope = getHtmlTableSelectionScope(interaction, tablePos, selectionInfo);
    if (scope === 'table') {
      return { scope, tablePos };
    }

    if (scope === 'row' && interaction.selectedAxis.index !== null) {
      return {
        scope,
        tablePos,
        rowIndex: interaction.selectedAxis.index,
      };
    }

    if (scope === 'column' && interaction.selectedAxis.index !== null) {
      return {
        scope,
        tablePos,
        columnIndex: interaction.selectedAxis.index,
      };
    }

    if (scope === 'cell' && selectionInfo) {
      const anchorCellPos = selectionInfo.cellPositions.get(selectionInfo.anchorCell);
      const headCellPos = selectionInfo.cellPositions.get(selectionInfo.headCell);
      if (anchorCellPos === undefined || headCellPos === undefined) {
        return null;
      }

      return {
        scope,
        tablePos,
        anchorCellPos,
        headCellPos,
      };
    }

    return null;
  }

  private getContextMenuActionInvocation(): {
    state: EditorView['state'];
    interaction: HtmlTableInteractionState;
  } {
    const snapshot = this.contextMenuContext;
    if (!snapshot) {
      return {
        state: this.view.state,
        interaction: getHtmlTableInteractionState(this.view.state),
      };
    }

    const table = this.view.state.doc.nodeAt(snapshot.tablePos);
    if (!table || table.type.name !== 'htmlTable') {
      return {
        state: this.view.state,
        interaction: getHtmlTableInteractionState(this.view.state),
      };
    }

    const transaction =
      snapshot.scope === 'table'
        ? this.view.state.tr.setSelection(NodeSelection.create(this.view.state.doc, snapshot.tablePos))
        : snapshot.scope === 'row'
          ? createRowSelectionTransaction(this.view.state, snapshot.tablePos, table, snapshot.rowIndex)?.setMeta(
              htmlTableInteractionPluginKey,
              {
                selectedAxis: {
                  kind: 'row',
                  index: snapshot.rowIndex,
                  tablePos: snapshot.tablePos,
                },
                selectedAxisExplicit: true,
              },
            )
          : snapshot.scope === 'column'
            ? createColumnSelectionTransaction(this.view.state, snapshot.tablePos, table, snapshot.columnIndex)?.setMeta(
                htmlTableInteractionPluginKey,
                {
                  selectedAxis: {
                    kind: 'column',
                    index: snapshot.columnIndex,
                    tablePos: snapshot.tablePos,
                  },
                  selectedAxisExplicit: true,
                },
              )
            : this.view.state.tr.setSelection(
                CellSelection.create(this.view.state.doc, snapshot.anchorCellPos, snapshot.headCellPos),
              );

    if (!transaction) {
      return {
        state: this.view.state,
        interaction: getHtmlTableInteractionState(this.view.state),
      };
    }

    const state = this.view.state.apply(transaction);
    return {
      state,
      interaction: getHtmlTableInteractionState(state),
    };
  }

  private runContextMenuActionFromEvent(event: MouseEvent): void {
    const target =
      event.target instanceof HTMLElement
        ? (event.target.closest('button[data-menu-key]') as HTMLButtonElement | null)
        : null;
    if (!target) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const submenuId = target.dataset.submenuId;
    if (submenuId) {
      event.preventDefault();
      event.stopPropagation();
      if (this.openContextSubmenuId === submenuId) {
        this.closeContextSubmenu(true);
      } else {
        this.openContextSubmenu(submenuId, true);
      }
      return;
    }

    const actionId = target.dataset.actionId;
    if (!actionId) {
      event.preventDefault();
      event.stopPropagation();
      this.view.focus();
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const { state, interaction } = this.getContextMenuActionInvocation();
    if (this.runMeasuredTableWidthAction(actionId as HtmlTableContextActionId, state, interaction)) {
      this.view.focus();
      return;
    }

    runHtmlTableContextMenuAction(state, interaction, actionId as HtmlTableContextActionId, (transaction) => {
      this.contextMenuContext = null;
      this.restoreContextMenuFocusOnClose = false;
      this.openContextSubmenuId = null;
      this.focusFirstSubmenuActionOnOpen = false;
      this.submenuTriggerToFocus = null;
      this.view.dispatch(
        transaction.setMeta(htmlTableInteractionPluginKey, {
          contextMenuOpen: false,
        }),
      );
    });
    this.view.focus();
  }

  private runMeasuredTableWidthAction(
    actionId: HtmlTableContextActionId,
    state: EditorState,
    interaction: HtmlTableInteractionState,
  ): boolean {
    if (actionId !== 'fitTableToWidth' && actionId !== 'distributeColumns') {
      return false;
    }

    const tablePos = interaction.activeTable?.tablePos;
    if (tablePos === undefined) {
      return false;
    }

    const width = this.measureTableContentWidth(tablePos);
    if (width === null) {
      return false;
    }

    const command = actionId === 'fitTableToWidth'
      ? fitTableToWidth({ tablePos, width })
      : distributeColumns({ tablePos, width });

    return command(state, (transaction: Transaction) => {
      this.contextMenuContext = null;
      this.restoreContextMenuFocusOnClose = false;
      this.openContextSubmenuId = null;
      this.focusFirstSubmenuActionOnOpen = false;
      this.submenuTriggerToFocus = null;
      this.view.dispatch(
        transaction.setMeta(htmlTableInteractionPluginKey, {
          contextMenuOpen: false,
        }),
      );
    });
  }

  private measureTableContentWidth(tablePos: number): number | null {
    const context = getRenderedHtmlTableContext(this.view, tablePos);
    if (!context) return null;

    const measuredElement = context.wrapper.parentElement ?? context.wrapper;
    const styles = measuredElement.ownerDocument.defaultView?.getComputedStyle(measuredElement);
    const paddingLeft = styles ? Number.parseFloat(styles.paddingLeft) || 0 : 0;
    const paddingRight = styles ? Number.parseFloat(styles.paddingRight) || 0 : 0;
    const borderLeft = styles ? Number.parseFloat(styles.borderLeftWidth) || 0 : 0;
    const borderRight = styles ? Number.parseFloat(styles.borderRightWidth) || 0 : 0;
    const contentWidth = measuredElement.clientWidth - paddingLeft - paddingRight - borderLeft - borderRight;
    if (contentWidth > 0) return contentWidth;

    const fallbackWidth = context.dom.getBoundingClientRect().width;
    return fallbackWidth > 0 ? fallbackWidth : null;
  }
}
