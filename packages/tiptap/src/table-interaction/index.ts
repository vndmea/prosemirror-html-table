export {
  findTableAtDOM,
  getRenderedTableContext,
} from './dom-adapter.js';
export type {
  TableDOMContext,
  TableDomAdapter,
} from './dom-adapter.js';

export {
  getVisibleTableRect,
  measureRenderedColumnBoundaries,
  measureRenderedRowBoundaries,
  toTableRect,
} from './dom-geometry.js';
export type {
  TableGeometry,
  TableRect,
} from './dom-geometry.js';

export {
  buildTableInteractionState,
  createDefaultTableInteractionState,
  defaultTableSelectedAxisState,
  deriveTableContextTriggerState,
} from './interaction-state.js';
export type {
  BuildTableInteractionStateOptions,
  TableContextTriggerState,
  TableHoverKind,
  TableHoverState,
  TableInteractionGeometry,
  TableInteractionMeta,
  TableInteractionState,
  TableReference,
  TableResizeState,
  TableSelectedAxisKind,
  TableSelectedAxisState,
} from './interaction-state.js';

export {
  getTableContextMenuPosition,
  getTableContextSubmenuPosition,
  getTableContextSubmenuTransformOrigin,
  getTableContextMenuTransformOrigin,
  getTableOverlayPositionState,
  getVisibleTableSelectionRect,
} from './overlay-geometry.js';
export type {
  TableContextSubmenuPlacement,
  TableContextSubmenuPosition,
  TableOverlayPositionState,
} from './overlay-geometry.js';

export {
  getTableOverlayMount,
  TableOverlayHost,
} from './overlay-host.js';

export {
  applyTableColumnPreviewWidths,
  TableResizeLifecycle,
} from './resize-lifecycle.js';

export {
  canToggleTableContextTriggerMenu,
  createTableContextMenuElement,
  createTableContextMenuActionButton,
  createTableContextMenuPanel,
  createTableContextMenuSubmenuButton,
  createTableContextSubmenuState,
  closeTableContextSubmenu,
  consumeTableContextSubmenuAutoFocus,
  consumeTableContextSubmenuTriggerToFocus,
  focusFirstEnabledMenuButton,
  focusMenuButtonWithoutScroll,
  getEnabledMenuButtons,
  getNextMenuActionIndex,
  getScopedTableMenuToggleAction,
  getTableMenuLiveAnchor,
  getTableMenuAnchorForElement,
  getTableMenuToggleAction,
  isMenuTypeaheadKey,
  openTableContextSubmenu,
  positionTableContextMenuElement,
  positionTableContextSubmenuElement,
  resetTableContextSubmenuState,
  resolveOpenTableContextSubmenu,
  shouldCloseMenuForTarget,
  isMenuDismissKey,
  isMenuExitKey,
  isMenuNavigationKey,
  getNextMenuTypeaheadIndex,
  isKeyboardClick,
  canRestoreMenuFocus,
  MenuTypeaheadController,
  syncTableContextSubmenuTriggerExpandedState,
} from './menu-controller.js';
export type {
  TableContextMenuActionEntryLike,
  TableContextMenuPanelEntryLike,
  TableContextMenuSubmenuEntryLike,
  TableContextSubmenuState,
  TableMenuScope,
  TableMenuViewportBounds,
} from './menu-controller.js';

export {
  isTableAxisHandleHovered,
  isTableAxisHandleSelected,
  isTableAxisHandleVisible,
  shouldToggleTableContextMenuFromAxisHandle,
  shouldToggleTableContextMenuFromTableHandle,
} from './handle-state.js';
export type {
  TableAxisInteractionStateLike,
  TableAxisSelectionStateLike,
  TableHoverStateLike,
  TableResizeStateLike,
  TableAxisStateMatchOptions,
} from './handle-state.js';
