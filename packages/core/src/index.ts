export { createHtmlTableNode } from './builders.js';
export {
  createHtmlTableCellAttributes,
  createTiptapHtmlTableCellAttributes,
  defaultHtmlTableCellAttributes,
  parseHtmlTableCellAttributes,
  renderHtmlTableCellAttributes,
} from './cell-attributes.js';
export {
  addFootSection,
  addHeadSection,
  addRowToBody,
  addRowToFoot,
  addRowToHead,
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  clearColumnContent,
  clearRowContent,
  clearSelectedCells,
  deleteColumn,
  duplicateColumn,
  distributeColumns,
  moveColumnLeft,
  moveColumnToIndex,
  moveColumnRight,
  moveRowDown,
  duplicateRow,
  moveRowToBody,
  moveRowToFoot,
  moveRowToHead,
  moveRowToIndex,
  moveRowUp,
  removeFootSection,
  removeHeadSection,
  removeColgroup,
  removeCaption,
  deleteRow,
  deleteTable,
  fitTableToWidth,
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
  setColgroup,
  setCaption,
  setCellAttribute,
  setCellBackgroundColor,
  setCellTextAlign,
  setCellVerticalAlign,
  setColumnWidth,
  splitCell,
  sortBodyRowsByColumn,
  toggleHeaderCell,
  toggleHeaderColumn,
  toggleHeaderRow,
} from './commands.js';
export { createFixTablesTransaction } from './fix-tables.js';
export {
  applyTableClipboardToSelection,
  clearSelectedCells as clearClipboardSelectedCells,
  forEachSelectedCell,
  getBottomRightCell,
  getSelectionMatrix,
  getTopLeftCell,
  isWholeTableSelection,
  parseHtmlTableClipboard,
  parsePlainTextTableClipboard,
  selectedCells,
  serializeCellSelectionToHtmlTable,
  serializeCellSelectionToText,
} from './clipboard.js';
export {
  findCellPos,
  findCellRange,
  findTable,
  setCellAttr,
  splitCellWithType,
  toggleHeader,
} from './compat.js';
export * as officialCompat from './compat.js';
export { htmlTableNodeNames } from './names.js';
export { createHtmlTableGrid, getCellAt, isCellAnchor } from './grid.js';
export { HtmlTableMap } from './table-map.js';
export { normalizeHtmlTable } from './normalize.js';
export { createHtmlTableNodeSpecs, normalizeHtmlTableSchemaOptions } from './schema.js';
export { CellSelection, isCellSelection } from './selection.js';
export { tableEditing, tableEditingKey } from './table-editing.js';

export type { CreateHtmlTableOptions } from './builders.js';
export type {
  HtmlTableCellNavigationOptions,
  HtmlTableCommandOptions,
  DistributeHtmlTableColumnsOptions,
  FitHtmlTableToWidthOptions,
  MoveHtmlTableColumnToIndexOptions,
  MoveHtmlTableRowToIndexOptions,
  SetHtmlTableColumnWidthOptions,
  HtmlTableSectionTargetOptions,
  InsertHtmlTableCommandOptions,
  HtmlTableSortRowsOptions,
} from './commands.js';
export type { ApplyTableClipboardOptions, ParsedClipboardCell, ParsedTableClipboard } from './clipboard.js';
export type { FindNodeResult, GetCellTypeOptions, ToggleHeaderOptions, ToggleHeaderType } from './compat.js';
export type { FixTablesTransactionOptions } from './fix-tables.js';
export type { NormalizeHtmlTableOptions } from './normalize.js';
export type { HtmlTableNodeNameKey } from './names.js';
export type { TableEditingOptions } from './table-editing.js';

export type {
  HtmlTableCellRef,
  HtmlTableGrid,
  HtmlTableGridOptions,
  HtmlTableGridSlot,
  HtmlTableRowRef,
  HtmlTableSectionName,
} from './grid.js';
export type { HtmlTableMapOptions, HtmlTableRect } from './table-map.js';

export type {
  HtmlTableCellAttributeSpec,
  HtmlTableCellAttributes,
  HtmlTableNodeNames,
  HtmlTableNodeSpecs,
  HtmlTableRenderedAttributes,
  HtmlTableSchemaOptions,
  NormalizedHtmlTableSchemaOptions,
} from './types.js';
