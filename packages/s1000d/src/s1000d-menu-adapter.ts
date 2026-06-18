import type { EditorView } from 'prosemirror-view';

import {
  getS1000DTableInteractionState,
  setS1000DTableInteractionMeta,
  type S1000DTableInteractionState,
  type S1000DTableMenuScope,
} from './interaction.js';
import {
  getS1000DContextMenuState,
  type S1000DContextMenuAction,
  type S1000DContextMenuActionResolver,
  type S1000DContextMenuOptions,
} from './menu.js';
import { CONTEXT_MENU_SCOPE_LABELS, OVERLAY_SELECTOR, SUBMENU_GAP } from './s1000d-overlay-geometry.js';
import {
  canRestoreMenuFocus,
  focusFirstEnabledMenuButton,
  focusMenuButtonWithoutScroll,
  getNextMenuActionIndex,
  getTableContextMenuPosition,
  getTableContextMenuTransformOrigin,
  getTableContextSubmenuPosition,
  getTableContextSubmenuTransformOrigin,
  isMenuDismissKey,
  isMenuExitKey,
  isMenuNavigationKey,
  isMenuTypeaheadKey,
  MenuTypeaheadController,
  shouldCloseMenuForTarget,
} from 'tiptap-html-table/table-interaction';

const COLOR_ACTION_IDS = [
  'set-background-blue',
  'set-background-green',
  'set-background-yellow',
  'clear-background',
] as const;
const ALIGNMENT_ACTION_IDS = [
  'set-align-left',
  'set-align-center',
  'set-align-right',
  'set-valign-top',
  'set-valign-middle',
  'set-valign-bottom',
] as const;
const CELL_STRUCTURE_ACTION_IDS = [
  'merge-cells',
  'split-cell',
  'merge-or-split-cell',
] as const;

interface S1000DContextMenuActionEntry {
  kind: 'action';
  action: S1000DContextMenuAction;
}

interface S1000DContextMenuSubmenuEntry {
  kind: 'submenu';
  key: string;
  label: string;
  actions: S1000DContextMenuAction[];
}

type S1000DContextMenuEntry = S1000DContextMenuActionEntry | S1000DContextMenuSubmenuEntry;

export interface S1000DMenuAdapterOptions {
  cellHandle: HTMLButtonElement;
  contextMenu: HTMLDivElement;
  contextSubmenu: HTMLDivElement;
  contextMenuActionResolver?: S1000DContextMenuActionResolver | undefined;
  onRender: () => void;
  root: HTMLDivElement;
}

export class S1000DMenuAdapter {
  private view: EditorView;
  private readonly root: HTMLDivElement;
  private readonly cellHandle: HTMLButtonElement;
  private readonly contextMenu: HTMLDivElement;
  private readonly contextSubmenu: HTMLDivElement;
  private readonly onRender: () => void;
  private readonly contextMenuActionResolver?: S1000DContextMenuActionResolver | undefined;
  private readonly typeahead = new MenuTypeaheadController();
  private contextMenuActionElements: HTMLButtonElement[] = [];
  private contextSubmenuActionElements: HTMLButtonElement[] = [];
  private previousMenuOpen = false;
  private openContextSubmenuId: string | null = null;
  private focusFirstSubmenuActionOnOpen = false;
  private pendingRepositionFrame: number | null = null;
  private forceClosed = false;
  private currentMenuSignature = '';
  private currentSubmenuSignature = '';

  constructor(view: EditorView, options: S1000DMenuAdapterOptions) {
    this.view = view;
    this.root = options.root;
    this.cellHandle = options.cellHandle;
    this.contextMenu = options.contextMenu;
    this.contextSubmenu = options.contextSubmenu;
    this.onRender = options.onRender;
    this.contextMenuActionResolver = options.contextMenuActionResolver;
  }

  update(view: EditorView): void {
    this.view = view;
  }

  prepareOpen(): void {
    this.forceClosed = false;
  }

  destroy(): void {
    if (this.pendingRepositionFrame !== null) {
      cancelAnimationFrame(this.pendingRepositionFrame);
      this.pendingRepositionFrame = null;
    }
    this.typeahead.destroy();
  }

  render(
    interaction: S1000DTableInteractionState,
    hostRect: DOMRect,
    options: { geometry?: S1000DContextMenuOptions['geometry'] } = {},
  ): void {
    const menu = getS1000DContextMenuState(this.view.state, interaction, {
      actionResolver: this.contextMenuActionResolver,
      geometry: options.geometry,
      view: this.view,
    });
    if (menu.open && this.forceClosed) {
      this.forceClosed = false;
    }
    const menuOpen = menu.open && !this.forceClosed;

    this.contextMenu.hidden = !menuOpen;
    this.contextMenu.setAttribute('aria-hidden', String(!menuOpen));
    this.contextMenu.setAttribute('aria-label', menu.scope ? CONTEXT_MENU_SCOPE_LABELS[menu.scope] : 'Table actions');
    this.contextMenu.dataset.scope = menu.scope ?? '';
    this.root.dataset.contextMenuOpen = String(menuOpen);

    if (!menuOpen || !menu.anchor) {
      this.contextMenu.replaceChildren();
      this.contextSubmenu.replaceChildren();
      this.contextSubmenu.hidden = true;
      this.contextSubmenu.setAttribute('aria-hidden', 'true');
      this.contextMenuActionElements = [];
      this.contextSubmenuActionElements = [];
      this.previousMenuOpen = false;
      this.currentMenuSignature = '';
      this.currentSubmenuSignature = '';
      this.openContextSubmenuId = null;
      this.focusFirstSubmenuActionOnOpen = false;
      if (this.pendingRepositionFrame !== null) {
        cancelAnimationFrame(this.pendingRepositionFrame);
        this.pendingRepositionFrame = null;
      }
      return;
    }

    const entries = this.buildContextMenuEntries(menu.scope ?? 'cell', menu.actions);
    const menuSignature = this.getContextMenuSignature(menu.scope ?? 'cell', entries);
    if (!this.previousMenuOpen || this.currentMenuSignature !== menuSignature) {
      this.contextMenu.replaceChildren(this.createContextMenuPanel(entries));
      this.contextMenuActionElements = Array.from(this.contextMenu.querySelectorAll('button'));
      this.currentMenuSignature = menuSignature;
    } else {
      this.syncContextMenuTriggerState(entries);
    }
    this.positionContextMenu(hostRect, menu.scope ?? 'cell', menu.anchor);
    this.renderContextSubmenu(entries, hostRect);

    if (!this.previousMenuOpen) {
      if (menu.scope !== 'cell') {
        this.focusFirstContextMenuAction(this.contextMenuActionElements);
      }
      this.typeahead.reset();
      if (this.pendingRepositionFrame !== null) {
        cancelAnimationFrame(this.pendingRepositionFrame);
      }
      this.pendingRepositionFrame = this.root.ownerDocument.defaultView?.requestAnimationFrame(() => {
        this.pendingRepositionFrame = null;
        if (getS1000DTableInteractionState(this.view.state).contextMenuOpen) {
          this.onRender();
        }
      }) ?? null;
    }
    this.previousMenuOpen = true;
  }

  handleDocumentPointerDown(event: MouseEvent): void {
    const interaction = getS1000DTableInteractionState(this.view.state);
    if (!interaction.contextMenuOpen) {
      return;
    }

    const targetElement = event.target instanceof Element ? event.target : null;
    if (targetElement?.closest(OVERLAY_SELECTOR)) {
      return;
    }
    if (targetElement?.closest('[data-testid="selection-actions-trigger"]')) {
      return;
    }

    if (!shouldCloseMenuForTarget(event.target, this.contextMenu, this.contextSubmenu, this.cellHandle)) {
      return;
    }

    this.closeContextMenu(false);
  }

  handleDocumentKeyDown(event: KeyboardEvent): void {
    const interaction = getS1000DTableInteractionState(this.view.state);
    if (!interaction.contextMenuOpen) {
      return;
    }

    const activeButtons = this.openContextSubmenuId
      ? this.contextSubmenuActionElements
      : this.contextMenuActionElements;
    const enabledButtons = activeButtons.filter((button) => !button.disabled);
    if (enabledButtons.length === 0) {
      return;
    }

    const activeIndex = enabledButtons.findIndex((button) => button === this.root.ownerDocument.activeElement);
    if (isMenuDismissKey(event.key)) {
      event.preventDefault();
      if (this.openContextSubmenuId) {
        this.closeContextSubmenu(true);
        return;
      }
      this.closeContextMenu(true);
      return;
    }

    if (isMenuExitKey(event.key)) {
      this.closeContextMenu(false);
      return;
    }

    if (isMenuNavigationKey(event.key)) {
      event.preventDefault();
      const nextIndex = getNextMenuActionIndex(activeIndex, enabledButtons.length, event.key);
      const nextButton = enabledButtons[nextIndex];
      if (nextButton) {
        focusMenuButtonWithoutScroll(nextButton);
      }
      return;
    }

    const activeElement = this.root.ownerDocument.activeElement;
    if (event.key === 'ArrowRight' && activeElement instanceof HTMLButtonElement && activeElement.dataset.submenuId) {
      event.preventDefault();
      this.openContextSubmenu(activeElement.dataset.submenuId, true);
      return;
    }

    if (event.key === 'ArrowLeft' && this.openContextSubmenuId) {
      event.preventDefault();
      this.closeContextSubmenu(true);
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      if (activeElement instanceof HTMLButtonElement && !activeElement.disabled) {
        event.preventDefault();
        activeElement.click();
      }
      return;
    }

    if (isMenuTypeaheadKey(event)) {
      const labels = enabledButtons.map((button) => button.textContent ?? '');
      const nextIndex = this.typeahead.advance(labels, activeIndex, event.key);
      if (nextIndex >= 0) {
        event.preventDefault();
        const nextButton = enabledButtons[nextIndex];
        if (nextButton) {
          focusMenuButtonWithoutScroll(nextButton);
        }
      }
    }
  }

  closeContextMenu(restoreFocus: boolean): void {
    this.forceClosed = true;
    this.contextMenu.hidden = true;
    this.contextMenu.setAttribute('aria-hidden', 'true');
    this.contextSubmenu.hidden = true;
    this.contextSubmenu.setAttribute('aria-hidden', 'true');
    this.root.dataset.contextMenuOpen = 'false';
    this.previousMenuOpen = false;
    this.contextMenuActionElements = [];
    this.contextSubmenuActionElements = [];
    this.currentSubmenuSignature = '';
    this.openContextSubmenuId = null;
    this.focusFirstSubmenuActionOnOpen = false;
    const interaction = getS1000DTableInteractionState(this.view.state);
    if (!interaction.contextMenuOpen) {
      return;
    }

    setS1000DTableInteractionMeta(this.view, {
      contextMenuOpen: false,
      menuScope: null,
      menuAnchor: null,
    });
    this.typeahead.reset();

    if (restoreFocus) {
      if (canRestoreMenuFocus(this.cellHandle) && interaction.menuScope === 'cell') {
        focusMenuButtonWithoutScroll(this.cellHandle);
      } else {
        this.root.ownerDocument.dispatchEvent(new CustomEvent('s1000d-focus-selection-trigger'));
      }
    }
  }

  private buildContextMenuEntries(
    scope: S1000DTableMenuScope,
    actions: readonly S1000DContextMenuAction[],
  ): S1000DContextMenuEntry[] {
    const entries: S1000DContextMenuEntry[] = [];
    const actionsById = new Map(actions.map((action) => [action.id, action] as const));
    const consumed = new Set<string>();
    const appendAction = (actionId: string) => {
      const action = actionsById.get(actionId);
      if (!action) {
        return;
      }

      consumed.add(actionId);
      entries.push({ kind: 'action', action });
    };
    const appendSubmenu = (key: string, label: string, actionIds: readonly string[]) => {
      const submenuActions = actionIds
        .map((actionId) => actionsById.get(actionId))
        .filter((action): action is S1000DContextMenuAction => Boolean(action));
      if (submenuActions.length === 0) {
        return;
      }

      submenuActions.forEach((action) => consumed.add(action.id));
      entries.push({ kind: 'submenu', key, label, actions: submenuActions });
    };

    if (scope === 'cell') {
      appendSubmenu('color', 'Color', COLOR_ACTION_IDS);
      appendSubmenu('alignment', 'Alignment', ALIGNMENT_ACTION_IDS);
      appendSubmenu('structure', 'Structure', CELL_STRUCTURE_ACTION_IDS);
      appendAction('clear-selection');
    } else if (scope === 'row') {
      appendAction('add-row-before');
      appendAction('add-row-after');
      appendSubmenu('color', 'Color', COLOR_ACTION_IDS);
      appendSubmenu('alignment', 'Alignment', ALIGNMENT_ACTION_IDS);
      appendAction('move-row-up');
      appendAction('move-row-down');
      appendAction('duplicate-row');
      appendAction('move-row-to-head');
      appendAction('move-row-to-body');
      appendAction('move-row-to-foot');
      appendAction('clear-row-cells');
      appendAction('delete-row');
    } else if (scope === 'column') {
      appendAction('add-column-before');
      appendAction('add-column-after');
      appendAction('move-column-left');
      appendAction('move-column-right');
      appendSubmenu('color', 'Color', COLOR_ACTION_IDS);
      appendSubmenu('alignment', 'Alignment', ALIGNMENT_ACTION_IDS);
      appendAction('clear-column-cells');
      appendAction('duplicate-column');
      appendAction('delete-column');
    } else {
      appendAction('select-table');
      appendAction('fit-table-to-width');
      appendAction('distribute-columns');
      appendAction('delete-table');
    }

    for (const action of actions) {
      if (!consumed.has(action.id)) {
        entries.push({ kind: 'action', action });
      }
    }

    return entries;
  }

  private createContextMenuPanel(entries: readonly S1000DContextMenuEntry[]): HTMLDivElement {
    const groupElement = this.root.ownerDocument.createElement('div');
    groupElement.className = 's1000d-table-overlay__context-menu-group s1000d-table-overlay__context-menu-group--stack';
    groupElement.setAttribute('role', 'group');

    for (const entry of entries) {
      groupElement.append(
        entry.kind === 'submenu'
          ? this.createContextMenuSubmenuTrigger(entry)
          : this.createContextMenuActionButton(entry.action),
      );
    }

    return groupElement;
  }

  private syncContextMenuTriggerState(entries: readonly S1000DContextMenuEntry[]): void {
    for (const entry of entries) {
      if (entry.kind !== 'submenu') {
        continue;
      }

      const trigger = this.contextMenu.querySelector(`[data-submenu-id="${entry.key}"]`);
      if (trigger instanceof HTMLButtonElement) {
        trigger.setAttribute('aria-expanded', this.openContextSubmenuId === entry.key ? 'true' : 'false');
      }
    }
  }

  private renderContextSubmenu(entries: readonly S1000DContextMenuEntry[], hostRect: DOMRect): void {
    const submenuEntry = entries.find(
      (entry): entry is S1000DContextMenuSubmenuEntry =>
        entry.kind === 'submenu' && entry.key === this.openContextSubmenuId,
    );
    if (!submenuEntry) {
      this.contextSubmenu.replaceChildren();
      this.contextSubmenu.hidden = true;
      this.contextSubmenu.setAttribute('aria-hidden', 'true');
      this.contextSubmenuActionElements = [];
      this.currentSubmenuSignature = '';
      return;
    }

    const trigger = this.contextMenu.querySelector(`[data-submenu-id="${submenuEntry.key}"]`);
    if (!(trigger instanceof HTMLButtonElement)) {
      this.contextSubmenu.replaceChildren();
      this.contextSubmenu.hidden = true;
      this.contextSubmenu.setAttribute('aria-hidden', 'true');
      this.contextSubmenuActionElements = [];
      this.currentSubmenuSignature = '';
      return;
    }

    this.contextSubmenu.hidden = false;
    this.contextSubmenu.setAttribute('aria-hidden', 'false');
    this.contextSubmenu.setAttribute('aria-label', `${submenuEntry.label} actions`);
    const submenuSignature = `${submenuEntry.key}:${submenuEntry.actions.map((action) => `${action.id}:${action.enabled}:${action.active ? '1' : '0'}`).join(',')}`;
    if (this.currentSubmenuSignature !== submenuSignature) {
      this.contextSubmenu.replaceChildren(this.createContextMenuPanel(
        submenuEntry.actions.map((action) => ({ kind: 'action', action })),
      ));
      this.contextSubmenuActionElements = Array.from(this.contextSubmenu.querySelectorAll('button'));
      this.currentSubmenuSignature = submenuSignature;
    }

    const rootRect = this.contextMenu.getBoundingClientRect();
    const triggerRect = trigger.getBoundingClientRect();
    const submenuWidth = this.contextSubmenu.offsetWidth;
    const submenuHeight = this.contextSubmenu.offsetHeight;
    const position = getTableContextSubmenuPosition(
      rootRect.left - hostRect.left,
      rootRect.right - hostRect.left,
      triggerRect.top - hostRect.top,
      submenuWidth,
      submenuHeight,
      0,
      0,
      hostRect.width,
      hostRect.height,
      SUBMENU_GAP,
    );

    Object.assign(this.contextSubmenu.style, {
      left: `${position.left}px`,
      top: `${position.top}px`,
      position: 'absolute',
      transformOrigin: getTableContextSubmenuTransformOrigin(position.placement),
    });
    this.contextSubmenu.dataset.placement = position.placement;

    if (this.focusFirstSubmenuActionOnOpen) {
      this.focusFirstContextMenuAction(this.contextSubmenuActionElements);
      this.focusFirstSubmenuActionOnOpen = false;
    }
  }

  private createContextMenuSubmenuTrigger(entry: S1000DContextMenuSubmenuEntry): HTMLButtonElement {
    const button = this.root.ownerDocument.createElement('button');
    button.type = 'button';
    button.dataset.testid = `selection-menu-submenu-${entry.key}`;
    button.dataset.submenuId = entry.key;
    button.textContent = entry.label;
    button.className = 's1000d-table-overlay__context-menu-action has-submenu';
    button.setAttribute('role', 'menuitem');
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-expanded', this.openContextSubmenuId === entry.key ? 'true' : 'false');
    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (this.openContextSubmenuId === entry.key) {
        this.closeContextSubmenu(true);
      } else {
        this.openContextSubmenu(entry.key, true);
      }
    });
    button.addEventListener('click', (event) => {
      if ((event as MouseEvent).detail !== 0) {
        return;
      }
      event.preventDefault();
      if (this.openContextSubmenuId === entry.key) {
        this.closeContextSubmenu(true);
      } else {
        this.openContextSubmenu(entry.key, true);
      }
    });
    return button;
  }

  private createContextMenuActionButton(action: S1000DContextMenuAction): HTMLButtonElement {
    const button = this.root.ownerDocument.createElement('button');
    button.type = 'button';
    button.dataset.testid = `selection-menu-item-${action.id}`;
    button.textContent = action.label;
    button.disabled = !action.enabled;
    button.className = 's1000d-table-overlay__context-menu-action';
    button.classList.toggle('is-destructive', Boolean(action.destructive));
    button.classList.toggle('is-active', Boolean(action.active));
    button.setAttribute('role', 'menuitem');
    button.tabIndex = action.enabled ? 0 : -1;
    const executeAction = (event: Event) => {
      if (!action.enabled) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      queueMicrotask(() => {
        this.closeContextMenu(false);
        const result = action.run(this.view);
        if (result === false) {
          this.onRender();
        }
      });
    };
    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener('click', (event) => {
      executeAction(event);
    });
    return button;
  }

  private focusFirstContextMenuAction(buttons: readonly HTMLButtonElement[]): void {
    focusFirstEnabledMenuButton(buttons);
  }

  private positionContextMenu(
    hostRect: DOMRect,
    scope: S1000DTableMenuScope,
    fallback: { left: number; top: number },
  ): void {
    const anchor = this.getLiveAnchor(scope, fallback);
    const menuWidth = this.contextMenu.offsetWidth || 192;
    const menuHeight = this.contextMenu.offsetHeight || 320;
    const position = getTableContextMenuPosition(
      scope,
      anchor.left - hostRect.left,
      anchor.top - hostRect.top,
      menuWidth,
      menuHeight,
      12,
      12,
      Math.max(12, hostRect.width - 12),
      Math.max(12, hostRect.height - 12),
    );

    Object.assign(this.contextMenu.style, {
      left: `${position.left}px`,
      top: `${position.top}px`,
      position: 'absolute',
      transformOrigin: getTableContextMenuTransformOrigin(position.placement),
    });
    this.contextMenu.dataset.placement = position.placement;
  }

  private getLiveAnchor(
    scope: S1000DTableMenuScope,
    fallback: { left: number; top: number },
  ): { left: number; top: number } {
    if (scope === 'cell') {
      return fallback;
    }

    const selectors = scope === 'row'
      ? [
        '[data-testid="s1000d-row-handle"].is-menu-open',
        '[data-testid="s1000d-row-handle"].is-selected:not([hidden])',
        '[data-testid="s1000d-row-handle"][aria-expanded="true"]',
      ]
      : scope === 'column'
        ? [
          '[data-testid="s1000d-column-handle"].is-menu-open',
          '[data-testid="s1000d-column-handle"].is-selected:not([hidden])',
          '[data-testid="s1000d-column-handle"][aria-expanded="true"]',
        ]
        : scope === 'table'
          ? [
            '[data-testid="s1000d-table-handle"].is-menu-open',
            '[data-testid="s1000d-table-handle"].is-selected',
            '[data-testid="s1000d-table-handle"][aria-expanded="true"]',
          ]
          : [
            '[data-testid="s1000d-cell-handle"].is-menu-open',
            '[data-testid="s1000d-cell-handle"].is-selected:not([hidden])',
            '[data-testid="s1000d-cell-handle"][aria-expanded="true"]',
          ];
    const activeHandle = selectors
      .map((selector) => this.root.querySelector(selector))
      .find((element): element is HTMLElement => element instanceof HTMLElement);
    if (!(activeHandle instanceof HTMLElement)) {
      return fallback;
    }

    const rect = activeHandle.getBoundingClientRect();
    return {
      left: rect.left + rect.width / 2,
      top: rect.top + rect.height / 2,
    };
  }

  private openContextSubmenu(submenuId: string, focusFirstAction: boolean): void {
    if (this.openContextSubmenuId === submenuId) {
      return;
    }

    this.openContextSubmenuId = submenuId;
    this.focusFirstSubmenuActionOnOpen = focusFirstAction;
    this.typeahead.reset();
    this.onRender();
  }

  private closeContextSubmenu(restoreFocus: boolean): void {
    const submenuId = this.openContextSubmenuId;
    if (!submenuId) {
      return;
    }

    this.openContextSubmenuId = null;
    this.focusFirstSubmenuActionOnOpen = false;
    this.typeahead.reset();
    this.onRender();

    if (restoreFocus) {
      const trigger = this.contextMenu.querySelector(`[data-submenu-id="${submenuId}"]`);
      if (trigger instanceof HTMLButtonElement) {
        focusMenuButtonWithoutScroll(trigger);
      }
    }
  }

  private getContextMenuSignature(
    scope: S1000DTableMenuScope,
    entries: readonly S1000DContextMenuEntry[],
  ): string {
    return [
      scope,
      ...entries.map((entry) => (
        entry.kind === 'submenu'
          ? `submenu:${entry.key}:${entry.actions.map((action) => action.id).join(',')}`
          : `action:${entry.action.id}:${entry.action.enabled}:${entry.action.active ? '1' : '0'}`
      )),
    ].join('|');
  }
}
