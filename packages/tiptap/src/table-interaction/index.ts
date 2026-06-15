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
  getTableContextMenuTransformOrigin,
  getTableOverlayPositionState,
  getVisibleTableSelectionRect,
} from './overlay-geometry.js';
export type {
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
  getNextMenuActionIndex,
  isMenuTypeaheadKey,
  shouldCloseMenuForTarget,
  isMenuDismissKey,
  isMenuExitKey,
  isMenuNavigationKey,
  getNextMenuTypeaheadIndex,
  isKeyboardClick,
  canRestoreMenuFocus,
  MenuTypeaheadController,
} from './menu-controller.js';
