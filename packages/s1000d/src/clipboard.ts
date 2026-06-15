import { Fragment, type Node as ProseMirrorNode, type Schema } from 'prosemirror-model';
import { NodeSelection, TextSelection, type EditorState, type Selection, type Transaction } from 'prosemirror-state';

import { createS1000DTableAdapter } from './adapter.js';
import {
  findS1000DAncestorNode,
  resolveRequiredS1000DTableContext,
  type S1000DActiveTableContext,
  type S1000DTableLookupOptions,
} from './context.js';
import {
  refreshActiveS1000DTableContext,
  replaceS1000DEntries,
} from './mutation.js';
import { createEmptyS1000DEntryContent } from './normalize.js';
import { s1000dTableNodeNames } from './names.js';
import {
  findS1000DEntryByPosition,
  findS1000DEntryByNodePosition,
  findS1000DEntryPosition,
} from './position.js';
import { S1000DCellSelection, isS1000DCellSelection } from './selection.js';
import type { S1000DEntryRef, S1000DTgroupGrid } from './grid.js';

const CLIPBOARD_PAYLOAD_ATTR = 'data-s1000d-clipboard';
const LOCATION_ATTRS = new Set(['colname', 'namest', 'nameend', 'spanname', 'morerows', 'id']);

type S1000DTableContext = S1000DActiveTableContext;

interface S1000DCellContext extends S1000DTableContext {
  grid: S1000DTgroupGrid;
  entry: S1000DEntryRef;
}

interface S1000DSelectionInfo extends S1000DCellContext {
  anchorEntry: S1000DEntryRef;
  headEntry: S1000DEntryRef;
  entries: S1000DEntryRef[];
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface SerializedClipboardCell {
  attrs: Record<string, unknown>;
  content: unknown;
  text: string;
  rowspan: number;
  colspan: number;
}

interface SerializedClipboardPayload {
  kind: 'cells' | 'table';
  rows: SerializedClipboardCell[][];
  table?: unknown;
}

export interface ParsedS1000DClipboardCell {
  attrs: Record<string, unknown>;
  content: Fragment;
  text: string;
  rowSpan: number;
  colSpan: number;
}

export interface ParsedS1000DTableClipboard {
  rows: ParsedS1000DClipboardCell[][];
  table?: ProseMirrorNode;
}

export type S1000DTableClipboardOptions = S1000DTableLookupOptions;

export function serializeS1000DCellSelectionToHtml(
  state: EditorState,
  options: S1000DTableClipboardOptions = {},
): string | null {
  const wholeTable = getWholeTableClipboardContext(state, options);
  if (wholeTable) {
    const rows = getClipboardRowsFromGrid(wholeTable.grid);
    const payload = encodeClipboardPayload({
      kind: 'table',
      rows: serializeClipboardRows(rows),
      table: wholeTable.table.toJSON(),
    });
    return serializeClipboardRowsToHtml(rows, payload);
  }

  const selectionInfo = getSelectionInfo(state, options);
  if (!selectionInfo) return null;

  const rows = getClipboardRowsFromSelection(selectionInfo);
  const payload = encodeClipboardPayload({
    kind: 'cells',
    rows: serializeClipboardRows(rows),
  });
  return serializeClipboardRowsToHtml(rows, payload);
}

export function serializeS1000DCellSelectionToText(
  state: EditorState,
  options: S1000DTableClipboardOptions = {},
): string | null {
  const wholeTable = getWholeTableClipboardContext(state, options);
  if (wholeTable) {
    return serializeClipboardRowsToText(getClipboardRowsFromGrid(wholeTable.grid));
  }

  const selectionInfo = getSelectionInfo(state, options);
  if (!selectionInfo) return null;
  return serializeClipboardRowsToText(getClipboardRowsFromSelection(selectionInfo));
}

export function parseS1000DHtmlClipboard(
  html: string,
  schema: Schema,
): ParsedS1000DTableClipboard | null {
  if (!/<table\b/i.test(html)) return null;

  const payload = decodeClipboardPayload(extractClipboardPayload(html), schema);
  if (payload) return payload;

  const rows = extractRowsFromHtml(html).map((row) =>
    row.map<ParsedS1000DClipboardCell>((cell) => ({
      attrs: {},
      content: createTextCellContent(schema, decodeHtml(stripHtml(cell.innerHtml))),
      text: decodeHtml(stripHtml(cell.innerHtml)),
      rowSpan: Math.max(1, Number.parseInt(cell.rowspan || '1', 10) || 1),
      colSpan: Math.max(1, Number.parseInt(cell.colspan || '1', 10) || 1),
    })));
  return rows.length > 0 ? { rows } : null;
}

export function parseS1000DPlainTextClipboard(
  text: string,
  schema: Schema,
): ParsedS1000DTableClipboard | null {
  const normalized = text.replace(/\r\n?/g, '\n').trimEnd();
  if (!normalized.trim()) return null;

  const rows = normalized.split('\n').map((line) =>
    line.split('\t').map<ParsedS1000DClipboardCell>((value) => ({
      attrs: {},
      content: createTextCellContent(schema, value),
      text: value,
      rowSpan: 1,
      colSpan: 1,
    })));

  return rows.length > 0 ? { rows } : null;
}

export function applyS1000DClipboardToSelection(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
  clipboard: ParsedS1000DTableClipboard,
  options: S1000DTableClipboardOptions = {},
): boolean {
  const tableContext = findTableContext(state, options);
  if (!tableContext) return false;

  if (
    clipboard.table
    && state.selection instanceof NodeSelection
    && state.selection.node.type.name === s1000dTableNodeNames.table
  ) {
    if (!dispatch) return true;
    dispatch(state.tr.replaceSelectionWith(clipboard.table).scrollIntoView());
    return true;
  }

  const selectionInfo = isS1000DCellSelection(state.selection)
    ? getSelectionInfo(state, options)
    : undefined;
  const cellContext = selectionInfo ?? findCellContext(state, options);
  if (!cellContext || clipboard.rows.length === 0) return false;
  if (!isSimpleClipboard(clipboard) || !isSimpleTarget(cellContext.grid, selectionInfo)) {
    return false;
  }

  const startRow = selectionInfo?.top ?? cellContext.entry.rowIndex ?? 0;
  const startColumn = selectionInfo?.left ?? cellContext.entry.columnIndex ?? 0;
  const maxHeight = selectionInfo ? (selectionInfo.bottom - selectionInfo.top + 1) : (cellContext.grid.height - startRow);
  const maxWidth = selectionInfo ? (selectionInfo.right - selectionInfo.left + 1) : (cellContext.grid.width - startColumn);
  const rows = normalizeClipboardRowsForTarget(clipboard.rows, maxWidth, maxHeight);
  const replacements = new Map<S1000DEntryRef, ProseMirrorNode>();

  for (let rowOffset = 0; rowOffset < rows.length; rowOffset += 1) {
    const sourceRow = rows[rowOffset] ?? [];
    for (let columnOffset = 0; columnOffset < sourceRow.length; columnOffset += 1) {
      const targetEntry = cellContext.grid.slots[startRow + rowOffset]?.[startColumn + columnOffset]?.entry;
      const sourceCell = sourceRow[columnOffset];
      if (!targetEntry || !sourceCell) continue;

      replacements.set(targetEntry, rewriteEntryFromClipboardCell(targetEntry.node, sourceCell));
    }
  }

  if (replacements.size === 0) return false;
  const nextTable = replaceS1000DEntries(tableContext, replacements);
  if (!dispatch) return true;

  const tr = state.tr.replaceWith(
    tableContext.tablePos,
    tableContext.tablePos + tableContext.table.nodeSize,
    nextTable,
  );
  const nextContext = refreshActiveS1000DTableContext(tr.doc, tableContext);
  const nextGrid = createS1000DTableAdapter().createGrid(nextContext.activeTgroup, nextContext.activeTgroupIndex);
  const lastRow = Math.min(nextGrid.height - 1, startRow + Math.max(rows.length, 1) - 1);
  const lastColumn = Math.min(nextGrid.width - 1, startColumn + Math.max(rows[0]?.length ?? 1, 1) - 1);
  const anchorEntry = nextGrid.slots[startRow]?.[startColumn]?.entry;
  const headEntry = nextGrid.slots[lastRow]?.[lastColumn]?.entry ?? anchorEntry;

  if (anchorEntry) {
    const anchorPos = findS1000DEntryPosition(nextContext, anchorEntry);
    const headPos = headEntry ? findS1000DEntryPosition(nextContext, headEntry) : anchorPos;
    if (typeof anchorPos === 'number' && typeof headPos === 'number') {
      tr.setSelection(
        rows.length > 1 || (rows[0]?.length ?? 0) > 1
          ? S1000DCellSelection.create(tr.doc, anchorPos, headPos)
          : TextSelection.near(tr.doc.resolve(anchorPos + 1)),
      );
    }
  }

  dispatch(tr.scrollIntoView());
  return true;
}

export function clearS1000DSelectedCells(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
  options: S1000DTableClipboardOptions = {},
): boolean {
  const selectionInfo = getSelectionInfo(state, options);
  const cellContext = selectionInfo ?? findCellContext(state, options);
  if (!cellContext) return false;
  if (!isSimpleTarget(cellContext.grid, selectionInfo)) return false;

  const targets = new Set(selectionInfo?.entries ?? [cellContext.entry]);
  const replacements = new Map<S1000DEntryRef, ProseMirrorNode>();
  for (const entry of targets) {
    replacements.set(entry, entry.node.type.create(entry.node.attrs, createEmptyS1000DEntryContent(state.schema)));
  }

  if (replacements.size === 0) return false;
  const nextTable = replaceS1000DEntries(cellContext, replacements);
  if (!dispatch) return true;

  const tr = state.tr.replaceWith(cellContext.tablePos, cellContext.tablePos + cellContext.table.nodeSize, nextTable);
  const nextContext = refreshActiveS1000DTableContext(tr.doc, cellContext);
  const nextGrid = createS1000DTableAdapter().createGrid(nextContext.activeTgroup, nextContext.activeTgroupIndex);
  const startRow = selectionInfo?.top ?? cellContext.entry.rowIndex ?? 0;
  const endRow = selectionInfo?.bottom ?? startRow;
  const startColumn = selectionInfo?.left ?? cellContext.entry.columnIndex ?? 0;
  const endColumn = selectionInfo?.right ?? startColumn;
  const anchorEntry = nextGrid.slots[startRow]?.[startColumn]?.entry;
  const headEntry = nextGrid.slots[endRow]?.[endColumn]?.entry ?? anchorEntry;

  if (anchorEntry) {
    const anchorPos = findS1000DEntryPosition(nextContext, anchorEntry);
    const headPos = headEntry ? findS1000DEntryPosition(nextContext, headEntry) : anchorPos;
    if (typeof anchorPos === 'number' && typeof headPos === 'number') {
      tr.setSelection(
        selectionInfo
          ? S1000DCellSelection.create(tr.doc, anchorPos, headPos)
          : TextSelection.near(tr.doc.resolve(anchorPos + 1)),
      );
    }
  }

  dispatch(tr.scrollIntoView());
  return true;
}

export function isWholeS1000DTableSelection(
  state: EditorState,
  options: S1000DTableClipboardOptions = {},
): boolean {
  if (state.selection instanceof NodeSelection && state.selection.node.type.name === s1000dTableNodeNames.table) {
    return true;
  }

  const selectionInfo = getSelectionInfo(state, options);
  if (!selectionInfo || selectionInfo.entries.length === 0) return false;
  return selectionInfo.top === 0
    && selectionInfo.left === 0
    && selectionInfo.bottom === selectionInfo.grid.height - 1
    && selectionInfo.right === selectionInfo.grid.width - 1
    && selectionInfo.entries.length === selectionInfo.grid.entries.length;
}

export function getS1000DSelectionInfo(
  state: EditorState,
  options: S1000DTableClipboardOptions = {},
): {
  table: ProseMirrorNode;
  tablePos: number;
  activeTgroup: ProseMirrorNode;
  activeTgroupIndex: number;
  grid: S1000DTgroupGrid;
  anchorEntry: S1000DEntryRef;
  headEntry: S1000DEntryRef;
  entries: S1000DEntryRef[];
  top: number;
  bottom: number;
  left: number;
  right: number;
} | undefined {
  return getSelectionInfo(state, options);
}

function getWholeTableClipboardContext(
  state: EditorState,
  options: S1000DTableClipboardOptions,
): (S1000DTableContext & { grid: S1000DTgroupGrid }) | undefined {
  const context = findTableContext(state, options);
  if (!context) return undefined;
  if (!isWholeS1000DTableSelection(state, options)) return undefined;
  return {
    ...context,
    grid: createS1000DTableAdapter().createGrid(context.activeTgroup, context.activeTgroupIndex),
  };
}

function getSelectionInfo(
  state: EditorState,
  options: S1000DTableClipboardOptions,
): S1000DSelectionInfo | undefined {
  const context = findTableContext(state, options);
  if (!context) return undefined;

  const grid = createS1000DTableAdapter().createGrid(context.activeTgroup, context.activeTgroupIndex);
  if (grid.entries.length === 0) return undefined;

  const anchorEntry = isS1000DCellSelection(state.selection)
    ? findS1000DEntryByPosition(context, grid, state.selection.anchorEntryPos)
    : findCurrentEntry(grid, state.selection);
  const headEntry = isS1000DCellSelection(state.selection)
    ? findS1000DEntryByPosition(context, grid, state.selection.headEntryPos) ?? anchorEntry
    : anchorEntry;

  if (!anchorEntry || !headEntry) return undefined;

  const top = Math.min(anchorEntry.rowIndex, headEntry.rowIndex);
  const bottom = Math.max(anchorEntry.rowIndex, headEntry.rowIndex);
  const left = Math.min(anchorEntry.columnIndex, headEntry.columnIndex);
  const right = Math.max(anchorEntry.columnIndex, headEntry.columnIndex);
  const entries = uniqueEntriesInRect(grid, top, bottom, left, right);

  return {
    ...context,
    grid,
    entry: anchorEntry,
    anchorEntry,
    headEntry,
    entries,
    top,
    bottom,
    left,
    right,
  };
}

function findTableContext(
  state: EditorState,
  options: S1000DTableClipboardOptions,
): S1000DTableContext | undefined {
  return resolveRequiredS1000DTableContext(state, options) ?? undefined;
}

function findCellContext(
  state: EditorState,
  options: S1000DTableClipboardOptions,
): S1000DCellContext | undefined {
  const context = findTableContext(state, options);
  if (!context) return undefined;
  const grid = createS1000DTableAdapter().createGrid(context.activeTgroup, context.activeTgroupIndex);
  const entry = findCurrentEntry(grid, state.selection);
  return entry ? { ...context, grid, entry } : undefined;
}

function findCurrentEntry(grid: S1000DTgroupGrid, selection: Selection): S1000DEntryRef | undefined {
  const ancestorEntry = findS1000DAncestorNode(selection, s1000dTableNodeNames.entry);
  if (ancestorEntry) {
    return grid.entries.find((entry) => entry.node === ancestorEntry);
  }

  const selectedPositionEntry = findS1000DEntryByNodePosition(selection.$from.doc, grid, selection.from);
  if (selectedPositionEntry) {
    return selectedPositionEntry;
  }

  const ancestorRow = findS1000DAncestorNode(selection, s1000dTableNodeNames.row);
  if (ancestorRow) {
    return grid.entries.find((entry) => grid.rows[entry.rowIndex]?.node === ancestorRow);
  }

  return grid.entries[0];
}

function getClipboardRowsFromSelection(selectionInfo: S1000DSelectionInfo): ParsedS1000DClipboardCell[][] {
  const rows: ParsedS1000DClipboardCell[][] = [];
  for (let rowIndex = selectionInfo.top; rowIndex <= selectionInfo.bottom; rowIndex += 1) {
    const row: ParsedS1000DClipboardCell[] = [];
    const seen = new Set<S1000DEntryRef>();
    for (let columnIndex = selectionInfo.left; columnIndex <= selectionInfo.right; columnIndex += 1) {
      const entry = selectionInfo.grid.slots[rowIndex]?.[columnIndex]?.entry;
      if (!entry || seen.has(entry)) continue;
      seen.add(entry);
      row.push(createClipboardCell(entry));
    }
    rows.push(row);
  }
  return rows;
}

function getClipboardRowsFromGrid(grid: S1000DTgroupGrid): ParsedS1000DClipboardCell[][] {
  const rows: ParsedS1000DClipboardCell[][] = [];
  for (let rowIndex = 0; rowIndex < grid.height; rowIndex += 1) {
    const row: ParsedS1000DClipboardCell[] = [];
    const seen = new Set<S1000DEntryRef>();
    for (let columnIndex = 0; columnIndex < grid.width; columnIndex += 1) {
      const entry = grid.slots[rowIndex]?.[columnIndex]?.entry;
      if (!entry || seen.has(entry)) continue;
      seen.add(entry);
      row.push(createClipboardCell(entry));
    }
    rows.push(row);
  }
  return rows;
}

function createClipboardCell(entry: S1000DEntryRef): ParsedS1000DClipboardCell {
  return {
    attrs: { ...entry.node.attrs },
    content: Fragment.fromJSON(entry.node.type.schema, entry.node.content.toJSON()),
    text: entry.node.textBetween(0, entry.node.content.size, '\n', ' '),
    rowSpan: entry.rowSpan,
    colSpan: entry.colSpan,
  };
}

function rewriteEntryFromClipboardCell(
  targetEntry: ProseMirrorNode,
  cell: ParsedS1000DClipboardCell,
): ProseMirrorNode {
  const copiedAttrs = Object.fromEntries(
    Object.entries(cell.attrs).filter(([key]) => !LOCATION_ATTRS.has(key)),
  );
  return targetEntry.type.create(
    {
      ...targetEntry.attrs,
      ...copiedAttrs,
    },
    cell.content,
    targetEntry.marks,
  );
}

function uniqueEntriesInRect(
  grid: S1000DTgroupGrid,
  top: number,
  bottom: number,
  left: number,
  right: number,
): S1000DEntryRef[] {
  const entries: S1000DEntryRef[] = [];
  const seen = new Set<S1000DEntryRef>();
  for (let rowIndex = top; rowIndex <= bottom; rowIndex += 1) {
    for (let columnIndex = left; columnIndex <= right; columnIndex += 1) {
      const entry = grid.slots[rowIndex]?.[columnIndex]?.entry;
      if (!entry || seen.has(entry)) continue;
      seen.add(entry);
      entries.push(entry);
    }
  }
  return entries;
}

function serializeClipboardRows(rows: ParsedS1000DClipboardCell[][]): SerializedClipboardCell[][] {
  return rows.map((row) =>
    row.map((cell) => ({
      attrs: cell.attrs,
      content: cell.content.toJSON(),
      text: cell.text,
      rowspan: cell.rowSpan,
      colspan: cell.colSpan,
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

function decodeClipboardPayload(
  payload: string | null,
  schema: Schema,
): ParsedS1000DTableClipboard | null {
  if (!payload) return null;

  try {
    const decoded = JSON.parse(decodeBase64UrlUtf8(payload)) as SerializedClipboardPayload;
    const rows = decoded.rows.map((row) =>
      row.map<ParsedS1000DClipboardCell>((cell) => ({
        attrs: cell.attrs ?? {},
        content: Fragment.fromJSON(schema, cell.content),
        text: cell.text ?? '',
        rowSpan: Math.max(1, Number(cell.rowspan ?? 1)),
        colSpan: Math.max(1, Number(cell.colspan ?? 1)),
      })));
    const result: ParsedS1000DTableClipboard = { rows };
    if (decoded.kind === 'table' && decoded.table) {
      result.table = schema.nodeFromJSON(decoded.table);
    }
    return result;
  } catch {
    return null;
  }
}

function serializeClipboardRowsToHtml(
  rows: ParsedS1000DClipboardCell[][],
  payload: string,
): string {
  const body = rows.map((row) => (
    `<tr>${row.map((cell) => serializeClipboardCellToHtml(cell)).join('')}</tr>`
  )).join('');
  return `<table ${CLIPBOARD_PAYLOAD_ATTR}="${payload}"><tbody>${body}</tbody></table>`;
}

function serializeClipboardCellToHtml(cell: ParsedS1000DClipboardCell): string {
  const spanAttrs = `${cell.colSpan > 1 ? ` colspan="${cell.colSpan}"` : ''}${cell.rowSpan > 1 ? ` rowspan="${cell.rowSpan}"` : ''}`;
  const content = cell.text
    .split('\n')
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('');
  return `<td${spanAttrs}>${content || '<p></p>'}</td>`;
}

function serializeClipboardRowsToText(rows: ParsedS1000DClipboardCell[][]): string {
  return rows.map((row) => row.map((cell) => cell.text).join('\t')).join('\n');
}

function extractRowsFromHtml(html: string): Array<Array<{ innerHtml: string; colspan: string | null; rowspan: string | null }>> {
  const rows: Array<Array<{ innerHtml: string; colspan: string | null; rowspan: string | null }>> = [];
  const rowPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellPattern = /<td\b([^>]*)>([\s\S]*?)<\/td>|<th\b([^>]*)>([\s\S]*?)<\/th>/gi;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowPattern.exec(html))) {
    const cells: Array<{ innerHtml: string; colspan: string | null; rowspan: string | null }> = [];
    let cellMatch: RegExpExecArray | null;
    cellPattern.lastIndex = 0;
    while ((cellMatch = cellPattern.exec(rowMatch[1] ?? ''))) {
      const attrs = `${cellMatch[1] ?? ''} ${cellMatch[3] ?? ''}`;
      cells.push({
        innerHtml: cellMatch[2] ?? cellMatch[4] ?? '',
        colspan: /colspan="([^"]+)"/i.exec(attrs)?.[1] ?? null,
        rowspan: /rowspan="([^"]+)"/i.exec(attrs)?.[1] ?? null,
      });
    }
    if (cells.length > 0) {
      rows.push(cells);
    }
  }

  return rows;
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '');
}

function decodeHtml(value: string): string {
  return value
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

function createTextCellContent(schema: Schema, text: string): Fragment {
  const entryBlockType = schema.nodes[s1000dTableNodeNames.entryBlock];
  if (entryBlockType) {
    const lines = text.split('\n');
    const blocks = lines.map((line) => entryBlockType.create({ xmlName: 'para' }, line ? schema.text(line) : undefined));
    return Fragment.fromArray(blocks);
  }

  const paragraph = schema.nodes.paragraph;
  if (!paragraph) return Fragment.empty;
  return Fragment.fromArray([paragraph.create(null, text ? schema.text(text) : undefined)]);
}

function isSimpleClipboard(clipboard: ParsedS1000DTableClipboard): boolean {
  return clipboard.rows.every((row) => row.every((cell) => cell.rowSpan === 1 && cell.colSpan === 1));
}

function isSimpleTarget(
  grid: S1000DTgroupGrid,
  selectionInfo: S1000DSelectionInfo | undefined,
): boolean {
  const entries = selectionInfo?.entries ?? grid.entries;
  return entries.every((entry) => entry.rowSpan === 1 && entry.colSpan === 1);
}

function clipClipboardRows(
  rows: ParsedS1000DClipboardCell[][],
  maxWidth: number,
  maxHeight: number,
): ParsedS1000DClipboardCell[][] {
  return rows
    .slice(0, Math.max(1, maxHeight))
    .map((row) => row.slice(0, Math.max(1, maxWidth)));
}

function normalizeClipboardRowsForTarget(
  rows: ParsedS1000DClipboardCell[][],
  maxWidth: number,
  maxHeight: number,
): ParsedS1000DClipboardCell[][] {
  const clipped = clipClipboardRows(rows, maxWidth, maxHeight);
  if (clipped.length === 0) {
    return clipped;
  }

  if (clipped.length === 1 && clipped[0]?.length === 1) {
    const cell = clipped[0]?.[0];
    if (!cell) {
      return clipped;
    }
    return Array.from({ length: Math.max(1, maxHeight) }, () =>
      Array.from({ length: Math.max(1, maxWidth) }, () => cloneClipboardCell(cell)),
    );
  }

  return clipped;
}

function cloneClipboardCell(cell: ParsedS1000DClipboardCell): ParsedS1000DClipboardCell {
  return {
    attrs: { ...cell.attrs },
    content: cell.content,
    text: cell.text,
    rowSpan: cell.rowSpan,
    colSpan: cell.colSpan,
  };
}

function encodeBase64UrlUtf8(value: string): string {
  const encoded = new TextEncoder().encode(value);
  return toBase64Url(encodeBase64Binary(encoded));
}

function decodeBase64UrlUtf8(value: string): string {
  const decoded = decodeBase64Binary(fromBase64Url(value));
  return new TextDecoder().decode(decoded);
}

function encodeBase64Binary(value: Uint8Array): string {
  const binary = Array.from(value, (item) => String.fromCharCode(item)).join('');
  if (typeof globalThis.btoa === 'function') {
    return globalThis.btoa(binary);
  }
  if (typeof globalThis.Buffer !== 'undefined') {
    return globalThis.Buffer.from(value).toString('base64');
  }
  throw new Error('No base64 encoder available for clipboard payload serialization.');
}

function decodeBase64Binary(value: string): Uint8Array {
  if (typeof globalThis.atob === 'function') {
    const binary = globalThis.atob(value);
    return Uint8Array.from(binary, (item) => item.charCodeAt(0));
  }
  if (typeof globalThis.Buffer !== 'undefined') {
    return Uint8Array.from(globalThis.Buffer.from(value, 'base64'));
  }
  throw new Error('No base64 decoder available for clipboard payload parsing.');
}

function toBase64Url(value: string): string {
  return value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4;
  return padding === 0 ? normalized : `${normalized}${'='.repeat(4 - padding)}`;
}
