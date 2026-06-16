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
} from './menu.js';
import {
  clamp,
  CONTEXT_MENU_SCOPE_LABELS,
  getMenuPosition,
  OVERLAY_SELECTOR,
  SUBMENU_GAP,
} from './s1000d-overlay-geometry.js';
import {
  canRestoreMenuFocus,
  getNextMenuActionIndex,
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

  destroy(): void {
    this.typeahead.destroy();
  }

  render(interaction: S1000DTableInteractionState, hostRect: DOMRect): void {
    const menu = getS1000DContextMenuState(this.view.state, interaction, {
      actionResolver: this.contextMenuActionResolver,
      view: this.view,
    });

    this.contextMenu.hidden = !menu.open;
    this.contextMenu.setAttribute('aria-hidden', String(!menu.open));
    this.contextMenu.setAttribute('aria-label', menu.scope ? CONTEXT_MENU_SCOPE_LABELS[menu.scope] : 'Table actions');
    this.contextMenu.dataset.scope = menu.scope ?? '';
    this.root.dataset.contextMenuOpen = String(menu.open);

    if (!menu.open || !menu.anchor) {
      this.contextMenu.replaceChildren();
      this.contextSubmenu.replaceChildren();
      this.contextSubmenu.hidden = true;
      this.contextSubmenu.setAttribute('aria-hidden', 'true');
      this.contextMenuActionElements = [];
      this.contextSubmenuActionElements = [];
      this.previousMenuOpen = false;
      this.openContextSubmenuId = null;
      this.focusFirstSubmenuActionOnOpen = false;
      return;
    }

    const position = getMenuPosition(hostRect, menu.scope ?? 'cell', menu.anchor);
    Object.assign(this.contextMenu.style, {
      left: `${position.left}px`,
      top: `${position.top}px`,
      position: 'absolute',
    });
    const entries = this.buildContextMenuEntries(menu.scope ?? 'cell', menu.actions);
    this.contextMenu.replaceChildren(this.createContextMenuPanel(entries));
    this.contextMenuActionElements = Array.from(this.contextMenu.querySelectorAll('button'));
    this.renderContextSubmenu(entries, hostRect);

    if (!this.previousMenuOpen) {
      this.focusFirstContextMenuAction(this.contextMenuActionElements);
      this.typeahead.reset();
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
      enabledButtons[nextIndex]?.focus();
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
        enabledButtons[nextIndex]?.focus();
      }
    }
  }

  closeContextMenu(restoreFocus: boolean): void {
    const interaction = getS1000DTableInteractionState(this.view.state);
    if (!interaction.contextMenuOpen) {
      return;
    }

    setS1000DTableInteractionMeta(this.view, {
      contextMenuOpen: false,
      menuScope: null,
      menuAnchor: null,
    });
    this.previousMenuOpen = false;
    this.openContextSubmenuId = null;
    this.focusFirstSubmenuActionOnOpen = false;
    this.typeahead.reset();

    if (restoreFocus) {
      if (canRestoreMenuFocus(this.cellHandle) && interaction.menuScope === 'cell') {
        this.cellHandle.focus();
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
      appendAction('move-column-left');
      appendAction('move-column-right');
      appendAction('add-column-before');
      appendAction('add-column-after');
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
      return;
    }

    const trigger = this.contextMenu.querySelector(`[data-submenu-id="${submenuEntry.key}"]`);
    if (!(trigger instanceof HTMLButtonElement)) {
      this.contextSubmenu.replaceChildren();
      this.contextSubmenu.hidden = true;
      this.contextSubmenu.setAttribute('aria-hidden', 'true');
      this.contextSubmenuActionElements = [];
      return;
    }

    this.contextSubmenu.hidden = false;
    this.contextSubmenu.setAttribute('aria-hidden', 'false');
    this.contextSubmenu.setAttribute('aria-label', `${submenuEntry.label} actions`);
    this.contextSubmenu.replaceChildren(this.createContextMenuPanel(
      submenuEntry.actions.map((action) => ({ kind: 'action', action })),
    ));
    this.contextSubmenuActionElements = Array.from(this.contextSubmenu.querySelectorAll('button'));

    const rootRect = this.contextMenu.getBoundingClientRect();
    const triggerRect = trigger.getBoundingClientRect();
    const submenuWidth = this.contextSubmenu.offsetWidth;
    const submenuHeight = this.contextSubmenu.offsetHeight;
    let left = (rootRect.right - hostRect.left) + SUBMENU_GAP;
    if (hostRect.left + left + submenuWidth > hostRect.right) {
      left = (rootRect.left - hostRect.left) - submenuWidth - SUBMENU_GAP;
    }
    let top = triggerRect.top - hostRect.top;
    left = clamp(left, 0, Math.max(0, hostRect.width - submenuWidth));
    top = clamp(top, 0, Math.max(0, hostRect.height - submenuHeight));

    Object.assign(this.contextSubmenu.style, {
      left: `${left}px`,
      top: `${top}px`,
      position: 'absolute',
    });

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
    button.addEventListener('mouseenter', () => this.openContextSubmenu(entry.key, false));
    button.addEventListener('focus', () => this.openContextSubmenu(entry.key, false));
    button.addEventListener('click', (event) => {
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
    button.addEventListener('click', () => {
      if (!action.enabled) {
        return;
      }
      const result = action.run(this.view);
      if (result !== false) {
        this.closeContextMenu(false);
      }
    });
    return button;
  }

  private focusFirstContextMenuAction(buttons: readonly HTMLButtonElement[]): void {
    buttons.find((element) => !element.disabled)?.focus();
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
        trigger.focus();
      }
    }
  }
}
