import { Plugin } from '@tiptap/pm/state';

import type { HtmlTableTiptapOptions } from './options.js';
import {
  HtmlTableOverlayView,
  htmlTableHandlePluginKey,
  type HtmlTableCellContextTriggerRenderState,
  type HtmlTableContextMenuAccessibleState,
  type HtmlTableContextMenuActionRenderState,
  type HtmlTableContextMenuGroupAccessibleState,
  type HtmlTableContextMenuHeaderState,
  type HtmlTableContextMenuPlacement,
  type HtmlTableContextMenuPosition,
  type HtmlTableContextMenuRenderState,
  type HtmlTableContextTriggerRenderState,
  type HtmlTableOverlayHandleText,
  type HtmlTableSelectionAnchor,
  type HtmlTableSelectionScope,
} from './html-table-overlay-view.js';

export {
  canRestoreHtmlTableContextMenuFocus,
  getHtmlTableCellContextTriggerRenderState,
  getHtmlTableContextMenuAccessibleState,
  getHtmlTableContextMenuActionRenderState,
  getHtmlTableContextMenuAriaControls,
  getHtmlTableContextMenuGroupAccessibleState,
  getHtmlTableContextMenuHeaderState,
  getHtmlTableContextMenuRenderState,
  getHtmlTableContextTriggerRenderState,
  getHtmlTableOverlayHandleText,
  getNextHtmlTableContextMenuActionIndex,
  getNextHtmlTableContextMenuTypeaheadIndex,
  isHtmlTableContextMenuDismissKey,
  isHtmlTableContextMenuExitKey,
  isHtmlTableContextMenuNavigationKey,
  isHtmlTableContextMenuTypeaheadKey,
  isHtmlTableKeyboardClick,
  shouldCloseHtmlTableContextMenuForTarget,
} from './html-table-menu-controller.js';
export {
  getHtmlTableContextMenuPosition,
  getHtmlTableContextMenuTransformOrigin,
  getHtmlTableSelectionAnchor,
  getHtmlTableSelectionScope,
} from './html-table-overlay-geometry.js';
export {
  isHtmlTableAxisHandleHovered,
  isHtmlTableAxisHandleVisible,
  isHtmlTableContextMenuExpandedForScope,
  isTableHandleVisible,
  shouldToggleHtmlTableContextMenuFromAxisHandle,
  shouldToggleHtmlTableContextMenuFromTableHandle,
} from './html-table-handle-controller.js';
export { isHtmlTableCellHandleVisible } from './html-table-cell-selection-controller.js';
export { shouldHideHtmlTableExtendButtons } from './html-table-extend-controller.js';
export {
  isHtmlTableInteractionLockedByResize,
  isHtmlTableResizeHandleVisible,
} from './html-table-resize-controller.js';

export {
  htmlTableHandlePluginKey,
  type HtmlTableCellContextTriggerRenderState,
  type HtmlTableContextMenuAccessibleState,
  type HtmlTableContextMenuActionRenderState,
  type HtmlTableContextMenuGroupAccessibleState,
  type HtmlTableContextMenuHeaderState,
  type HtmlTableContextMenuPlacement,
  type HtmlTableContextMenuPosition,
  type HtmlTableContextMenuRenderState,
  type HtmlTableContextTriggerRenderState,
  type HtmlTableOverlayHandleText,
  type HtmlTableSelectionAnchor,
  type HtmlTableSelectionScope,
};

export function createHtmlTableHandlePlugin(options: HtmlTableTiptapOptions): Plugin {
  return new Plugin({
    key: htmlTableHandlePluginKey,
    view(view) {
      return new HtmlTableOverlayView(view, options);
    },
  });
}
