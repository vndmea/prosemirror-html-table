export { createHtmlTableCommands } from './commands.js';
export {
  getHtmlTableContextActionGroups,
  getHtmlTableContextActionCommand,
  getHtmlTableContextActions,
  getPrimaryHtmlTableContextAction,
  runHtmlTableContextAction,
} from './context-menu/actions.js';
export {
  findHtmlTableContextMenuAction,
  getHtmlTableContextMenuState,
  getHtmlTableContextTriggerButtonState,
  runHtmlTableContextMenuAction,
} from './context-menu/state.js';
export {
  createHtmlTableEditingPlugin,
} from './editing/plugin.js';
export {
  createHtmlTableHandlePlugin,
  htmlTableHandlePluginKey,
} from './overlay/plugin.js';
export {
  createHtmlTableInteractionPlugin,
  findSelectedHtmlTable,
  getHtmlTableContextTriggerState,
  getHtmlTableInteractionState,
  htmlTableInteractionPluginKey,
} from './interaction/plugin.js';
export { HtmlTableNodeView } from './table-view.js';

export {
  HtmlTable,
  HtmlTableBody,
  HtmlTableCaption,
  HtmlTableCell,
  HtmlTableCol,
  HtmlTableColgroup,
  createHtmlTableExtensions,
  HtmlTableExtensions,
  HtmlTableFoot,
  HtmlTableHead,
  HtmlTableHeaderCell,
  HtmlTableRow,
} from './nodes.js';

export { defaultHtmlTableTiptapOptions } from './options.js';
export * from './table-interaction/index.js';
export type {
  DistributeHtmlTableColumnsOptions,
  FitHtmlTableToWidthOptions,
  HtmlTableCellNavigationOptions,
  HtmlTableCommandOptions,
  InsertHtmlTableCommandOptions,
  MoveHtmlTableColumnToIndexOptions,
  MoveHtmlTableRowToIndexOptions,
  SetHtmlTableColumnWidthOptions,
} from './commands.js';
export type {
  HtmlTableContextAction,
  HtmlTableContextActionGroup,
  HtmlTableContextActionGroupId,
  HtmlTableContextActionId,
} from './context-menu/actions.js';
export type {
  HtmlTableContextMenuState,
  HtmlTableContextTriggerButtonState,
} from './context-menu/state.js';
export type {
  HtmlTableContextActionResolver,
  HtmlTableContextActionResolverParams,
  HtmlTableTiptapOptions,
} from './options.js';
export type { CreateHtmlTableExtensionsOptions } from './nodes.js';
export type {
  HtmlTableHoverKind,
  HtmlTableHoverState,
  HtmlTableInteractionState,
  HtmlTableResizeState,
  HtmlTableReference,
  HtmlTableSelectedAxisKind,
  HtmlTableSelectedAxisState,
} from './interaction/plugin.js';
export {
  findHtmlTableAtDOM,
  getRenderedHtmlTableContext,
  getSelectedRenderedHtmlTableContext,
  getSelectedRenderedHtmlTableGeometry,
  measureHtmlTableGeometry,
  measureRenderedColumnBoundaries,
  measureRenderedRowBoundaries,
} from './table-dom.js';
export type {
  HtmlTableColumnGeometry,
  HtmlTableDOMContext,
  HtmlTableGeometry,
  HtmlTableRect,
  HtmlTableRowGeometry,
} from './table-dom.js';
