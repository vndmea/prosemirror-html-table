import {
  getTableContextMenuPosition,
  getTableContextMenuTransformOrigin,
  getTableContextSubmenuPosition,
  getTableContextSubmenuTransformOrigin,
} from './overlay-geometry.js';

export function shouldCloseMenuForTarget(
  target: EventTarget | null,
  ...elements: Array<Pick<Element, 'contains'> | null>
): boolean {
  return !elements.some((element) => element && containsEventTarget(element, target));
}

export function isMenuDismissKey(key: string): boolean {
  return key === 'Escape';
}

export function isMenuExitKey(key: string): boolean {
  return key === 'Tab';
}

export function isMenuNavigationKey(key: string): boolean {
  return key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End';
}

export function isMenuTypeaheadKey(event: {
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

export function getNextMenuActionIndex(currentIndex: number, total: number, key: string): number {
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

export function getNextMenuTypeaheadIndex(labels: string[], currentIndex: number, query: string): number {
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

export function isKeyboardClick(event: Pick<MouseEvent, 'detail'>): boolean {
  return event.detail === 0;
}

export function canRestoreMenuFocus(target: HTMLButtonElement | null): target is HTMLButtonElement {
  return Boolean(target && target.isConnected && !target.hidden && target.tabIndex >= 0);
}

export interface TableMenuAnchor {
  left: number;
  top: number;
}

export type TableMenuScope = 'table' | 'row' | 'column' | 'cell';
export type TableMenuToggleAction = 'open' | 'close';

export function getTableMenuAnchorForElement(
  element: Pick<HTMLElement, 'getBoundingClientRect'> | null,
): TableMenuAnchor | null {
  if (!element) {
    return null;
  }

  const rect = element.getBoundingClientRect();
  return {
    left: rect.left + rect.width / 2,
    top: rect.top + rect.height / 2,
  };
}

export function getTableMenuToggleAction(contextMenuOpen: boolean): TableMenuToggleAction {
  return contextMenuOpen ? 'close' : 'open';
}

export function getScopedTableMenuToggleAction<TScope>(
  contextMenuOpen: boolean,
  currentScope: TScope | null,
  requestedScope: TScope,
): TableMenuToggleAction {
  return contextMenuOpen && currentScope === requestedScope ? 'close' : 'open';
}

export function canToggleTableContextTriggerMenu(
  triggerVisible: boolean,
  options: {
    blockedByResize?: boolean | undefined;
  } = {},
): boolean {
  return triggerVisible && !options.blockedByResize;
}

export interface TableContextMenuElementOptions {
  className: string;
  id: string;
  testId: string;
  zIndex?: number | string | undefined;
  onClick?: ((event: MouseEvent) => void) | undefined;
  onFocusIn?: ((event: FocusEvent) => void) | undefined;
  onMouseDown?: ((event: MouseEvent) => void) | undefined;
  onMouseOver?: ((event: MouseEvent) => void) | undefined;
  onKeyDown?: ((event: KeyboardEvent) => void) | undefined;
}

export function createTableContextMenuElement(
  ownerDocument: Document,
  options: TableContextMenuElementOptions,
): HTMLDivElement {
  const menu = ownerDocument.createElement('div');
  menu.className = options.className;
  menu.id = options.id;
  menu.dataset.testid = options.testId;
  menu.hidden = true;
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-hidden', 'true');
  menu.setAttribute('aria-orientation', 'vertical');
  Object.assign(menu.style, {
    pointerEvents: 'auto',
  });
  if (options.zIndex !== undefined) {
    menu.style.zIndex = String(options.zIndex);
  }
  if (options.onMouseDown) {
    menu.addEventListener('mousedown', options.onMouseDown);
  }
  if (options.onClick) {
    menu.addEventListener('click', options.onClick);
  }
  if (options.onKeyDown) {
    menu.addEventListener('keydown', options.onKeyDown);
  }
  if (options.onMouseOver) {
    menu.addEventListener('mouseover', options.onMouseOver);
  }
  if (options.onFocusIn) {
    menu.addEventListener('focusin', options.onFocusIn);
  }
  return menu;
}

export function getEnabledMenuButtons(
  container: ParentNode,
  selector = 'button',
): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>(selector)).filter((button) => !button.disabled);
}

export function focusMenuButtonWithoutScroll(button: HTMLButtonElement): void {
  button.focus({ preventScroll: true });
}

export function focusFirstEnabledMenuButton(
  buttons: readonly HTMLButtonElement[],
): HTMLButtonElement | null {
  const nextButton = buttons.find((element) => !element.disabled) ?? null;
  if (nextButton) {
    focusMenuButtonWithoutScroll(nextButton);
  }
  return nextButton;
}

export interface TableContextSubmenuState {
  focusFirstSubmenuActionOnOpen: boolean;
  openSubmenuId: string | null;
  submenuTriggerToFocus: string | null;
}

export function createTableContextSubmenuState(): TableContextSubmenuState {
  return {
    focusFirstSubmenuActionOnOpen: false,
    openSubmenuId: null,
    submenuTriggerToFocus: null,
  };
}

export function resetTableContextSubmenuState(state: TableContextSubmenuState): void {
  state.focusFirstSubmenuActionOnOpen = false;
  state.openSubmenuId = null;
  state.submenuTriggerToFocus = null;
}

export function openTableContextSubmenu(
  state: TableContextSubmenuState,
  submenuId: string,
  focusFirstAction: boolean,
): boolean {
  if (state.openSubmenuId === submenuId) {
    return false;
  }

  state.openSubmenuId = submenuId;
  state.focusFirstSubmenuActionOnOpen = focusFirstAction;
  state.submenuTriggerToFocus = null;
  return true;
}

export function closeTableContextSubmenu(
  state: TableContextSubmenuState,
  restoreFocusToTrigger: boolean,
): string | null {
  const submenuId = state.openSubmenuId;
  if (!submenuId) {
    return null;
  }

  state.submenuTriggerToFocus = restoreFocusToTrigger ? submenuId : null;
  state.openSubmenuId = null;
  state.focusFirstSubmenuActionOnOpen = false;
  return submenuId;
}

export function consumeTableContextSubmenuTriggerToFocus(
  state: TableContextSubmenuState,
): string | null {
  const submenuId = state.submenuTriggerToFocus;
  state.submenuTriggerToFocus = null;
  return submenuId;
}

export function consumeTableContextSubmenuAutoFocus(
  state: TableContextSubmenuState,
): boolean {
  const shouldFocus = state.focusFirstSubmenuActionOnOpen;
  state.focusFirstSubmenuActionOnOpen = false;
  return shouldFocus;
}

export interface TableContextMenuActionEntryLike<TActionId extends string = string> {
  actionId: TActionId;
  active?: boolean | undefined;
  destructive?: boolean | undefined;
  enabled: boolean;
  key: string;
  kind: 'action';
  label: string;
  primary?: boolean | undefined;
  shortcut?: string | null | undefined;
}

export interface TableContextMenuSubmenuEntryLike<TActionId extends string = string> {
  items: readonly TableContextMenuActionEntryLike<TActionId>[];
  key: string;
  kind: 'submenu';
  label: string;
}

export type TableContextMenuPanelEntryLike<TActionId extends string = string> =
  | TableContextMenuActionEntryLike<TActionId>
  | TableContextMenuSubmenuEntryLike<TActionId>;

export function resolveOpenTableContextSubmenu<
  TActionId extends string,
  TEntry extends TableContextMenuSubmenuEntryLike<TActionId>,
>(
  entries: readonly (TableContextMenuActionEntryLike<TActionId> | TEntry)[],
  openSubmenuId: string | null,
): TEntry | null {
  if (!openSubmenuId) {
    return null;
  }

  return entries.find(
    (entry): entry is TEntry =>
      entry.kind === 'submenu' && entry.key === openSubmenuId,
  ) ?? null;
}

export function syncTableContextSubmenuTriggerExpandedState(
  container: ParentNode,
  openSubmenuId: string | null,
): void {
  const triggers = container.querySelectorAll<HTMLButtonElement>('button[data-submenu-id]');
  for (const trigger of Array.from(triggers)) {
    trigger.setAttribute('aria-expanded', trigger.dataset.submenuId === openSubmenuId ? 'true' : 'false');
  }
}

export interface TableContextMenuPanelOptions<TEntry> {
  createElement: (entry: TEntry) => HTMLElement;
  entries: readonly TEntry[];
  groupClassName: string;
  groupName?: string | null | undefined;
}

export function createTableContextMenuPanel<TEntry>(
  ownerDocument: Document,
  options: TableContextMenuPanelOptions<TEntry>,
): HTMLDivElement {
  const groupElement = ownerDocument.createElement('div');
  groupElement.className = options.groupClassName;
  groupElement.setAttribute('role', 'group');
  if (options.groupName) {
    groupElement.dataset.group = options.groupName;
  } else {
    delete groupElement.dataset.group;
  }

  for (const entry of options.entries) {
    groupElement.append(options.createElement(entry));
  }

  return groupElement;
}

export interface TableContextMenuSubmenuButtonOptions {
  className: string;
  expanded: boolean;
  key: string;
  label: string;
  onClick?: ((event: MouseEvent) => void) | undefined;
  onMouseDown?: ((event: MouseEvent) => void) | undefined;
  testId: string;
}

export function createTableContextMenuSubmenuButton(
  ownerDocument: Document,
  options: TableContextMenuSubmenuButtonOptions,
): HTMLButtonElement {
  const button = ownerDocument.createElement('button');
  button.type = 'button';
  button.className = options.className;
  button.dataset.menuKey = options.key;
  button.dataset.submenuId = options.key;
  button.dataset.testid = options.testId;
  button.textContent = options.label;
  button.setAttribute('role', 'menuitem');
  button.setAttribute('aria-haspopup', 'menu');
  button.setAttribute('aria-expanded', options.expanded ? 'true' : 'false');
  if (options.onMouseDown) {
    button.addEventListener('mousedown', options.onMouseDown);
  }
  if (options.onClick) {
    button.addEventListener('click', options.onClick);
  }
  return button;
}

export interface TableContextMenuActionButtonOptions {
  actionId: string;
  active?: boolean | undefined;
  ariaCurrent?: string | null | undefined;
  ariaKeyshortcuts?: string | null | undefined;
  className: string;
  destructive?: boolean | undefined;
  disabled?: boolean | undefined;
  label: string;
  menuKey?: string | undefined;
  onClick?: ((event: MouseEvent) => void) | undefined;
  onMouseDown?: ((event: MouseEvent) => void) | undefined;
  role?: string | undefined;
  tabIndex?: number | undefined;
  testId: string;
}

export function createTableContextMenuActionButton(
  ownerDocument: Document,
  options: TableContextMenuActionButtonOptions,
): HTMLButtonElement {
  const button = ownerDocument.createElement('button');
  button.type = 'button';
  button.className = options.className;
  button.dataset.actionId = options.actionId;
  button.dataset.menuKey = options.menuKey ?? options.actionId;
  button.dataset.testid = options.testId;
  button.textContent = options.label;
  button.disabled = Boolean(options.disabled);
  button.setAttribute('role', options.role ?? 'menuitem');
  if (options.ariaKeyshortcuts) {
    button.setAttribute('aria-keyshortcuts', options.ariaKeyshortcuts);
  }
  if (options.ariaCurrent) {
    button.setAttribute('aria-current', options.ariaCurrent);
  }
  if (options.tabIndex !== undefined) {
    button.tabIndex = options.tabIndex;
  }
  button.classList.toggle('is-destructive', Boolean(options.destructive));
  button.classList.toggle('is-active', Boolean(options.active));
  if (options.onMouseDown) {
    button.addEventListener('mousedown', options.onMouseDown);
  }
  if (options.onClick) {
    button.addEventListener('click', options.onClick);
  }
  return button;
}

export interface TableMenuViewportBounds {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

export function positionTableContextMenuElement(
  menu: HTMLDivElement,
  options: {
    anchor: TableMenuAnchor;
    bounds: TableMenuViewportBounds;
    hostRect: DOMRect;
    maxHeight?: number | null | undefined;
    menuHeight?: number | undefined;
    menuWidth?: number | undefined;
    scope: TableMenuScope;
  },
): ReturnType<typeof getTableContextMenuPosition> {
  const position = getTableContextMenuPosition(
    options.scope,
    options.anchor.left - options.hostRect.left,
    options.anchor.top - options.hostRect.top,
    (options.menuWidth ?? menu.offsetWidth) || 192,
    (options.menuHeight ?? menu.offsetHeight) || 320,
    options.bounds.left,
    options.bounds.top,
    options.bounds.right,
    options.bounds.bottom,
  );

  menu.style.left = `${position.left}px`;
  menu.style.top = `${position.top}px`;
  menu.style.position = 'absolute';
  menu.style.transformOrigin = getTableContextMenuTransformOrigin(position.placement);
  if (options.maxHeight !== undefined && options.maxHeight !== null) {
    menu.style.maxHeight = `${options.maxHeight}px`;
  } else {
    menu.style.removeProperty('max-height');
  }
  menu.dataset.placement = position.placement;
  return position;
}

export function positionTableContextSubmenuElement(
  menu: HTMLDivElement,
  options: {
    bounds: TableMenuViewportBounds;
    gap: number;
    hostRect: DOMRect;
    maxHeight?: number | null | undefined;
    submenuHeight?: number | undefined;
    submenuWidth?: number | undefined;
    triggerRect: Pick<DOMRect, 'left' | 'right' | 'top'>;
    verticalOffset?: number | undefined;
  },
): ReturnType<typeof getTableContextSubmenuPosition> {
  const position = getTableContextSubmenuPosition(
    options.triggerRect.left - options.hostRect.left,
    options.triggerRect.right - options.hostRect.left,
    options.triggerRect.top - options.hostRect.top,
    options.submenuWidth ?? menu.offsetWidth,
    options.submenuHeight ?? menu.offsetHeight,
    options.bounds.left,
    options.bounds.top,
    options.bounds.right,
    options.bounds.bottom,
    options.gap,
    options.verticalOffset,
  );

  menu.style.left = `${position.left}px`;
  menu.style.top = `${position.top}px`;
  menu.style.position = 'absolute';
  menu.style.transformOrigin = getTableContextSubmenuTransformOrigin(position.placement);
  if (options.maxHeight !== undefined && options.maxHeight !== null) {
    menu.style.maxHeight = `${options.maxHeight}px`;
  } else {
    menu.style.removeProperty('max-height');
  }
  menu.dataset.placement = position.placement;
  return position;
}

export function getTableMenuLiveAnchor<TScope extends string>(
  root: Pick<ParentNode, 'querySelector'>,
  scope: TScope,
  fallback: TableMenuAnchor,
  selectorsByScope: Record<TScope, readonly string[]>,
): TableMenuAnchor {
  const activeHandle = selectorsByScope[scope]
    .map((selector) => root.querySelector(selector))
    .find((element) => (
      Boolean(element && typeof (element as Pick<HTMLElement, 'getBoundingClientRect'>).getBoundingClientRect === 'function')
    ));
  return getTableMenuAnchorForElement(
    activeHandle as Pick<HTMLElement, 'getBoundingClientRect'> | null,
  ) ?? fallback;
}

export class MenuTypeaheadController {
  private currentQuery = '';
  private resetTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly resetMs: number;

  constructor(resetMs = 700) {
    this.resetMs = resetMs;
  }

  advance(labels: string[], currentIndex: number, nextCharacter: string): number {
    const normalizedCharacter = nextCharacter.toLowerCase();
    const composedQuery = `${this.currentQuery}${normalizedCharacter}`;
    let nextIndex = getNextMenuTypeaheadIndex(labels, currentIndex, composedQuery);
    let nextQuery = composedQuery;

    if (nextIndex < 0) {
      nextIndex = getNextMenuTypeaheadIndex(labels, currentIndex, normalizedCharacter);
      nextQuery = normalizedCharacter;
    }

    if (nextIndex < 0) {
      return -1;
    }

    this.currentQuery = nextQuery;
    this.scheduleReset();
    return nextIndex;
  }

  reset(): void {
    this.currentQuery = '';
    if (this.resetTimer !== null) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
  }

  destroy(): void {
    this.reset();
  }

  private scheduleReset(): void {
    if (this.resetTimer !== null) {
      clearTimeout(this.resetTimer);
    }

    this.resetTimer = setTimeout(() => {
      this.currentQuery = '';
      this.resetTimer = null;
    }, this.resetMs);
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
