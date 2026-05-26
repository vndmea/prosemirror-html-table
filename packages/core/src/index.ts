export { createHtmlTableNode } from './builders.js';
export {
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  deleteColumn,
  deleteRow,
  deleteTable,
  fixTables,
  goToNextCell,
  goToPreviousCell,
  insertHtmlTable,
  mergeCells,
  mergeOrSplit,
  selectCell,
  selectColumn,
  selectRow,
  selectTable,
  setCellAttribute,
  splitCell,
  toggleHeaderCell,
  toggleHeaderColumn,
  toggleHeaderRow,
} from './commands.js';
export { htmlTableNodeNames } from './names.js';
export { createHtmlTableGrid, getCellAt, isCellAnchor } from './grid.js';
export { normalizeHtmlTable } from './normalize.js';
export { createHtmlTableNodeSpecs, normalizeHtmlTableSchemaOptions } from './schema.js';
export { CellSelection } from './selection.js';

export type { CreateHtmlTableOptions } from './builders.js';
export type {
  HtmlTableCellNavigationOptions,
  HtmlTableCommandOptions,
  InsertHtmlTableCommandOptions,
} from './commands.js';
export type { NormalizeHtmlTableOptions } from './normalize.js';
export type { HtmlTableNodeNameKey } from './names.js';

export type {
  HtmlTableCellRef,
  HtmlTableGrid,
  HtmlTableGridOptions,
  HtmlTableGridSlot,
  HtmlTableRowRef,
  HtmlTableSectionName,
} from './grid.js';

export type {
  HtmlTableNodeNames,
  HtmlTableNodeSpecs,
  HtmlTableSchemaOptions,
  NormalizedHtmlTableSchemaOptions,
} from './types.js';
