export { createHtmlTableCommands } from './commands.js';
export {
  getHtmlTableContextActionCommand,
  getHtmlTableContextActions,
} from './html-table-actions.js';
export {
  createHtmlTableHandlePlugin,
  htmlTableHandlePluginKey,
} from './html-table-handles.js';
export {
  createHtmlTableInteractionPlugin,
  findSelectedHtmlTable,
  getHtmlTableInteractionState,
  htmlTableInteractionPluginKey,
} from './html-table-interaction.js';
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
export type {
  HtmlTableCellNavigationOptions,
  HtmlTableCommandOptions,
  InsertHtmlTableCommandOptions,
} from './commands.js';
export type {
  HtmlTableContextAction,
  HtmlTableContextActionId,
} from './html-table-actions.js';
export type { HtmlTableTiptapOptions } from './options.js';
export type { CreateHtmlTableExtensionsOptions } from './nodes.js';
export type {
  HtmlTableHoverKind,
  HtmlTableHoverState,
  HtmlTableInteractionState,
  HtmlTableResizeState,
  HtmlTableReference,
  HtmlTableSelectedAxisKind,
  HtmlTableSelectedAxisState,
} from './html-table-interaction.js';
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
