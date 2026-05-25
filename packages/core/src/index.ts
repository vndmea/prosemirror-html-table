export { htmlTableNodeNames } from './names.js';
export { createHtmlTableGrid, getCellAt, isCellAnchor } from './grid.js';
export { createHtmlTableNodeSpecs, normalizeHtmlTableSchemaOptions } from './schema.js';

export type {
  HtmlTableNodeNameKey,
  HtmlTableNodeNames,
} from './names.js';

export type {
  HtmlTableCellRef,
  HtmlTableGrid,
  HtmlTableGridOptions,
  HtmlTableGridSlot,
  HtmlTableRowRef,
  HtmlTableSectionName,
} from './grid.js';

export type {
  HtmlTableNodeSpecs,
  HtmlTableSchemaOptions,
  NormalizedHtmlTableSchemaOptions,
} from './types.js';
