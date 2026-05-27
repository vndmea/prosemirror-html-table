export { createHtmlTableCommands } from './commands.js';
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
export type { HtmlTableTiptapOptions } from './options.js';
export type {
  HtmlTableHoverKind,
  HtmlTableHoverState,
  HtmlTableInteractionState,
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
