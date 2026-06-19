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
import { CONTEXT_MENU_SCOPE_LABELS, OVERLAY_SELECTOR, SUBMENU_GAP } from './overlay-geometry.js';
import {
  canRestoreMenuFocus,
  createTableContextMenuActionButton,
  createTableContextMenuPanel,
  createTableContextMenuSubmenuButton,
  focusMenuButtonWithoutScroll,
  GenericTableMenuController,
  getTableMenuLiveAnchor,
  isKeyboardClick,
  positionTableContextMenuElement,
  positionTableContextSubmenuElement,
  resolveOpenTableContextSubmenu,
  shouldCloseMenuForTarget,
  syncTableContextSubmenuTriggerExpandedState,
  type TableContextMenuActionEntryLike,
  type TableContextMenuSubmenuEntryLike,
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

const LIVE_ANCHOR_SELECTORS: Record<S1000DTableMenuScope, readonly string[]> = {
  cell: [],
  column: [
    '[data-testid="s1000d-column-handle"].is-menu-open',
    '[data-testid="s1000d-column-handle"].is-selected:not([hidden])',
    '[data-testid="s1000d-column-handle"][aria-expanded="true"]',
  ],
  row: [
    '[data-testid="s1000d-row-handle"].is-menu-open',
    '[data-testid="s1000d-row-handle"].is-selected:not([hidden])',
    '[data-testid="s1000d-row-handle"][aria-expanded="true"]',
  ],
  table: [
    '[data-testid="s1000d-table-handle"].is-menu-open',
    '[data-testid="s1000d-table-handle"].is-selected',
    '[data-testid="s1000d-table-handle"][aria-expanded="true"]',
  ],
};

interface S1000DContextMenuActionEntry extends TableContextMenuActionEntryLike<string> {
  action: S1000DContextMenuAction;
}

interface S1000DContextMenuSubmenuEntry extends TableContextMenuSubmenuEntryLike<string> {
  items: S1000DContextMenuActionEntry[];
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
  private readonly genericController: GenericTableMenuController;
  private previousMenuOpen = false;
  private pendingRepositionFrame: number | null = null;
  private forceClosed = false;
  private focusRestoreScope: S1000DTableMenuScope | null = null;
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
    this.genericController = new GenericTableMenuController({
      contextMenu: this.contextMenu,
      contextSubmenu: this.contextSubmenu,
      onCloseMenu: () => this.dispatchContextMenuClosed(),
      onRerender: () => this.onRender(),
      onRestoreFocus: () => this.restoreContextMenuFocus(),
    });
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
    this.genericController.destroy();
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
      this.previousMenuOpen = false;
      this.currentMenuSignature = '';
      this.currentSubmenuSignature = '';
      this.genericController.syncHidden();
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
      this.currentMenuSignature = menuSignature;
    } else {
      syncTableContextSubmenuTriggerExpandedState(this.contextMenu, this.genericController.openSubmenuId);
    }
    positionTableContextMenuElement(this.contextMenu, {
      anchor: getTableMenuLiveAnchor(this.root, menu.scope ?? 'cell', menu.anchor, LIVE_ANCHOR_SELECTORS),
      bounds: {
        left: 12,
        top: 12,
        right: Math.max(12, hostRect.width - 12),
        bottom: Math.max(12, hostRect.height - 12),
      },
      hostRect,
      scope: menu.scope ?? 'cell',
    });
    this.renderContextSubmenu(entries, hostRect);

    if (!this.previousMenuOpen) {
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
    this.genericController.syncAfterRender({
      focusOnOpen: menu.scope !== 'cell',
      menuOpen,
    });
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
    this.genericController.handleKeyDown(event, {
      activateOnEnterOrSpace: true,
      stopPropagation: false,
    });
  }

  closeContextMenu(restoreFocus: boolean): void {
    this.genericController.closeMenu(restoreFocus);
  }

  private dispatchContextMenuClosed(): void {
    this.forceClosed = true;
    this.contextMenu.hidden = true;
    this.contextMenu.setAttribute('aria-hidden', 'true');
    this.contextSubmenu.hidden = true;
    this.contextSubmenu.setAttribute('aria-hidden', 'true');
    this.root.dataset.contextMenuOpen = 'false';
    this.previousMenuOpen = false;
    this.currentSubmenuSignature = '';
    const interaction = getS1000DTableInteractionState(this.view.state);
    if (!interaction.contextMenuOpen) {
      return;
    }
    this.focusRestoreScope = interaction.menuScope;

    setS1000DTableInteractionMeta(this.view, {
      contextMenuOpen: false,
      menuScope: null,
      menuAnchor: null,
    });
  }

  private restoreContextMenuFocus(): void {
    if (this.focusRestoreScope === 'cell' && canRestoreMenuFocus(this.cellHandle)) {
      focusMenuButtonWithoutScroll(this.cellHandle);
    } else {
      this.root.ownerDocument.dispatchEvent(new CustomEvent('s1000d-focus-selection-trigger'));
    }
    this.focusRestoreScope = null;
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
      entries.push(this.createActionEntry(action));
    };
    const appendSubmenu = (key: string, label: string, actionIds: readonly string[]) => {
      const submenuItems = actionIds
        .map((actionId) => actionsById.get(actionId))
        .filter((action): action is S1000DContextMenuAction => Boolean(action))
        .map((action) => this.createActionEntry(action));
      if (submenuItems.length === 0) {
        return;
      }

      submenuItems.forEach((action) => consumed.add(action.actionId));
      entries.push({ kind: 'submenu', key, label, items: submenuItems });
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
        entries.push(this.createActionEntry(action));
      }
    }

    return entries;
  }

  private createActionEntry(action: S1000DContextMenuAction): S1000DContextMenuActionEntry {
    return {
      action,
      actionId: action.id,
      active: Boolean(action.active),
      destructive: Boolean(action.destructive),
      enabled: action.enabled,
      key: action.id,
      kind: 'action',
      label: action.label,
    };
  }

  private createContextMenuPanel(entries: readonly S1000DContextMenuEntry[]): HTMLDivElement {
    return createTableContextMenuPanel(this.root.ownerDocument, {
      createElement: (entry) => (
        entry.kind === 'submenu'
          ? this.createContextMenuSubmenuTrigger(entry)
          : this.createContextMenuActionButton(entry.action)
      ),
      entries,
      groupClassName: 'html-table-overlay__context-menu-group html-table-overlay__context-menu-group--stack',
    });
  }

  private renderContextSubmenu(entries: readonly S1000DContextMenuEntry[], hostRect: DOMRect): void {
    const submenuEntry = resolveOpenTableContextSubmenu(entries, this.genericController.openSubmenuId);
    if (!submenuEntry) {
      this.contextSubmenu.replaceChildren();
      this.contextSubmenu.hidden = true;
      this.contextSubmenu.setAttribute('aria-hidden', 'true');
      this.currentSubmenuSignature = '';
      return;
    }

    const trigger = this.contextMenu.querySelector(`[data-submenu-id="${submenuEntry.key}"]`);
    if (!(trigger instanceof HTMLButtonElement)) {
      this.contextSubmenu.replaceChildren();
      this.contextSubmenu.hidden = true;
      this.contextSubmenu.setAttribute('aria-hidden', 'true');
      this.currentSubmenuSignature = '';
      return;
    }

    this.contextSubmenu.hidden = false;
    this.contextSubmenu.setAttribute('aria-hidden', 'false');
    this.contextSubmenu.setAttribute('aria-label', `${submenuEntry.label} actions`);
    const submenuSignature = `${submenuEntry.key}:${submenuEntry.items.map((action) => `${action.actionId}:${action.enabled}:${action.active ? '1' : '0'}`).join(',')}`;
    if (this.currentSubmenuSignature !== submenuSignature) {
      this.contextSubmenu.replaceChildren(this.createContextMenuPanel(submenuEntry.items));
      this.currentSubmenuSignature = submenuSignature;
    }

    const rootRect = this.contextMenu.getBoundingClientRect();
    const triggerRect = trigger.getBoundingClientRect();
    positionTableContextSubmenuElement(this.contextSubmenu, {
      bounds: {
        left: 0,
        top: 0,
        right: hostRect.width,
        bottom: hostRect.height,
      },
      gap: SUBMENU_GAP,
      hostRect,
      submenuHeight: this.contextSubmenu.offsetHeight,
      submenuWidth: this.contextSubmenu.offsetWidth,
      triggerRect: {
        left: rootRect.left,
        right: rootRect.right,
        top: triggerRect.top,
      } as Pick<DOMRect, 'left' | 'right' | 'top'>,
    });

  }

  private createContextMenuSubmenuTrigger(entry: S1000DContextMenuSubmenuEntry): HTMLButtonElement {
    return createTableContextMenuSubmenuButton(this.root.ownerDocument, {
      className: 'html-table-overlay__context-menu-action has-submenu',
      expanded: this.genericController.openSubmenuId === entry.key,
      key: entry.key,
      label: entry.label,
      onClick: (event) => {
        if (isKeyboardClick(event)) {
          event.preventDefault();
          this.genericController.toggleSubmenu(entry.key, true);
        }
      },
      onMouseDown: (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.genericController.toggleSubmenu(entry.key, true);
      },
      testId: `selection-menu-submenu-${entry.key}`,
    });
  }

  private createContextMenuActionButton(action: S1000DContextMenuAction): HTMLButtonElement {
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
    return createTableContextMenuActionButton(this.root.ownerDocument, {
      actionId: action.id,
      active: Boolean(action.active),
      className: 'html-table-overlay__context-menu-action',
      destructive: Boolean(action.destructive),
      disabled: !action.enabled,
      label: action.label,
      onClick: (event) => executeAction(event),
      onMouseDown: (event) => {
        event.preventDefault();
        event.stopPropagation();
      },
      tabIndex: action.enabled ? 0 : -1,
      testId: `selection-menu-item-${action.id}`,
    });
  }

  private getContextMenuSignature(
    scope: S1000DTableMenuScope,
    entries: readonly S1000DContextMenuEntry[],
  ): string {
    return [
      scope,
      ...entries.map((entry) => (
        entry.kind === 'submenu'
          ? `submenu:${entry.key}:${entry.items.map((action) => action.actionId).join(',')}`
          : `action:${entry.actionId}:${entry.enabled}:${entry.active ? '1' : '0'}`
      )),
    ].join('|');
  }
}
