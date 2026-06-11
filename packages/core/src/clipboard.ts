import { Fragment, Slice, type Node as ProseMirrorNode, type Schema } from 'prosemirror-model';
import { NodeSelection, TextSelection, type EditorState, type Selection, type Transaction } from 'prosemirror-state';
import { Transform } from 'prosemirror-transform';

import { createHtmlTableCellAttributes } from './cell-attributes.js';
import { createHtmlTableGrid, type HtmlTableCellRef, type HtmlTableGrid, type HtmlTableSectionName } from './grid.js';
import { inferHtmlTableNodeNames, resolveHtmlTableNodeNames } from './names.js';
import { CellSelection, isCellSelection } from './selection.js';
import type { HtmlTableNodeNames } from './types.js';

const CLIPBOARD_PAYLOAD_ATTR = 'data-pmht-clipboard';
const TABLE_TAG_PATTERN = /<table\b/i;
const SECTION_TAG_PATTERN = /<(thead|tbody|tfoot)\b[^>]*>([\s\S]*?)<\/\1>/gi;
const ROW_TAG_PATTERN = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
const CELL_TAG_PATTERN = /<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
const ATTR_PATTERN = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
const STYLE_ENTRY_PATTERN = /([a-zA-Z-]+)\s*:\s*([^;]+)/g;

interface TableContext {
  table: ProseMirrorNode;
  tablePos: number;
  names: HtmlTableNodeNames;
}

interface CellContext extends TableContext {
  cell: HtmlTableCellRef;
}

interface CellSelectionInfo extends CellContext {
  grid: HtmlTableGrid;
  anchorCell: HtmlTableCellRef;
  headCell: HtmlTableCellRef;
  cells: HtmlTableCellRef[];
  top: number;
  bottom: number;
  left: number;
  right: number;
  cellPositions: Map<HtmlTableCellRef, number>;
}

interface SerializedClipboardCell {
  attrs: Record<string, unknown>;
  content: unknown;
  isHeader: boolean;
}

interface SerializedClipboardPayload {
  kind: 'cells' | 'table';
  rows: SerializedClipboardCell[][];
  table?: unknown;
}

interface ClipboardGrid {
  width: number;
  height: number;
  slots: ParsedClipboardCell[][];
}

interface ClipboardAnchorSlot {
  row: number;
  column: number;
}

interface TiledClipboardSlot {
  cell: ParsedClipboardCell;
  anchorRow: number;
  anchorColumn: number;
}

type StructuralSlotAssignment =
  | { kind: 'table'; cell: HtmlTableCellRef }
  | { kind: 'clipboard'; cell: ParsedClipboardCell };

export interface ParsedClipboardCell {
  attrs?: Record<string, unknown>;
  content?: Fragment;
  text?: string;
  colspan?: number;
  rowspan?: number;
  isHeader?: boolean;
}

export interface ParsedTableClipboard {
  rows: ParsedClipboardCell[][];
  table?: ProseMirrorNode;
}

export interface HtmlTableClipboardOptions {
  tablePos?: number;
  names?: Partial<HtmlTableNodeNames>;
}

export interface ApplyTableClipboardOptions extends HtmlTableClipboardOptions {
  expandTableOnPaste?: boolean;
}

export function parseTableSliceClipboard(
  slice: Slice,
  schema: Schema,
  options: Pick<HtmlTableClipboardOptions, 'names'> = {},
): ParsedTableClipboard | null {
  const names = resolveHtmlTableNodeNames(options.names);
  const tableNode = findTableNodeInSlice(slice, names);
  if (tableNode) {
    const tableNames = inferHtmlTableNodeNames(tableNode, names);
    const result: ParsedTableClipboard = {
      rows: extractClipboardRows(schema, tableNode, tableNames),
    };
    if (tableNode.type.name === tableNames.table || tableNode.type.spec.tableRole === 'table') {
      result.table = tableNode;
    }
    return result;
  }

  const rows = extractRowsFromSlice(slice, schema, names);
  return rows.length > 0 ? { rows } : null;
}

export function createSingleCellSliceClipboard(
  schema: Schema,
  slice: Slice,
  options: Pick<HtmlTableClipboardOptions, 'names'> & { isHeader?: boolean } = {},
): ParsedTableClipboard {
  const names = resolveHtmlTableNodeNames(options.names);
  const content = fitSliceToCellContent(schema, slice, options.isHeader ?? false, names);
  return {
    rows: [[{
      content,
      text: fragmentText(content),
      isHeader: options.isHeader ?? false,
    }]],
  };
}

export function clipTableClipboard(
  schema: Schema,
  clipboard: ParsedTableClipboard,
  width: number,
  height: number,
): ParsedTableClipboard {
  if (clipboard.rows.length === 0 || width <= 0 || height <= 0) {
    return { ...clipboard, rows: [] };
  }

  const sourceGrid = createClipboardGrid(clipboard);
  if (sourceGrid.width === 0 || sourceGrid.height === 0) {
    return { ...clipboard, rows: [] };
  }

  const sourceAnchors = createClipboardAnchorGrid(sourceGrid);
  const tiledGrid = createRepeatedClipboardGrid(sourceGrid, sourceAnchors, width, height);
  const clippedRows = createClipboardRowsFromGrid(schema, tiledGrid, width, height);

  return {
    ...clipboard,
    rows: clippedRows,
  };
}

export function serializeCellSelectionToHtmlTable(
  state: EditorState,
  options: HtmlTableClipboardOptions = {},
): string | null {
  const wholeTable = getWholeTableClipboardContext(state, options);
  if (wholeTable) {
    const rows = extractClipboardRows(state.schema, wholeTable.table, wholeTable.names);
    const payload = encodeClipboardPayload({
      kind: 'table',
      rows: serializeClipboardRows(rows),
      table: wholeTable.table.toJSON(),
    });
    return serializeTableNodeToHtml(wholeTable.table, wholeTable.names, payload);
  }

  const selectionInfo = getCellSelectionInfo(state, options);
  if (!selectionInfo) return null;

  const rows = getClipboardRowsFromSelection(state.schema, selectionInfo);
  const payload = encodeClipboardPayload({
    kind: 'cells',
    rows: serializeClipboardRows(rows),
  });

  return serializeClipboardRowsToHtml(rows, payload);
}

export function serializeCellSelectionToText(
  state: EditorState,
  options: HtmlTableClipboardOptions = {},
): string | null {
  const wholeTable = getWholeTableClipboardContext(state, options);
  if (wholeTable) {
    const rows = extractClipboardRows(state.schema, wholeTable.table, wholeTable.names);
    return serializeClipboardRowsToText(rows);
  }

  const selectionInfo = getCellSelectionInfo(state, options);
  if (!selectionInfo) return null;

  return serializeClipboardRowsToText(getClipboardRowsFromSelection(state.schema, selectionInfo));
}

export function parseHtmlTableClipboard(html: string, schema: Schema): ParsedTableClipboard | null {
  if (!TABLE_TAG_PATTERN.test(html)) return null;

  const payload = decodeClipboardPayload(extractClipboardPayload(html), schema);
  if (payload) return payload;

  const rows = extractRowsFromHtml(html).map((row) => row.map((cell) => parseHtmlClipboardCell(cell, schema)));
  return rows.length > 0 ? { rows } : null;
}

export function parsePlainTextTableClipboard(text: string, schema?: Schema): ParsedTableClipboard | null {
  const normalized = text.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ');
  if (!normalized.trim()) return null;

  const rows = normalized.split('\n').map((line) =>
    line.split('\t').map<ParsedClipboardCell>((value) => {
      const cell: ParsedClipboardCell = { text: value };
      if (schema) cell.content = createTextCellContent(schema, value);
      return cell;
    }),
  );

  return rows.length > 0 ? { rows } : null;
}

export function applyTableClipboardToSelection(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
  clipboard: ParsedTableClipboard,
  options: ApplyTableClipboardOptions = {},
): boolean {
  const names = resolveHtmlTableNodeNames(options.names);
  if (
    clipboard.table
    && state.selection instanceof NodeSelection
    && (state.selection.node.type.name === names.table || state.selection.node.type.spec.tableRole === 'table')
  ) {
    if (!dispatch) return true;
    dispatch(state.tr.replaceSelectionWith(clipboard.table).scrollIntoView());
    return true;
  }

  const selectionInfo = getCellSelectionInfo(state, options);
  const cellContext = selectionInfo ? undefined : findCellContext(state, options);
  const context = selectionInfo ?? cellContext;
  if (!context || clipboard.rows.length === 0) return false;
  if (options.expandTableOnPaste) return false;

  const grid = selectionInfo?.grid ?? createHtmlTableGrid(context.table, { names: context.names });
  const effectiveClipboard = isCellSelection(state.selection) && selectionInfo
    ? clipTableClipboard(
      state.schema,
      clipboard,
      selectionInfo.right - selectionInfo.left + 1,
      selectionInfo.bottom - selectionInfo.top + 1,
    )
    : clipboard;
  const clipboardGrid = createClipboardGrid(effectiveClipboard);
  const startRow = selectionInfo?.top ?? cellContext?.cell.rowIndex ?? 0;
  const startColumn = selectionInfo?.left ?? cellContext?.cell.columnIndex ?? 0;
  const assignments = createStructuralSlotAssignments(grid);
  const applied = overlayClipboardGrid(assignments, clipboardGrid, startRow, startColumn);
  if (!applied) return false;
  const nextTable = rebuildTableFromAssignments(state.schema, context, grid, assignments);
  const updatedBottomRow = Math.min(grid.height - 1, startRow + Math.max(clipboardGrid.height, 1) - 1);
  const updatedRightColumn = Math.min(grid.width - 1, startColumn + Math.max(clipboardGrid.width, 1) - 1);

  if (!dispatch) return true;

  const transaction = state.tr.replaceWith(context.tablePos, context.tablePos + context.table.nodeSize, nextTable);
  const nextContext: TableContext = { ...context, table: nextTable };
  const nextGrid = createHtmlTableGrid(nextTable, { names: context.names });
  const nextStartCell = nextGrid.slots[startRow]?.[startColumn]?.cell;
  const nextEndCell = nextGrid.slots[updatedBottomRow]?.[updatedRightColumn]?.cell ?? nextStartCell;
  const nextPositions = collectCellPositions(nextContext, nextGrid);

  if (nextStartCell) {
    const anchorCellPos = nextPositions.get(nextStartCell);
    const headCellPos = nextEndCell ? nextPositions.get(nextEndCell) : anchorCellPos;
    if (typeof anchorCellPos === 'number') {
      if (clipboardGrid.height > 1 || clipboardGrid.width > 1) {
        transaction.setSelection(CellSelection.create(transaction.doc, anchorCellPos, headCellPos ?? anchorCellPos));
      } else {
        transaction.setSelection(TextSelection.near(transaction.doc.resolve(anchorCellPos + 1)));
      }
    }
  }

  dispatch(transaction.scrollIntoView());
  return true;
}

export function clearSelectedCells(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
  options: HtmlTableClipboardOptions = {},
): boolean {
  const selectionInfo = getCellSelectionInfo(state, options);
  if (isCellSelection(state.selection) && !selectionInfo) return false;

  const cellContext = selectionInfo ? undefined : findCellContext(state, options);
  const context = selectionInfo ?? cellContext;
  if (!context) return false;

  const grid = selectionInfo?.grid ?? createHtmlTableGrid(context.table, { names: context.names });
  const cellsToClear = new Set(selectionInfo?.cells ?? (cellContext ? [cellContext.cell] : []));
  if (cellsToClear.size === 0) return false;

  const nextTable = updateCellsMatching(context, grid, (cell) => cellsToClear.has(cell), (cell) =>
    cell.node.type.create(cell.node.attrs, createEmptyCellContent(state.schema)));

  if (!dispatch) return true;
  dispatch(replaceTable(state, context, nextTable).scrollIntoView());
  return true;
}

export function isWholeTableSelection(
  state: EditorState,
  options: HtmlTableClipboardOptions = {},
): boolean {
  const names = resolveHtmlTableNodeNames(options.names);
  if (
    state.selection instanceof NodeSelection
    && (state.selection.node.type.name === names.table || state.selection.node.type.spec.tableRole === 'table')
  ) {
    return true;
  }

  const selectionInfo = getCellSelectionInfo(state, options);
  if (!selectionInfo || selectionInfo.grid.cells.length === 0) return false;

  return (
    selectionInfo.top === 0
    && selectionInfo.left === 0
    && selectionInfo.bottom === selectionInfo.grid.height - 1
    && selectionInfo.right === selectionInfo.grid.width - 1
    && selectionInfo.cells.length === selectionInfo.grid.cells.length
  );
}

export function getTopLeftCell(
  state: EditorState,
  options: HtmlTableClipboardOptions = {},
): HtmlTableCellRef | undefined {
  return getCellSelectionInfo(state, options)?.grid.slots[getCellSelectionInfo(state, options)!.top]?.[
    getCellSelectionInfo(state, options)!.left
  ]?.cell;
}

export function getBottomRightCell(
  state: EditorState,
  options: HtmlTableClipboardOptions = {},
): HtmlTableCellRef | undefined {
  const selectionInfo = getCellSelectionInfo(state, options);
  return selectionInfo?.grid.slots[selectionInfo.bottom]?.[selectionInfo.right]?.cell;
}

export function selectedCells(
  state: EditorState,
  options: HtmlTableClipboardOptions = {},
): HtmlTableCellRef[] {
  return getCellSelectionInfo(state, options)?.cells ?? [];
}

export function forEachSelectedCell(
  state: EditorState,
  callback: (cell: HtmlTableCellRef, rowIndex: number, columnIndex: number) => void,
  options: HtmlTableClipboardOptions = {},
): void {
  const selectionInfo = getCellSelectionInfo(state, options);
  if (!selectionInfo) return;

  for (const cell of selectionInfo.cells) {
    callback(cell, cell.rowIndex, cell.columnIndex);
  }
}

export function getSelectionMatrix(
  state: EditorState,
  options: HtmlTableClipboardOptions = {},
): Array<Array<HtmlTableCellRef | null>> {
  const selectionInfo = getCellSelectionInfo(state, options);
  if (!selectionInfo) return [];

  const rows: Array<Array<HtmlTableCellRef | null>> = [];
  for (let rowIndex = selectionInfo.top; rowIndex <= selectionInfo.bottom; rowIndex += 1) {
    const row: Array<HtmlTableCellRef | null> = [];
    for (let columnIndex = selectionInfo.left; columnIndex <= selectionInfo.right; columnIndex += 1) {
      row.push(selectionInfo.grid.slots[rowIndex]?.[columnIndex]?.cell ?? null);
    }
    rows.push(row);
  }
  return rows;
}

function serializeClipboardRows(rows: ParsedClipboardCell[][]): SerializedClipboardCell[][] {
  return rows.map((row) =>
    row.map((cell) => ({
      attrs: cell.attrs ?? {},
      content: cell.content?.toJSON() ?? null,
      isHeader: cell.isHeader ?? false,
    })));
}

function encodeClipboardPayload(payload: SerializedClipboardPayload): string {
  return encodeBase64UrlUtf8(JSON.stringify(payload));
}

function extractClipboardPayload(html: string): string | null {
  const doubleQuoted = new RegExp(`${CLIPBOARD_PAYLOAD_ATTR}="([^"]+)"`, 'i').exec(html)?.[1];
  if (doubleQuoted) return doubleQuoted;
  return new RegExp(`${CLIPBOARD_PAYLOAD_ATTR}='([^']+)'`, 'i').exec(html)?.[1] ?? null;
}

function decodeClipboardPayload(payload: string | null, schema: Schema): ParsedTableClipboard | null {
  if (!payload) return null;

  try {
    const decoded = JSON.parse(decodeBase64UrlUtf8(payload)) as SerializedClipboardPayload;
    const rows = decoded.rows.map((row) =>
      row.map<ParsedClipboardCell>((cell) => {
        const parsed: ParsedClipboardCell = {
          attrs: cell.attrs ?? {},
          isHeader: cell.isHeader,
        };
        if (cell.content) parsed.content = Fragment.fromJSON(schema, cell.content);
        return parsed;
      }));

    const result: ParsedTableClipboard = { rows };
    if (decoded.kind === 'table' && decoded.table) result.table = schema.nodeFromJSON(decoded.table);
    return result;
  } catch {
    return null;
  }
}

function getWholeTableClipboardContext(
  state: EditorState,
  options: HtmlTableClipboardOptions,
): TableContext | undefined {
  const names = resolveHtmlTableNodeNames(options.names);
  if (
    state.selection instanceof NodeSelection
    && (state.selection.node.type.name === names.table || state.selection.node.type.spec.tableRole === 'table')
  ) {
    return findTableContext(state, { ...options, tablePos: state.selection.from });
  }

  if (!isWholeTableSelection(state, options)) return undefined;
  return findTableContext(state, options);
}

function getClipboardRowsFromSelection(schema: Schema, selectionInfo: CellSelectionInfo): ParsedClipboardCell[][] {
  const rows: ParsedClipboardCell[][] = [];
  for (let rowIndex = selectionInfo.top; rowIndex <= selectionInfo.bottom; rowIndex += 1) {
    const row: ParsedClipboardCell[] = [];
    const seen = new Set<HtmlTableCellRef>();
    for (let columnIndex = selectionInfo.left; columnIndex <= selectionInfo.right; columnIndex += 1) {
      const cell = selectionInfo.grid.slots[rowIndex]?.[columnIndex]?.cell;
      if (!cell || seen.has(cell)) continue;
      seen.add(cell);
      row.push(createParsedClipboardCell(schema, selectionInfo.names, cell.node));
    }
    rows.push(row);
  }
  return rows;
}

function extractRowsFromSlice(
  slice: Slice,
  schema: Schema,
  names: HtmlTableNodeNames,
): ParsedClipboardCell[][] {
  const rowNodes: ProseMirrorNode[] = [];
  const standaloneCells: ProseMirrorNode[] = [];

  slice.content.forEach((node) => {
    if (node.type.name === names.table || node.type.spec.tableRole === 'table') {
      rowNodes.push(...getTableRowNodes(node, inferHtmlTableNodeNames(node, names)));
      return;
    }

    if (getSectionName(node, names)) {
      node.forEach((row) => rowNodes.push(row));
      return;
    }

    if (node.type.name === names.row || node.type.spec.tableRole === 'row') {
      rowNodes.push(node);
      return;
    }

    if (isCellNode(node, names)) {
      standaloneCells.push(node);
    }
  });

  if (rowNodes.length > 0) {
    return rowNodes.map((row) => {
      const cells: ParsedClipboardCell[] = [];
      row.forEach((cell) => {
        cells.push(createParsedClipboardCell(schema, names, cell));
      });
      return cells;
    });
  }

  if (standaloneCells.length > 0) {
    return [standaloneCells.map((cell) => createParsedClipboardCell(schema, names, cell))];
  }

  return [];
}

function extractClipboardRows(schema: Schema, table: ProseMirrorNode, names: HtmlTableNodeNames): ParsedClipboardCell[][] {
  const grid = createHtmlTableGrid(table, { names });
  const rows: ParsedClipboardCell[][] = [];
  for (let rowIndex = 0; rowIndex < grid.height; rowIndex += 1) {
    const row: ParsedClipboardCell[] = [];
    const seen = new Set<HtmlTableCellRef>();
    for (let columnIndex = 0; columnIndex < grid.width; columnIndex += 1) {
      const cell = grid.slots[rowIndex]?.[columnIndex]?.cell;
      if (!cell || seen.has(cell)) continue;
      seen.add(cell);
      row.push(createParsedClipboardCell(schema, names, cell.node));
    }
    rows.push(row);
  }
  return rows;
}

function createParsedClipboardCell(
  schema: Schema,
  names: HtmlTableNodeNames,
  cell: ProseMirrorNode,
): ParsedClipboardCell {
  return {
    attrs: { ...cell.attrs },
    content: cloneCellContent(schema, cell.content),
    text: getCellText(cell),
    colspan: Math.max(1, Number(cell.attrs.colspan ?? 1)),
    rowspan: Math.max(1, Number(cell.attrs.rowspan ?? 1)),
    isHeader: cell.type.name === names.headerCell,
  };
}

function createClipboardGrid(clipboard: ParsedTableClipboard): ClipboardGrid {
  const slots: ParsedClipboardCell[][] = [];
  let width = 0;

  for (let rowIndex = 0; rowIndex < clipboard.rows.length; rowIndex += 1) {
    const row = clipboard.rows[rowIndex] ?? [];
    const slotRow = slots[rowIndex] ?? (slots[rowIndex] = []);
    let columnIndex = 0;

    for (const cell of row) {
      while (slotRow[columnIndex]) columnIndex += 1;

      const colSpan = getClipboardCellColSpan(cell);
      const rowSpan = getClipboardCellRowSpan(cell);
      for (let rowOffset = 0; rowOffset < rowSpan; rowOffset += 1) {
        const targetRow = slots[rowIndex + rowOffset] ?? (slots[rowIndex + rowOffset] = []);
        for (let columnOffset = 0; columnOffset < colSpan; columnOffset += 1) {
          targetRow[columnIndex + columnOffset] = cell;
        }
      }

      width = Math.max(width, columnIndex + colSpan);
      columnIndex += colSpan;
    }
  }

  return {
    width,
    height: slots.length,
    slots,
  };
}

function createClipboardAnchorGrid(grid: ClipboardGrid): Array<Array<ClipboardAnchorSlot | null>> {
  const anchors: Array<Array<ClipboardAnchorSlot | null>> = [];

  for (let rowIndex = 0; rowIndex < grid.height; rowIndex += 1) {
    const sourceRow = grid.slots[rowIndex] ?? [];
    const anchorRow = anchors[rowIndex] ?? (anchors[rowIndex] = []);
    for (let columnIndex = 0; columnIndex < grid.width; columnIndex += 1) {
      const cell = sourceRow[columnIndex];
      if (!cell) {
        anchorRow[columnIndex] = null;
        continue;
      }

      const aboveCell = rowIndex > 0 ? grid.slots[rowIndex - 1]?.[columnIndex] : undefined;
      if (aboveCell === cell) {
        anchorRow[columnIndex] = anchors[rowIndex - 1]?.[columnIndex] ?? null;
        continue;
      }

      const leftCell = columnIndex > 0 ? sourceRow[columnIndex - 1] : undefined;
      if (leftCell === cell) {
        anchorRow[columnIndex] = anchorRow[columnIndex - 1] ?? null;
        continue;
      }

      anchorRow[columnIndex] = { row: rowIndex, column: columnIndex };
    }
  }

  return anchors;
}

function createRepeatedClipboardGrid(
  sourceGrid: ClipboardGrid,
  sourceAnchors: Array<Array<ClipboardAnchorSlot | null>>,
  width: number,
  height: number,
): Array<Array<TiledClipboardSlot | null>> {
  const repeated: Array<Array<TiledClipboardSlot | null>> = [];

  for (let rowIndex = 0; rowIndex < height; rowIndex += 1) {
    const row = repeated[rowIndex] ?? (repeated[rowIndex] = []);
    const sourceRowIndex = rowIndex % sourceGrid.height;

    for (let columnIndex = 0; columnIndex < width; columnIndex += 1) {
      const sourceColumnIndex = columnIndex % sourceGrid.width;
      const cell = sourceGrid.slots[sourceRowIndex]?.[sourceColumnIndex];
      const anchor = sourceAnchors[sourceRowIndex]?.[sourceColumnIndex];

      if (!cell || !anchor) {
        row[columnIndex] = null;
        continue;
      }

      row[columnIndex] = {
        cell,
        anchorRow: rowIndex - (sourceRowIndex - anchor.row),
        anchorColumn: columnIndex - (sourceColumnIndex - anchor.column),
      };
    }
  }

  return repeated;
}

function createClipboardRowsFromGrid(
  schema: Schema,
  grid: Array<Array<TiledClipboardSlot | null>>,
  width: number,
  height: number,
): ParsedClipboardCell[][] {
  const rows: ParsedClipboardCell[][] = [];

  for (let rowIndex = 0; rowIndex < height; rowIndex += 1) {
    const row: ParsedClipboardCell[] = [];

    for (let columnIndex = 0; columnIndex < width;) {
      const slot = grid[rowIndex]?.[columnIndex] ?? null;
      if (!slot) {
        columnIndex += 1;
        continue;
      }

      if (slot.anchorRow !== rowIndex || slot.anchorColumn !== columnIndex) {
        columnIndex += 1;
        continue;
      }

      let rectWidth = 1;
      while (
        columnIndex + rectWidth < width
        && isSameTiledClipboardSlot(grid[rowIndex]?.[columnIndex + rectWidth] ?? null, slot)
      ) {
        rectWidth += 1;
      }

      let rectHeight = 1;
      while (rowIndex + rectHeight < height) {
        let matches = true;
        for (let currentColumn = columnIndex; currentColumn < columnIndex + rectWidth; currentColumn += 1) {
          if (!isSameTiledClipboardSlot(grid[rowIndex + rectHeight]?.[currentColumn] ?? null, slot)) {
            matches = false;
            break;
          }
        }
        if (!matches) break;
        rectHeight += 1;
      }

      let clippedCell = cloneParsedClipboardCell(schema, slot.cell);
      clippedCell = setClipboardCellColSpan(schema, clippedCell, rectWidth);
      clippedCell = setClipboardCellRowSpan(schema, clippedCell, rectHeight);
      row.push(clippedCell);
      columnIndex += rectWidth;
    }

    rows.push(row);
  }

  return rows;
}

function isSameTiledClipboardSlot(
  left: TiledClipboardSlot | null,
  right: TiledClipboardSlot | null,
): boolean {
  if (!left || !right) return false;
  return (
    left.cell === right.cell
    && left.anchorRow === right.anchorRow
    && left.anchorColumn === right.anchorColumn
  );
}

function createStructuralSlotAssignments(grid: HtmlTableGrid): Array<Array<StructuralSlotAssignment | null>> {
  return grid.slots.map((row) =>
    row.map((slot) => (slot ? { kind: 'table', cell: slot.cell } : null)));
}

function overlayClipboardGrid(
  assignments: Array<Array<StructuralSlotAssignment | null>>,
  clipboardGrid: ClipboardGrid,
  startRow: number,
  startColumn: number,
): boolean {
  let applied = false;

  for (let rowOffset = 0; rowOffset < clipboardGrid.height; rowOffset += 1) {
    const row = clipboardGrid.slots[rowOffset] ?? [];
    for (let columnOffset = 0; columnOffset < clipboardGrid.width; columnOffset += 1) {
      const clipboardCell = row[columnOffset];
      if (!clipboardCell) continue;

      const targetRowIndex = startRow + rowOffset;
      const targetColumnIndex = startColumn + columnOffset;
      const targetRow = assignments[targetRowIndex];
      if (!targetRow || targetColumnIndex < 0 || targetColumnIndex >= targetRow.length) continue;

      targetRow[targetColumnIndex] = {
        kind: 'clipboard',
        cell: clipboardCell,
      };
      applied = true;
    }
  }

  return applied;
}

function rebuildTableFromAssignments(
  schema: Schema,
  context: TableContext,
  grid: HtmlTableGrid,
  assignments: Array<Array<StructuralSlotAssignment | null>>,
): ProseMirrorNode {
  const tableChildren = getChildren(context.table);
  const sectionCounters: Record<HtmlTableSectionName, number> = { head: 0, body: 0, foot: 0 };

  context.table.forEach((sectionNode, _offset, childIndex) => {
    const sectionName = getSectionName(sectionNode, context.names);
    if (!sectionName) return;

    const sectionIndex = sectionCounters[sectionName];
    sectionCounters[sectionName] += 1;
    const sectionRows = grid.rows.filter((row) => row.section === sectionName && row.sectionIndex === sectionIndex);
    const rowRange = {
      start: sectionRows[0]?.rowIndex ?? 0,
      end: sectionRows[sectionRows.length - 1]?.rowIndex ?? -1,
    };

    const rows = sectionRows.map((rowRef) => {
      const sourceRow = sectionNode.child(rowRef.rowIndexInSection);
      const rowChildren = buildRowFromAssignments(
        schema,
        context.names,
        assignments,
        rowRef.rowIndex,
        rowRange.start,
        rowRange.end,
        grid.width,
        sectionName,
      );
      return sourceRow.type.create(sourceRow.attrs, rowChildren, sourceRow.marks);
    });

    tableChildren[childIndex] = sectionNode.type.create(sectionNode.attrs, rows, sectionNode.marks);
  });

  return context.table.type.create(context.table.attrs, tableChildren, context.table.marks);
}

function buildRowFromAssignments(
  schema: Schema,
  names: HtmlTableNodeNames,
  assignments: Array<Array<StructuralSlotAssignment | null>>,
  rowIndex: number,
  sectionStartRow: number,
  sectionEndRow: number,
  width: number,
  sectionName: HtmlTableSectionName,
): ProseMirrorNode[] {
  const rowChildren: ProseMirrorNode[] = [];
  const row = assignments[rowIndex] ?? [];

  for (let columnIndex = 0; columnIndex < width;) {
    const assignment = row[columnIndex] ?? null;

    if (!assignment) {
      rowChildren.push(createEmptyTableCell(schema, names, sectionName === 'head' ? 'header' : 'body'));
      columnIndex += 1;
      continue;
    }

    if (
      isSameAssignment(assignments[rowIndex]?.[columnIndex - 1] ?? null, assignment)
      || isSameAssignment(assignments[rowIndex - 1]?.[columnIndex] ?? null, assignment)
    ) {
      columnIndex += 1;
      continue;
    }

    const rect = measureAssignmentRect(assignments, rowIndex, columnIndex, assignment, sectionEndRow, width);
    rowChildren.push(createNodeFromAssignment(schema, names, assignment, rect.width, rect.height));
    columnIndex += rect.width;
  }

  if (rowChildren.length === 0 && sectionStartRow <= sectionEndRow) {
    return rowChildren;
  }

  return rowChildren;
}

function measureAssignmentRect(
  assignments: Array<Array<StructuralSlotAssignment | null>>,
  rowIndex: number,
  columnIndex: number,
  assignment: StructuralSlotAssignment,
  sectionEndRow: number,
  width: number,
): { width: number; height: number } {
  let rectWidth = 1;
  while (
    columnIndex + rectWidth < width
    && isSameAssignment(assignments[rowIndex]?.[columnIndex + rectWidth] ?? null, assignment)
  ) {
    rectWidth += 1;
  }

  let rectHeight = 1;
  while (rowIndex + rectHeight <= sectionEndRow) {
    let matches = true;
    for (let currentColumn = columnIndex; currentColumn < columnIndex + rectWidth; currentColumn += 1) {
      if (!isSameAssignment(assignments[rowIndex + rectHeight]?.[currentColumn] ?? null, assignment)) {
        matches = false;
        break;
      }
    }
    if (!matches) break;
    rectHeight += 1;
  }

  return {
    width: rectWidth,
    height: rectHeight,
  };
}

function isSameAssignment(
  left: StructuralSlotAssignment | null,
  right: StructuralSlotAssignment | null,
): boolean {
  if (!left || !right || left.kind !== right.kind) return false;
  return left.cell === right.cell;
}

function createNodeFromAssignment(
  schema: Schema,
  names: HtmlTableNodeNames,
  assignment: StructuralSlotAssignment,
  colspan: number,
  rowspan: number,
): ProseMirrorNode {
  return assignment.kind === 'table'
    ? copyExistingCellWithSpan(assignment.cell.node, colspan, rowspan)
    : createClipboardCellNode(schema, names, assignment.cell, colspan, rowspan);
}

function copyExistingCellWithSpan(
  cell: ProseMirrorNode,
  colspan: number,
  rowspan: number,
): ProseMirrorNode {
  return cell.type.create(
    {
      ...cell.attrs,
      colspan,
      rowspan,
      colwidth: normalizeCellColwidth(cell.attrs.colwidth, colspan),
    },
    cell.content,
    cell.marks,
  );
}

function createClipboardCellNode(
  schema: Schema,
  names: HtmlTableNodeNames,
  cell: ParsedClipboardCell,
  colspan: number,
  rowspan: number,
): ProseMirrorNode {
  const type = cell.isHeader ? schema.nodes[names.headerCell] : schema.nodes[names.cell];
  const attrs: Record<string, unknown> = {
    ...(cell.attrs ?? {}),
    colspan,
    rowspan,
  };
  if ('colwidth' in attrs) {
    attrs.colwidth = normalizeCellColwidth(attrs.colwidth, colspan);
  }

  const content = cell.content ? cloneCellContent(schema, cell.content) : createTextCellContent(schema, cell.text ?? '');
  return (type ?? schema.nodes[names.cell]!).create(attrs, content);
}

function createEmptyTableCell(
  schema: Schema,
  names: HtmlTableNodeNames,
  kind: 'header' | 'body',
): ProseMirrorNode {
  const type = kind === 'header' ? schema.nodes[names.headerCell] : schema.nodes[names.cell];
  return (type ?? schema.nodes[names.cell]!).createAndFill() ?? schema.nodes[names.cell]!.create();
}

function cloneParsedClipboardCell(schema: Schema, cell: ParsedClipboardCell): ParsedClipboardCell {
  const cloned: ParsedClipboardCell = {
    ...cell,
  };
  if (cell.attrs) cloned.attrs = { ...cell.attrs };
  if (cell.content) cloned.content = cloneCellContent(schema, cell.content);
  return cloned;
}

function getClipboardCellColSpan(cell: ParsedClipboardCell): number {
  return Math.max(1, Number(cell.colspan ?? cell.attrs?.colspan ?? 1));
}

function getClipboardCellRowSpan(cell: ParsedClipboardCell): number {
  return Math.max(1, Number(cell.rowspan ?? cell.attrs?.rowspan ?? 1));
}

function setClipboardCellColSpan(schema: Schema, cell: ParsedClipboardCell, colspan: number): ParsedClipboardCell {
  const next = cloneParsedClipboardCell(schema, cell);
  const normalizedColSpan = Math.max(1, colspan);
  next.colspan = normalizedColSpan;
  next.attrs = {
    ...next.attrs,
    colspan: normalizedColSpan,
  };

  if (Array.isArray(next.attrs.colwidth)) {
    next.attrs.colwidth = next.attrs.colwidth.slice(0, normalizedColSpan);
  }

  return next;
}

function setClipboardCellRowSpan(schema: Schema, cell: ParsedClipboardCell, rowspan: number): ParsedClipboardCell {
  const next = cloneParsedClipboardCell(schema, cell);
  const normalizedRowSpan = Math.max(1, rowspan);
  next.rowspan = normalizedRowSpan;
  next.attrs = {
    ...next.attrs,
    rowspan: normalizedRowSpan,
  };
  return next;
}

function findTableNodeInSlice(slice: Slice, names: HtmlTableNodeNames): ProseMirrorNode | null {
  let tableNode: ProseMirrorNode | null = null;

  slice.content.descendants((node) => {
    if (tableNode || (node.type.name !== names.table && node.type.spec.tableRole !== 'table')) return !tableNode;
    tableNode = node;
    return false;
  });

  return tableNode;
}

function getTableRowNodes(table: ProseMirrorNode, names: HtmlTableNodeNames): ProseMirrorNode[] {
  const rows: ProseMirrorNode[] = [];
  table.forEach((child) => {
    if (!getSectionName(child, names)) return;
    child.forEach((row) => rows.push(row));
  });
  return rows;
}

function serializeClipboardRowsToText(rows: ParsedClipboardCell[][]): string {
  return rows
    .map((row) => row.map((cell) => cell.text ?? fragmentText(cell.content)).join('\t'))
    .join('\n');
}

function serializeClipboardRowsToHtml(rows: ParsedClipboardCell[][], payload: string): string {
  const body = rows
    .map((row) => `<tr>${row.map((cell) => serializeClipboardCellToHtml(cell)).join('')}</tr>`)
    .join('');
  return `<table ${CLIPBOARD_PAYLOAD_ATTR}="${escapeHtmlAttribute(payload)}"><tbody>${body}</tbody></table>`;
}

function serializeClipboardCellToHtml(cell: ParsedClipboardCell): string {
  const tag = cell.isHeader ? 'th' : 'td';
  const attrs = renderClipboardCellAttrs(cell);
  const content = cell.content ? serializeFragmentToHtml(cell.content) : escapeHtml(cell.text ?? '');
  return `<${tag}${attrs}>${content || '<p></p>'}</${tag}>`;
}

function renderClipboardCellAttrs(cell: ParsedClipboardCell): string {
  const attrs = createHtmlTableCellAttributes();
  const rendered = renderAttributes({
    ...(cell.attrs ?? {}),
    colspan: cell.colspan ?? cell.attrs?.colspan ?? 1,
    rowspan: cell.rowspan ?? cell.attrs?.rowspan ?? 1,
  }, attrs);
  const entries = Object.entries(rendered).filter(([, value]) => value !== null && value !== undefined && value !== '');
  return entries.length > 0
    ? ` ${entries.map(([name, value]) => `${name}="${escapeHtmlAttribute(String(value))}"`).join(' ')}`
    : '';
}

function serializeTableNodeToHtml(table: ProseMirrorNode, names: HtmlTableNodeNames, payload: string): string {
  const attrs = renderTableAttrs(table, payload);
  const children: string[] = [];
  table.forEach((child) => {
    if (child.type.name === names.caption) {
      children.push(`<caption>${serializeFragmentToHtml(child.content)}</caption>`);
      return;
    }
    if (child.type.name === names.colgroup) {
      children.push(`<colgroup>${serializeColgroupToHtml(child)}</colgroup>`);
      return;
    }
    if (child.type.name === names.head || child.type.name === names.body || child.type.name === names.foot) {
      const sectionTag = child.type.name === names.head ? 'thead' : child.type.name === names.body ? 'tbody' : 'tfoot';
      children.push(`<${sectionTag}>${serializeSectionToHtml(child, names)}</${sectionTag}>`);
    }
  });
  return `<table${attrs}>${children.join('')}</table>`;
}

function renderTableAttrs(table: ProseMirrorNode, payload: string): string {
  const attrs = [`${CLIPBOARD_PAYLOAD_ATTR}="${escapeHtmlAttribute(payload)}"`];
  if (table.attrs.width) attrs.push(`width="${escapeHtmlAttribute(String(table.attrs.width))}"`);
  return attrs.length > 0 ? ` ${attrs.join(' ')}` : '';
}

function serializeColgroupToHtml(colgroup: ProseMirrorNode): string {
  const cols: string[] = [];
  colgroup.forEach((col) => {
    const attrs: string[] = [];
    if (col.attrs.span) attrs.push(`span="${escapeHtmlAttribute(String(col.attrs.span))}"`);
    if (col.attrs.width) attrs.push(`width="${escapeHtmlAttribute(String(col.attrs.width))}"`);
    cols.push(`<col${attrs.length > 0 ? ` ${attrs.join(' ')}` : ''}>`);
  });
  return cols.join('');
}

function serializeSectionToHtml(section: ProseMirrorNode, names: HtmlTableNodeNames): string {
  const rows: string[] = [];
  section.forEach((row) => {
    const cells: string[] = [];
    row.forEach((cell) => {
      cells.push(serializeClipboardCellToHtml(createParsedClipboardCell(section.type.schema, names, cell)));
    });
    rows.push(`<tr>${cells.join('')}</tr>`);
  });
  return rows.join('');
}

function serializeFragmentToHtml(fragment: Fragment): string {
  let html = '';
  fragment.forEach((node) => {
    html += serializeNodeToHtml(node);
  });
  return html;
}

function serializeNodeToHtml(node: ProseMirrorNode): string {
  if (node.isText) {
    let text = escapeHtml(node.text ?? '');
    for (const mark of node.marks) {
      text = wrapMarkedText(mark.type.name, text, mark.attrs as Record<string, unknown>);
    }
    return text;
  }

  if (node.type.name === 'paragraph') {
    return `<p>${serializeFragmentToHtml(node.content)}</p>`;
  }

  if (node.type.name === 'hardBreak') {
    return '<br>';
  }

  const content = serializeFragmentToHtml(node.content);
  return content || '';
}

function wrapMarkedText(name: string, html: string, attrs: Record<string, unknown>): string {
  if (name === 'strong' || name === 'bold') return `<strong>${html}</strong>`;
  if (name === 'em' || name === 'italic') return `<em>${html}</em>`;
  if (name === 'underline') return `<u>${html}</u>`;
  if (name === 'strike') return `<s>${html}</s>`;
  if (name === 'code') return `<code>${html}</code>`;
  if (name === 'link') {
    const href = typeof attrs.href === 'string' ? attrs.href : '';
    return `<a href="${escapeHtmlAttribute(href)}">${html}</a>`;
  }
  return html;
}

function parseHtmlClipboardCell(cell: { tag: string; attrs: string; innerHtml: string }, schema: Schema): ParsedClipboardCell {
  const attributes = parseAttributes(cell.attrs);
  const styles = parseStyles(attributes.style);
  const text = decodeHtmlEntities(stripHtml(cell.innerHtml));
  const width = normalizeNumericAttribute(attributes['data-colwidth'] ?? attributes.width);

  const attrs: Record<string, unknown> = {
    colspan: normalizeNumericAttribute(attributes.colspan) ?? 1,
    rowspan: normalizeNumericAttribute(attributes.rowspan) ?? 1,
    textAlign: normalizeStyleValue(styles['text-align'] ?? attributes.align),
    backgroundColor: normalizeStyleValue(styles['background-color']),
    verticalAlign: normalizeStyleValue(styles['vertical-align']),
  };

  if (Array.isArray(width)) {
    attrs.colwidth = width;
  } else if (typeof width === 'number') {
    attrs.colwidth = [width];
  }

  return {
    attrs,
    content: createTextCellContent(schema, text),
    text,
    colspan: Math.max(1, Number(attrs.colspan ?? 1)),
    rowspan: Math.max(1, Number(attrs.rowspan ?? 1)),
    isHeader: cell.tag === 'th',
  };
}

function extractRowsFromHtml(html: string): Array<Array<{ tag: string; attrs: string; innerHtml: string }>> {
  const rows: Array<Array<{ tag: string; attrs: string; innerHtml: string }>> = [];
  const sectionRows = extractSectionRows(html);
  const rowSources = sectionRows.length > 0 ? sectionRows : extractStandaloneRows(html);

  for (const rowHtml of rowSources) {
    const row: Array<{ tag: string; attrs: string; innerHtml: string }> = [];
    let match: RegExpExecArray | null;
    CELL_TAG_PATTERN.lastIndex = 0;
    while ((match = CELL_TAG_PATTERN.exec(rowHtml))) {
      row.push({ tag: match[1]!.toLowerCase(), attrs: match[2] ?? '', innerHtml: match[3] ?? '' });
    }
    if (row.length > 0) rows.push(row);
  }

  return rows;
}

function extractSectionRows(html: string): string[] {
  const rows: string[] = [];
  let sectionMatch: RegExpExecArray | null;
  SECTION_TAG_PATTERN.lastIndex = 0;
  while ((sectionMatch = SECTION_TAG_PATTERN.exec(html))) {
    rows.push(...extractStandaloneRows(sectionMatch[2] ?? ''));
  }
  return rows;
}

function extractStandaloneRows(html: string): string[] {
  const rows: string[] = [];
  let rowMatch: RegExpExecArray | null;
  ROW_TAG_PATTERN.lastIndex = 0;
  while ((rowMatch = ROW_TAG_PATTERN.exec(html))) {
    rows.push(rowMatch[1] ?? '');
  }
  return rows;
}

function createTextCellContent(schema: Schema, text: string): Fragment {
  const paragraph = schema.nodes.paragraph;
  if (!paragraph) return Fragment.empty;

  const lines = text.split('\n');
  const nodes = lines.length > 0
    ? lines.map((line) => paragraph.create(null, line.length > 0 ? schema.text(line) : undefined))
    : [paragraph.create()];
  return Fragment.fromArray(nodes);
}

function fitSliceToCellContent(
  schema: Schema,
  slice: Slice,
  isHeader: boolean,
  names: HtmlTableNodeNames,
): Fragment {
  const cellType = isHeader ? schema.nodes[names.headerCell] : schema.nodes[names.cell];
  if (!cellType) return slice.content;

  const emptyCell = cellType.createAndFill();
  if (!emptyCell) return slice.content;

  try {
    return new Transform(emptyCell).replace(0, emptyCell.content.size, slice).doc.content;
  } catch {
    return slice.content;
  }
}

function cloneCellContent(schema: Schema, fragment: Fragment): Fragment {
  return Fragment.fromJSON(schema, fragment.toJSON());
}

function fragmentText(fragment: Fragment | undefined): string {
  if (!fragment) return '';
  let text = '';
  fragment.forEach((node) => {
    text += node.textContent;
  });
  return text;
}

function getCellText(cell: ProseMirrorNode): string {
  return cell.textBetween(0, cell.content.size, '\n', ' ');
}

function replaceTable(state: EditorState, context: TableContext, table: ProseMirrorNode) {
  return state.tr.replaceWith(context.tablePos, context.tablePos + context.table.nodeSize, table);
}

function updateCellsMatching(
  context: TableContext,
  grid: HtmlTableGrid,
  predicate: (cell: HtmlTableCellRef) => boolean,
  updater: (cell: HtmlTableCellRef) => ProseMirrorNode,
): ProseMirrorNode {
  const tableChildren = getChildren(context.table);
  forEachSection(context.table, context.names, (section, sectionChildIndex) => {
    const rows = getChildren(section).map((row) => {
      const globalRowIndex = findGlobalRowIndexByNode(grid, row);
      const rowChildren = getChildren(row).map((cellNode, cellIndex) => {
        const cell = grid.cells.find(
          (item) => item.rowIndex === globalRowIndex && item.cellIndex === cellIndex && item.node === cellNode,
        );
        return cell && predicate(cell) ? updater(cell) : cellNode;
      });
      return row.copy(Fragment.fromArray(rowChildren));
    });
    tableChildren[sectionChildIndex] = section.copy(Fragment.fromArray(rows));
  });
  return context.table.copy(Fragment.fromArray(tableChildren));
}

function getCellSelectionInfo(state: EditorState, options: HtmlTableClipboardOptions): CellSelectionInfo | undefined {
  const context = findTableContext(state, options);
  if (!context) return undefined;

  const grid = createHtmlTableGrid(context.table, { names: context.names });
  const cellPositions = collectCellPositions(context, grid);
  const anchorCell = isCellSelection(state.selection)
    ? findCellByPosition(context, grid, state.selection.anchorCellPos)
    : findCurrentCell(grid, state.selection, cellPositions);
  const headCell = isCellSelection(state.selection)
    ? findCellByPosition(context, grid, state.selection.headCellPos) ?? anchorCell
    : anchorCell;

  if (!anchorCell || !headCell) return undefined;

  const top = Math.min(anchorCell.rowIndex, headCell.rowIndex);
  const bottom = Math.max(anchorCell.rowIndex + anchorCell.rowSpan - 1, headCell.rowIndex + headCell.rowSpan - 1);
  const left = Math.min(anchorCell.columnIndex, headCell.columnIndex);
  const right = Math.max(anchorCell.columnIndex + anchorCell.colSpan - 1, headCell.columnIndex + headCell.colSpan - 1);
  const cells = uniqueCellsInRect(grid, top, bottom, left, right);

  return {
    ...context,
    cell: anchorCell,
    grid,
    anchorCell,
    headCell,
    cells,
    top,
    bottom,
    left,
    right,
    cellPositions,
  };
}

function findTableContext(state: EditorState, options: HtmlTableClipboardOptions): TableContext | undefined {
  const names = resolveHtmlTableNodeNames(options.names);
  if (typeof options.tablePos === 'number') {
    const table = state.doc.nodeAt(options.tablePos);
    if (!table || (table.type.name !== names.table && table.type.spec.tableRole !== 'table')) return undefined;
    return { table, tablePos: options.tablePos, names: inferHtmlTableNodeNames(table, names) };
  }

  const $from = getSelectionStart(state.selection);
  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === names.table || node.type.spec.tableRole === 'table') {
      return { table: node, tablePos: depth === 0 ? 0 : $from.before(depth), names: inferHtmlTableNodeNames(node, names) };
    }
  }

  return undefined;
}

function findCellContext(state: EditorState, options: HtmlTableClipboardOptions): CellContext | undefined {
  const context = findTableContext(state, options);
  if (!context) return undefined;
  const grid = createHtmlTableGrid(context.table, { names: context.names });
  const positions = collectCellPositions(context, grid);
  const cell = findCurrentCell(grid, state.selection, positions);
  return cell ? { ...context, cell } : undefined;
}

function getSelectionStart(selection: Selection) {
  return isCellSelection(selection) ? selection.$head : selection.$from;
}

function collectCellPositions(context: TableContext, grid: HtmlTableGrid): Map<HtmlTableCellRef, number> {
  const positions = new Map<HtmlTableCellRef, number>();
  for (const cell of grid.cells) {
    const pos = findCellPosition(context, cell);
    if (typeof pos === 'number') positions.set(cell, pos);
  }
  return positions;
}

function findCurrentCell(
  grid: HtmlTableGrid,
  selection: Selection,
  cellPositions: Map<HtmlTableCellRef, number>,
): HtmlTableCellRef | undefined {
  const ancestorCell = findAncestorCell(grid, selection, cellPositions);
  if (ancestorCell) return ancestorCell;

  const selectedNode = selection.$from.parent;
  return (
    grid.cells.find((cell) => cell.node === selectedNode)
    ?? grid.cells.find((cell) => {
      const pos = cellPositions.get(cell);
      return typeof pos === 'number' && pos === selection.from;
    })
    ?? grid.cells[0]
  );
}

function findAncestorCell(
  grid: HtmlTableGrid,
  selection: Selection,
  cellPositions: Map<HtmlTableCellRef, number>,
): HtmlTableCellRef | undefined {
  for (let depth = selection.$from.depth; depth > 0; depth -= 1) {
    const node = selection.$from.node(depth);
    if (!isCellNode(node, inferHtmlTableNodeNames(node))) continue;

    const cellPos = selection.$from.before(depth);
    return (
      grid.cells.find((cell) => cell.node === node && cellPositions.get(cell) === cellPos)
      ?? grid.cells.find((cell) => {
        const pos = cellPositions.get(cell);
        return typeof pos === 'number' && pos === cellPos;
      })
      ?? grid.cells.find((cell) => cell.node === node)
    );
  }

  return undefined;
}

function findCellByPosition(
  context: TableContext,
  grid: HtmlTableGrid,
  pos: number,
): HtmlTableCellRef | undefined {
  return grid.cells.find((cell) => findCellPosition(context, cell) === pos);
}

function findCellPosition(context: TableContext, cell: HtmlTableCellRef): number | undefined {
  let result: number | undefined;
  const sectionCounters: Record<HtmlTableSectionName, number> = { head: 0, body: 0, foot: 0 };
  context.table.forEach((section, sectionOffset) => {
    if (result !== undefined) return;
    const sectionName = getSectionName(section, context.names);
    if (!sectionName) return;

    const sectionIndex = sectionCounters[sectionName];
    sectionCounters[sectionName] += 1;
    if (sectionName !== cell.section || sectionIndex !== cell.sectionIndex) return;

    section.forEach((row, rowOffset, rowIndexInSection) => {
      if (result !== undefined || rowIndexInSection !== cell.rowIndexInSection) return;
      row.forEach((cellNode, cellOffset, cellIndex) => {
        if (result !== undefined) return;
        if (cellIndex === cell.cellIndex && cellNode === cell.node) {
          result = context.tablePos + 1 + sectionOffset + 1 + rowOffset + 1 + cellOffset;
        }
      });
    });
  });
  return result;
}

function uniqueCellsInRect(
  grid: HtmlTableGrid,
  top: number,
  bottom: number,
  left: number,
  right: number,
): HtmlTableCellRef[] {
  const cells: HtmlTableCellRef[] = [];
  const seen = new Set<HtmlTableCellRef>();
  for (let rowIndex = top; rowIndex <= bottom; rowIndex += 1) {
    for (let columnIndex = left; columnIndex <= right; columnIndex += 1) {
      const cell = grid.slots[rowIndex]?.[columnIndex]?.cell;
      if (!cell || seen.has(cell)) continue;
      seen.add(cell);
      cells.push(cell);
    }
  }
  return cells;
}

function forEachSection(
  table: ProseMirrorNode,
  names: HtmlTableNodeNames,
  callback: (section: ProseMirrorNode, sectionChildIndex: number) => void,
): void {
  table.forEach((child, _offset, index) => {
    if (getSectionName(child, names)) callback(child, index);
  });
}

function getChildren(node: ProseMirrorNode): ProseMirrorNode[] {
  const children: ProseMirrorNode[] = [];
  node.forEach((child) => children.push(child));
  return children;
}

function getSectionName(node: ProseMirrorNode, names: HtmlTableNodeNames): HtmlTableSectionName | undefined {
  if (node.type.spec.tableRole === 'head' || node.type.name === names.head) return 'head';
  if (node.type.spec.tableRole === 'body' || node.type.name === names.body) return 'body';
  if (node.type.spec.tableRole === 'foot' || node.type.name === names.foot) return 'foot';
  return undefined;
}

function isCellNode(node: ProseMirrorNode, names: HtmlTableNodeNames): boolean {
  const role = node.type.spec.tableRole;
  return role === 'cell'
    || role === 'header_cell'
    || node.type.name === names.cell
    || node.type.name === names.headerCell;
}

function findGlobalRowIndexByNode(grid: HtmlTableGrid, row: ProseMirrorNode): number {
  return grid.rows.find((item) => item.node === row)?.rowIndex ?? -1;
}

function createEmptyCellContent(schema: Schema): Fragment {
  const paragraph = schema.nodes.paragraph?.createAndFill();
  return paragraph ? Fragment.from(paragraph) : Fragment.empty;
}

function renderAttributes(
  values: Record<string, unknown>,
  attributes: ReturnType<typeof createHtmlTableCellAttributes>,
): Record<string, string> {
  const rendered: Record<string, string> = {};
  for (const attribute of Object.values(attributes)) {
    const partial = attribute.renderHTML?.(values);
    if (!partial) continue;
    for (const [name, value] of Object.entries(partial)) {
      if (typeof value !== 'string' || value.length === 0) continue;
      rendered[name] = name === 'style' && rendered.style ? `${rendered.style} ${value}`.trim() : value;
    }
  }
  return rendered;
}

function parseAttributes(input: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  let match: RegExpExecArray | null;
  ATTR_PATTERN.lastIndex = 0;
  while ((match = ATTR_PATTERN.exec(input))) {
    attrs[match[1]!.toLowerCase()] = match[3] ?? match[4] ?? match[5] ?? '';
  }
  return attrs;
}

function parseStyles(style: string | undefined): Record<string, string> {
  const styles: Record<string, string> = {};
  if (!style) return styles;

  let match: RegExpExecArray | null;
  STYLE_ENTRY_PATTERN.lastIndex = 0;
  while ((match = STYLE_ENTRY_PATTERN.exec(style))) {
    styles[match[1]!.toLowerCase()] = match[2]!.trim();
  }
  return styles;
}

function normalizeStyleValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeNumericAttribute(value: unknown): number | number[] | null {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim();
  if (!text) return null;
  if (text.includes(',')) {
    const values = text
      .split(',')
      .map((entry) => Number(entry.trim()))
      .filter((entry) => Number.isFinite(entry) && entry > 0);
    return values.length > 0 ? values : null;
  }
  const numeric = Number(text.replace(/px$/i, ''));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function normalizeCellColwidth(value: unknown, colspan: number): number[] | null {
  if (!Array.isArray(value)) return null;

  const widths = value
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry) && entry > 0)
    .slice(0, Math.max(1, colspan));

  return widths.length > 0 ? widths : null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '');
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, '&');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtml(value);
}

function encodeBase64UrlUtf8(value: string): string {
  if (typeof btoa === 'function' && typeof TextEncoder !== 'undefined') {
    const bytes = new TextEncoder().encode(value);
    return toBase64Url(btoa(bytesToBinaryString(bytes)));
  }

  if (typeof globalThis.Buffer !== 'undefined') {
    return globalThis.Buffer.from(value, 'utf8').toString('base64url');
  }

  throw new Error('No base64 encoder available for clipboard payload serialization.');
}

function decodeBase64UrlUtf8(value: string): string {
  if (typeof atob === 'function' && typeof TextDecoder !== 'undefined') {
    const binary = atob(fromBase64Url(value));
    return new TextDecoder().decode(binaryStringToBytes(binary));
  }

  if (typeof globalThis.Buffer !== 'undefined') {
    return globalThis.Buffer.from(value, 'base64url').toString('utf8');
  }

  throw new Error('No base64 decoder available for clipboard payload parsing.');
}

function toBase64Url(base64: string): string {
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}

function fromBase64Url(base64Url: string): string {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const padding = base64.length % 4;
  return padding === 0 ? base64 : `${base64}${'='.repeat(4 - padding)}`;
}

function bytesToBinaryString(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return binary;
}

function binaryStringToBytes(binary: string): Uint8Array {
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
