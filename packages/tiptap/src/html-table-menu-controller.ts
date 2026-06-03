import { NodeSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { CellSelection } from 'prosemirror-html-table';

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
  getHtmlTableContextMenuTransformOrigin,
  getHtmlTableOverlayViewportBounds,
  getHtmlTableSelectionScope,
  type HtmlTableSelectionScope,
} from './html-table-overlay-geometry.js';
import {
  createColumnSelectionTransaction,
  createRowSelectionTransaction,
  getTableSelectionInfo,
} from './table-utils.js';

const CONTEXT_MENU_TYPEAHEAD_RESET_MS = 700;
const MENU_SCOPE_LABELS: Record<HtmlTableSelectionScope, string> = {
  table: 'Table actions',
  row: 'Row actions',
  column: 'Column actions',
  cell: 'Cell actions',
};

const CELL_COLOR_ACTION_IDS: HtmlTableContextActionId[] = [
  'setCellBackgroundColorBlue',
  'setCellBackgroundColorGreen',
  'setCellBackgroundColorYellow',
  'clearCellBackgroundColor',
];

const CELL_ALIGNMENT_ACTION_IDS: HtmlTableContextActionId[] = [
  'setCellTextAlignLeft',
  'setCellTextAlignCenter',
  'setCellTextAlignRight',
  'setCellVerticalAlignTop',
  'setCellVerticalAlignMiddle',
  'setCellVerticalAlignBottom',
];

const CELL_STRUCTURE_ACTION_IDS: HtmlTableContextActionId[] = [
  'mergeOrSplitCells',
  'toggleHeaderCell',
];

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
  items: HtmlTableContextMenuEntry[];
}

type HtmlTableContextMenuEntry = HtmlTableContextMenuActionEntry | HtmlTableContextMenuSubmenuEntry;

interface HtmlTableResolvedContextMenuLevel {
  title: string | null;
  entries: HtmlTableContextMenuEntry[];
}

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

export function shouldCloseHtmlTableContextMenuForTarget(
  target: EventTarget | null,
  ...elements: Array<Pick<Element, 'contains'> | null>
): boolean {
  return !elements.some((element) => element && containsEventTarget(element, target));
}

export function isHtmlTableContextMenuDismissKey(key: string): boolean {
  return key === 'Escape';
}

export function isHtmlTableContextMenuExitKey(key: string): boolean {
  return key === 'Tab';
}

export function isHtmlTableContextMenuNavigationKey(key: string): boolean {
  return key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End';
}

export function isHtmlTableContextMenuTypeaheadKey(event: {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
}): boolean {
  if (event.altKey || event.ctrlKey || event.metaKey) {
    return false;
  }

  return event.key.length === 1 && event.key.trim().length > 0;
}

export function getNextHtmlTableContextMenuActionIndex(
  currentIndex: number,
  total: number,
  key: string,
): number {
  if (total <= 0) {
    return -1;
  }

  if (key === 'Home') {
    return 0;
  }

  if (key === 'End') {
    return total - 1;
  }

  if (currentIndex < 0 || currentIndex >= total) {
    return key === 'ArrowUp' ? total - 1 : 0;
  }

  if (key === 'ArrowUp') {
    return (currentIndex - 1 + total) % total;
  }

  if (key === 'ArrowDown') {
    return (currentIndex + 1) % total;
  }

  return currentIndex;
}

export function getNextHtmlTableContextMenuTypeaheadIndex(
  labels: string[],
  currentIndex: number,
  query: string,
): number {
  if (!labels.length || !query.length) {
    return -1;
  }

  const normalizedQuery = query.toLowerCase();
  for (let offset = 1; offset <= labels.length; offset += 1) {
    const index = (Math.max(currentIndex, -1) + offset) % labels.length;
    const label = labels[index]?.trim().toLowerCase() ?? '';
    if (label.startsWith(normalizedQuery)) {
      return index;
    }
  }

  return -1;
}

export function isHtmlTableKeyboardClick(event: Pick<MouseEvent, 'detail'>): boolean {
  return event.detail === 0;
}

export function canRestoreHtmlTableContextMenuFocus(
  target: HTMLButtonElement | null,
): target is HTMLButtonElement {
  return Boolean(target && target.isConnected && !target.hidden && target.tabIndex >= 0);
}

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
  private readonly contextTriggerButton: HTMLButtonElement;
  private readonly cellSelectionHandle: HTMLButtonElement;
  private readonly suppressPointerClick: () => void;
  private lastContextMenuOpen = false;
  private contextMenuFocusTarget: HTMLButtonElement | null = null;
  private restoreContextMenuFocusOnClose = false;
  private contextMenuTypeaheadQuery = '';
  private contextMenuTypeaheadResetTimer: ReturnType<typeof setTimeout> | null = null;
  private contextMenuContext: HtmlTableMenuContext | null = null;
  private contextMenuSubmenuPath: string[] = [];
  private lastHostRect: DOMRect | null = null;
  private lastViewportInset = 12;

  constructor(options: HtmlTableMenuControllerOptions) {
    this.getView = options.getView;
    this.root = options.root;
    this.contextMenuId = options.contextMenuId;
    this.contextMenu = options.contextMenu;
    this.contextTriggerButton = options.contextTriggerButton;
    this.cellSelectionHandle = options.cellSelectionHandle;
    this.suppressPointerClick = options.suppressPointerClick;
  }

  destroy(): void {
    this.resetContextMenuTypeahead();
  }

  sync(menu: HtmlTableContextMenuState, hostRect: DOMRect, viewportInset: number): void {
    this.lastHostRect = hostRect;
    this.lastViewportInset = viewportInset;
    const renderState = getHtmlTableContextMenuRenderState(menu);
    const focusedMenuItemKey = this.getFocusedContextMenuItemKey();
    const headerState = getHtmlTableContextMenuHeaderState(menu);
    const accessibleState = getHtmlTableContextMenuAccessibleState(this.contextMenuId, headerState);

    this.contextMenu.hidden = !renderState.visible;
    this.contextMenu.dataset.scope = renderState.scope ?? '';
    this.contextMenu.dataset.primaryAction = renderState.primaryActionId ?? '';
    if (accessibleState.labelledBy) {
      this.contextMenu.setAttribute('aria-labelledby', accessibleState.labelledBy);
    } else {
      this.contextMenu.removeAttribute('aria-labelledby');
    }
    if (accessibleState.describedBy) {
      this.contextMenu.setAttribute('aria-describedby', accessibleState.describedBy);
    } else {
      this.contextMenu.removeAttribute('aria-describedby');
    }

    if (!renderState.visible || renderState.left === null || renderState.top === null) {
      this.contextMenuContext = null;
      this.contextMenuSubmenuPath = [];
      this.resetContextMenuTypeahead();
      this.restoreContextMenuFocusIfNeeded();
      this.contextMenu.replaceChildren();
      this.contextMenu.dataset.placement = '';
      this.contextMenu.style.removeProperty('left');
      this.contextMenu.style.removeProperty('top');
      this.contextMenu.style.removeProperty('max-height');
      this.contextMenu.style.removeProperty('transform-origin');
      this.lastContextMenuOpen = false;
      return;
    }

    if (!menu.open || menu.scope !== 'cell') {
      this.contextMenuSubmenuPath = [];
    }

    this.contextMenu.replaceChildren(...this.buildContextMenuContent(menu));
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
    this.restoreContextMenuFocus(menu, focusedMenuItemKey);
  }

  toggleFromControl(
    interaction: HtmlTableInteractionState,
    focusTarget: HTMLButtonElement | null,
  ): void {
    const nextOpen = !interaction.contextMenuOpen;
    this.contextMenuFocusTarget = focusTarget;
    this.restoreContextMenuFocusOnClose = !nextOpen;
    this.contextMenuContext = nextOpen ? this.captureContextMenuContext(interaction) : null;
    this.contextMenuSubmenuPath = [];
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

  handleMenuClick(event: MouseEvent): void {
    if (!isHtmlTableKeyboardClick(event)) {
      return;
    }

    this.runContextMenuActionFromEvent(event);
  }

  handleMenuKeyDown(event: KeyboardEvent): void {
    const enabledButtons = this.getEnabledContextMenuActionButtons();
    if (isHtmlTableContextMenuExitKey(event.key)) {
      this.closeContextMenu(false);
      return;
    }

    if (isHtmlTableContextMenuDismissKey(event.key)) {
      if (this.contextMenuSubmenuPath.length > 0) {
        event.preventDefault();
        event.stopPropagation();
        this.contextMenuSubmenuPath.pop();
        this.resetContextMenuTypeahead();
        this.rerenderOpenContextMenu();
        return;
      }

      this.closeContextMenu(true);
      return;
    }

    if (enabledButtons.length === 0) {
      return;
    }

    if (isHtmlTableContextMenuNavigationKey(event.key)) {
      event.preventDefault();
      event.stopPropagation();

      const currentIndex = enabledButtons.findIndex((button) => button === this.root.ownerDocument.activeElement);
      const nextIndex = getNextHtmlTableContextMenuActionIndex(currentIndex, enabledButtons.length, event.key);
      enabledButtons[nextIndex]?.focus();
      return;
    }

    if (!isHtmlTableContextMenuTypeaheadKey(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const labels = enabledButtons.map((button) => button.textContent?.trim() ?? '');
    const currentIndex = enabledButtons.findIndex((button) => button === this.root.ownerDocument.activeElement);
    const nextCharacter = event.key.toLowerCase();
    const composedQuery = `${this.contextMenuTypeaheadQuery}${nextCharacter}`;
    let nextIndex = getNextHtmlTableContextMenuTypeaheadIndex(labels, currentIndex, composedQuery);
    let nextQuery = composedQuery;

    if (nextIndex < 0) {
      nextIndex = getNextHtmlTableContextMenuTypeaheadIndex(labels, currentIndex, nextCharacter);
      nextQuery = nextCharacter;
    }

    if (nextIndex < 0) {
      return;
    }

    this.contextMenuTypeaheadQuery = nextQuery;
    this.scheduleContextMenuTypeaheadReset();
    enabledButtons[nextIndex]?.focus();
  }

  handleDocumentMouseDown(event: MouseEvent): void {
    const interaction = getHtmlTableInteractionState(this.view.state);
    if (!interaction.contextMenuOpen) {
      return;
    }

    if (!shouldCloseHtmlTableContextMenuForTarget(
      event.target,
      this.contextTriggerButton,
      this.cellSelectionHandle,
      this.contextMenu,
    )) {
      return;
    }

    this.closeContextMenu(false);
  }

  handleDocumentKeyDown(event: KeyboardEvent): void {
    const interaction = getHtmlTableInteractionState(this.view.state);
    if (!interaction.contextMenuOpen || !isHtmlTableContextMenuDismissKey(event.key)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.closeContextMenu(true);
  }

  private get view(): EditorView {
    return this.getView();
  }

  private buildContextMenuContent(menu: HtmlTableContextMenuState): HTMLElement[] {
    const headerState = getHtmlTableContextMenuHeaderState(menu);
    const elements: HTMLElement[] = [];

    if (headerState.label) {
      const header = this.root.ownerDocument.createElement('div');
      header.className = 'html-table-overlay__context-menu-header';

      const title = this.root.ownerDocument.createElement('div');
      title.className = 'html-table-overlay__context-menu-header-title';
      title.id = `${this.contextMenuId}-title`;
      title.textContent = headerState.label;
      header.append(title);

      if (headerState.detail) {
        const detail = this.root.ownerDocument.createElement('div');
        detail.className = 'html-table-overlay__context-menu-header-detail';
        detail.id = `${this.contextMenuId}-detail`;
        detail.textContent = headerState.detail;
        header.append(detail);
      }

      elements.push(header);
    }

    if (menu.scope === 'cell') {
      return elements.concat(this.buildCellContextMenuLevel(menu));
    }

    return elements.concat(menu.groups.map((group) => this.buildStandardContextMenuGroup(group, menu.primaryAction?.id ?? null)));
  }

  private buildStandardContextMenuGroup(
    group: HtmlTableContextMenuState['groups'][number],
    primaryActionId: string | null,
  ): HTMLElement {
    const groupElement = this.root.ownerDocument.createElement('div');
    groupElement.className = 'html-table-overlay__context-menu-group';
    groupElement.dataset.group = group.id;
    groupElement.setAttribute('role', 'group');
    const accessibleGroupState = getHtmlTableContextMenuGroupAccessibleState(this.contextMenuId, group.id);
    groupElement.setAttribute('aria-labelledby', accessibleGroupState.labelId);

    const label = this.root.ownerDocument.createElement('div');
    label.className = 'html-table-overlay__context-menu-group-label';
    label.id = accessibleGroupState.labelId;
    label.textContent = group.label;
    groupElement.append(label);

    for (const action of group.actions) {
      groupElement.append(this.createContextMenuActionButton(action, primaryActionId === action.id));
    }

    return groupElement;
  }

  private buildCellContextMenuLevel(menu: HtmlTableContextMenuState): HTMLElement {
    const level = this.resolveCellContextMenuLevel(menu);
    const groupElement = this.root.ownerDocument.createElement('div');
    groupElement.className = 'html-table-overlay__context-menu-group html-table-overlay__context-menu-group--stack';
    groupElement.dataset.group = 'cell';
    groupElement.setAttribute('role', 'group');

    if (this.contextMenuSubmenuPath.length > 0) {
      const backButton = this.root.ownerDocument.createElement('button');
      backButton.type = 'button';
      backButton.className = 'html-table-overlay__context-menu-action is-submenu-back';
      backButton.dataset.testid = 'pmht-context-menu-action';
      backButton.dataset.menuKey = 'back';
      backButton.dataset.back = 'true';
      backButton.setAttribute('role', 'menuitem');
      backButton.textContent = level.title ? `Back to ${level.title}` : 'Back';
      groupElement.append(backButton);
    }

    for (const entry of level.entries) {
      if (entry.kind === 'submenu') {
        const button = this.root.ownerDocument.createElement('button');
        button.type = 'button';
        button.className = 'html-table-overlay__context-menu-action has-submenu';
        button.dataset.testid = 'pmht-context-menu-action';
        button.dataset.menuKey = entry.key;
        button.dataset.submenuId = entry.key;
        button.setAttribute('role', 'menuitem');
        button.setAttribute('aria-haspopup', 'menu');
        button.textContent = entry.label;
        groupElement.append(button);
        continue;
      }

      groupElement.append(this.createContextMenuActionButton(
        {
          id: entry.actionId,
          label: entry.label,
          scope: menu.scope ?? 'cell',
          enabled: entry.enabled,
          active: entry.active,
          destructive: entry.destructive,
        },
        entry.primary,
        entry.shortcut,
      ));
    }

    return groupElement;
  }

  private createContextMenuActionButton(
    action: {
      id: HtmlTableContextActionId;
      label: string;
      scope: HtmlTableSelectionScope;
      enabled: boolean;
      active?: boolean;
      destructive?: boolean;
    },
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
    button.classList.toggle('is-active', renderState.active);
    button.classList.toggle('is-destructive', renderState.destructive);
    button.classList.toggle('is-primary', renderState.primary);
    return button;
  }

  private resolveCellContextMenuLevel(menu: HtmlTableContextMenuState): HtmlTableResolvedContextMenuLevel {
    const rootEntries = this.buildCellContextMenuEntries(menu);
    let entries = rootEntries;
    let parentTitle = 'Cell actions';

    for (const key of this.contextMenuSubmenuPath) {
      const submenu = entries.find((entry): entry is HtmlTableContextMenuSubmenuEntry => entry.kind === 'submenu' && entry.key === key);
      if (!submenu) {
        this.contextMenuSubmenuPath = [];
        return {
          title: null,
          entries: rootEntries,
        };
      }

      parentTitle = submenu.label;
      entries = submenu.items;
    }

    return {
      title: this.contextMenuSubmenuPath.length > 0 ? parentTitle : null,
      entries,
    };
  }

  private buildCellContextMenuEntries(menu: HtmlTableContextMenuState): HtmlTableContextMenuEntry[] {
    const actionsById = new Map(menu.actions.map((action) => [action.id, action]));
    const rootEntries: HtmlTableContextMenuEntry[] = [];

    const colorEntries = this.buildCellActionEntries(CELL_COLOR_ACTION_IDS, actionsById, menu.primaryAction?.id ?? null);
    if (colorEntries.length > 0) {
      rootEntries.push({
        kind: 'submenu',
        key: 'color',
        label: 'Color',
        items: colorEntries,
      });
    }

    const alignmentEntries = this.buildCellActionEntries(
      CELL_ALIGNMENT_ACTION_IDS,
      actionsById,
      menu.primaryAction?.id ?? null,
    );
    if (alignmentEntries.length > 0) {
      rootEntries.push({
        kind: 'submenu',
        key: 'alignment',
        label: 'Alignment',
        items: alignmentEntries,
      });
    }

    const structureEntries = this.buildCellActionEntries(
      CELL_STRUCTURE_ACTION_IDS,
      actionsById,
      menu.primaryAction?.id ?? null,
    );
    if (structureEntries.length > 0) {
      rootEntries.push({
        kind: 'submenu',
        key: 'structure',
        label: 'Structure',
        items: structureEntries,
      });
    }

    const clearAction = actionsById.get('clearSelectedCells');
    if (clearAction) {
      rootEntries.push(this.createCellActionEntry(clearAction, menu.primaryAction?.id === clearAction.id));
    }

    return rootEntries;
  }

  private buildCellActionEntries(
    actionIds: HtmlTableContextActionId[],
    actionsById: Map<HtmlTableContextActionId, HtmlTableContextMenuState['actions'][number]>,
    primaryActionId: string | null,
  ): HtmlTableContextMenuActionEntry[] {
    return actionIds
      .map((actionId) => actionsById.get(actionId))
      .filter((action): action is HtmlTableContextMenuState['actions'][number] => Boolean(action))
      .map((action) => this.createCellActionEntry(action, primaryActionId === action.id));
  }

  private createCellActionEntry(
    action: HtmlTableContextMenuState['actions'][number],
    primary: boolean,
  ): HtmlTableContextMenuActionEntry {
    return {
      kind: 'action',
      key: action.id,
      label: this.getCellActionDisplayLabel(action.id, action.label),
      actionId: action.id,
      enabled: action.enabled,
      active: Boolean(action.active),
      primary,
      destructive: Boolean(action.destructive),
      shortcut: getHtmlTableContextActionShortcutState(action).ariaKeyshortcuts,
    };
  }

  private getCellActionDisplayLabel(actionId: HtmlTableContextActionId, fallback: string): string {
    if (actionId === 'clearSelectedCells') {
      return 'Clear contents';
    }

    if (actionId === 'clearCellBackgroundColor') {
      return 'Clear color';
    }

    return fallback;
  }

  private getFocusedContextMenuItemKey(): string | null {
    const activeElement = this.root.ownerDocument.activeElement;
    return activeElement instanceof HTMLButtonElement && this.contextMenu.contains(activeElement)
      ? activeElement.dataset.menuKey ?? null
      : null;
  }

  private getEnabledContextMenuActionButtons(): HTMLButtonElement[] {
    return Array.from(this.contextMenu.querySelectorAll<HTMLButtonElement>('button[data-menu-key]')).filter(
      (button) => !button.disabled,
    );
  }

  private rerenderOpenContextMenu(): void {
    const interaction = getHtmlTableInteractionState(this.view.state);
    const menu = getHtmlTableContextMenuState(this.view.state, interaction);
    if (this.lastHostRect) {
      this.sync(menu, this.lastHostRect, this.lastViewportInset);
      return;
    }

    this.contextMenu.replaceChildren(...this.buildContextMenuContent(menu));
    this.restoreContextMenuFocus(menu, null);
  }

  private scheduleContextMenuTypeaheadReset(): void {
    if (this.contextMenuTypeaheadResetTimer !== null) {
      clearTimeout(this.contextMenuTypeaheadResetTimer);
    }

    this.contextMenuTypeaheadResetTimer = setTimeout(() => {
      this.contextMenuTypeaheadQuery = '';
      this.contextMenuTypeaheadResetTimer = null;
    }, CONTEXT_MENU_TYPEAHEAD_RESET_MS);
  }

  private resetContextMenuTypeahead(): void {
    this.contextMenuTypeaheadQuery = '';
    if (this.contextMenuTypeaheadResetTimer !== null) {
      clearTimeout(this.contextMenuTypeaheadResetTimer);
      this.contextMenuTypeaheadResetTimer = null;
    }
  }

  private restoreContextMenuFocus(menu: HtmlTableContextMenuState, focusedMenuItemKey: string | null): void {
    const enabledButtons = this.getEnabledContextMenuActionButtons();
    if (enabledButtons.length === 0) {
      this.lastContextMenuOpen = menu.open;
      return;
    }

    if (focusedMenuItemKey) {
      const focusedButton = enabledButtons.find((button) => button.dataset.menuKey === focusedMenuItemKey);
      if (focusedButton) {
        focusedButton.focus();
        this.lastContextMenuOpen = menu.open;
        return;
      }
    }

    if (menu.open && !this.lastContextMenuOpen) {
      const primaryActionId = menu.primaryAction?.id ?? null;
      const primaryButton =
        (this.contextMenuSubmenuPath.length === 0 && primaryActionId
          ? enabledButtons.find((button) => button.dataset.actionId === primaryActionId)
          : null) ?? enabledButtons[0];
      primaryButton?.focus();
    }

    this.lastContextMenuOpen = menu.open;
  }

  private restoreContextMenuFocusIfNeeded(): void {
    if (!this.lastContextMenuOpen || !this.restoreContextMenuFocusOnClose) {
      this.restoreContextMenuFocusOnClose = false;
      return;
    }

    if (canRestoreHtmlTableContextMenuFocus(this.contextMenuFocusTarget)) {
      this.contextMenuFocusTarget.focus();
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
    this.contextMenuSubmenuPath = [];
    this.view.dispatch(
      this.view.state.tr.setMeta(htmlTableInteractionPluginKey, {
        contextMenuOpen: false,
      }),
    );
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
    if (target?.dataset.back === 'true') {
      event.preventDefault();
      event.stopPropagation();
      if (this.contextMenuSubmenuPath.length > 0) {
        this.contextMenuSubmenuPath.pop();
        this.resetContextMenuTypeahead();
        this.rerenderOpenContextMenu();
      }
      return;
    }

    const submenuId = target?.dataset.submenuId;
    if (submenuId) {
      event.preventDefault();
      event.stopPropagation();
      this.contextMenuSubmenuPath.push(submenuId);
      this.resetContextMenuTypeahead();
      this.rerenderOpenContextMenu();
      return;
    }

    const actionId = target?.dataset.actionId;
    if (!actionId) {
      event.preventDefault();
      event.stopPropagation();
      this.view.focus();
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const { state, interaction } = this.getContextMenuActionInvocation();
    runHtmlTableContextMenuAction(state, interaction, actionId as HtmlTableContextActionId, (transaction) => {
      this.contextMenuContext = null;
      this.restoreContextMenuFocusOnClose = false;
      this.view.dispatch(
        transaction.setMeta(htmlTableInteractionPluginKey, {
          contextMenuOpen: false,
        }),
      );
    });
    this.view.focus();
  }
}

function containsEventTarget(
  element: Pick<Element, 'contains'>,
  target: EventTarget | null,
): boolean {
  if (!target) {
    return false;
  }

  if (target === (element as unknown as EventTarget)) {
    return true;
  }

  try {
    return element.contains(target as Node);
  } catch {
    return false;
  }
}
