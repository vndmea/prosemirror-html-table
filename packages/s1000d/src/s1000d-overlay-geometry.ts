import { NodeSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

import { createS1000DTableAdapter } from './adapter.js';
import { getS1000DSelectionInfo } from './clipboard.js';
import { findS1000DTableAtDOM, type S1000DTableDOMContext } from './dom-adapter.js';
import type { S1000DEntryRef, S1000DTgroupGrid } from './grid.js';
import { s1000dTableNodeNames } from './names.js';
import { findS1000DEntryPosition } from './position.js';
import { isS1000DCellSelection } from './selection.js';
import {
  getTableContextMenuPosition,
  getVisibleTableRect,
  getVisibleTableSelectionRect,
  toTableRect,
  type TableGeometry,
  type TableOverlayPositionState,
  type TableRect,
} from 'tiptap-html-table/table-interaction';

export const ROW_HANDLE_OFFSET = 10;
export const COLUMN_HANDLE_OFFSET = 10;
export const MIN_HANDLE_INSET = 8;
export const HANDLE_SIZE = 14;
export const RESIZE_HANDLE_WIDTH = 6;
export const MIN_COLUMN_WIDTH = 48;
export const DRAG_SELECTION_THRESHOLD = 4;
export const AXIS_DRAG_THRESHOLD = 6;
export const EXTEND_BUTTON_OFFSET = 10;
export const OVERLAY_SELECTOR = '[data-s1000d-table-overlay]';
export const SUBMENU_GAP = 6;
export const CONTEXT_MENU_SCOPE_LABELS = {
  table: 'Table actions',
  row: 'Row actions',
  column: 'Column actions',
  cell: 'Cell actions',
} as const;

export interface S1000DOverlayRenderState {
  geometry: TableGeometry;
  hostRect: DOMRect;
  positionState: TableOverlayPositionState;
  tablePos: number;
}

export interface S1000DAxisDragState {
  axis: 'row' | 'column';
  handle: HTMLButtonElement;
  hasDragged: boolean;
  index: number;
  isValidTarget: boolean;
  startX: number;
  startY: number;
  tablePos: number;
  tgroupIndex: number;
  targetIndex: number | null;
}

export function shouldToggleContextMenuFromAxisHandle(
  interaction: {
    selectedAxisExplicit?: boolean;
    selectedAxis: { kind: 'row' | 'column' | null; index: number | null; tablePos: number | null; tgroupIndex?: number | null };
  },
  axis: 'row' | 'column',
  index: number,
  tablePos: number,
  tgroupIndex?: number | null,
): boolean {
  return Boolean(interaction.selectedAxisExplicit)
    && interaction.selectedAxis.kind === axis
    && interaction.selectedAxis.index === index
    && interaction.selectedAxis.tablePos === tablePos
    && (tgroupIndex == null || interaction.selectedAxis.tgroupIndex === tgroupIndex);
}

export function shouldToggleContextMenuFromTableHandle(
  interaction: {
    tableSelected: boolean;
    activeTable: { tablePos: number } | null;
  },
  tablePos: number,
): boolean {
  return interaction.tableSelected && interaction.activeTable?.tablePos === tablePos;
}

export function isAxisHandleHovered(
  interaction: {
    hovered: { tablePos: number; rowIndex: number | null; columnIndex: number | null } | null;
  },
  axis: 'row' | 'column',
  tablePos: number,
  index: number,
): boolean {
  if (interaction.hovered?.tablePos !== tablePos) {
    return false;
  }

  return axis === 'row'
    ? interaction.hovered.rowIndex === index
    : interaction.hovered.columnIndex === index;
}

export function isAxisHandleSelected(
  interaction: {
    selectedAxisExplicit?: boolean;
    selectedAxis: { kind: 'row' | 'column' | null; index: number | null; tablePos: number | null; tgroupIndex?: number | null };
  },
  axis: 'row' | 'column',
  tablePos: number,
  index: number,
  tgroupIndex?: number | null,
): boolean {
  return Boolean(interaction.selectedAxisExplicit)
    && interaction.selectedAxis.kind === axis
    && interaction.selectedAxis.index === index
    && interaction.selectedAxis.tablePos === tablePos
    && (tgroupIndex == null || interaction.selectedAxis.tgroupIndex === tgroupIndex);
}

export function getExtendRowIndex(
  tgroup: import('prosemirror-model').Node,
  tgroupIndex: number,
): number {
  const grid = createS1000DTableAdapter().createGrid(tgroup, tgroupIndex);
  const lastBodyRow = [...grid.rows].reverse().find((row) => row.section === 'tbody');
  return lastBodyRow?.rowIndex ?? Math.max(0, grid.height - 1);
}

export function isKeyboardClick(event: MouseEvent): boolean {
  return event.detail === 0;
}

export function createLayer(ownerDocument: Document, className: string): HTMLDivElement {
  const element = ownerDocument.createElement('div');
  element.className = className;
  Object.assign(element.style, {
    position: 'absolute',
    inset: '0',
    pointerEvents: 'none',
  });
  return element;
}

export function createBand(ownerDocument: Document, className: string): HTMLDivElement {
  return createBox(ownerDocument, className);
}

export function createBox(ownerDocument: Document, className: string): HTMLDivElement {
  const element = ownerDocument.createElement('div');
  element.className = className;
  element.hidden = true;
  return element;
}

export function syncCount(parent: HTMLElement, count: number, factory: () => HTMLElement): void {
  while (parent.children.length < count) {
    parent.append(factory());
  }

  while (parent.children.length > count) {
    parent.lastElementChild?.remove();
  }
}

export function applyRect(element: HTMLElement, rect: TableRect): void {
  Object.assign(element.style, {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  });
}

export function getVisibleRowRect(
  geometry: TableGeometry,
  positionState: TableOverlayPositionState,
  rowIndex: number,
): TableRect | null {
  const row = geometry.rows[rowIndex];
  if (!row) {
    return null;
  }

  return getVisibleTableRect(
    {
      left: positionState.tableLeft,
      top: positionState.tableTop + row.top,
      width: geometry.tableRect.width,
      height: row.height,
      right: positionState.tableLeft + geometry.tableRect.width,
      bottom: positionState.tableTop + row.top + row.height,
    },
    {
      left: positionState.visibleTableLeft,
      top: positionState.visibleTableTop,
      width: positionState.visibleTableWidth,
      height: positionState.visibleTableHeight,
      right: positionState.visibleTableLeft + positionState.visibleTableWidth,
      bottom: positionState.visibleTableTop + positionState.visibleTableHeight,
    },
  );
}

export function getVisibleColumnRect(
  geometry: TableGeometry,
  positionState: TableOverlayPositionState,
  columnIndex: number,
): TableRect | null {
  const column = geometry.columns[columnIndex];
  if (!column) {
    return null;
  }

  return getVisibleTableRect(
    {
      left: positionState.tableLeft + column.left,
      top: positionState.tableTop,
      width: column.width,
      height: geometry.tableRect.height,
      right: positionState.tableLeft + column.left + column.width,
      bottom: positionState.tableTop + geometry.tableRect.height,
    },
    {
      left: positionState.visibleTableLeft,
      top: positionState.visibleTableTop,
      width: positionState.visibleTableWidth,
      height: positionState.visibleTableHeight,
      right: positionState.visibleTableLeft + positionState.visibleTableWidth,
      bottom: positionState.visibleTableTop + positionState.visibleTableHeight,
    },
  );
}

export function getVisibleContentRowRect(
  geometry: TableGeometry,
  positionState: TableOverlayPositionState,
  rowIndex: number,
): TableRect | null {
  return getVisibleTableSelectionRect(
    geometry,
    positionState.tableLeft,
    positionState.tableTop,
    0,
    Math.max(0, geometry.columns.length - 1),
    rowIndex,
    rowIndex,
  );
}

export function getVisibleContentColumnRect(
  geometry: TableGeometry,
  positionState: TableOverlayPositionState,
  columnIndex: number,
): TableRect | null {
  return getVisibleTableSelectionRect(
    geometry,
    positionState.tableLeft,
    positionState.tableTop,
    columnIndex,
    columnIndex,
    0,
    Math.max(0, geometry.rows.length - 1),
  );
}

export function getVisibleCellRect(
  geometry: TableGeometry,
  positionState: TableOverlayPositionState,
  rowIndex: number,
  columnIndex: number,
): TableRect | null {
  return getVisibleTableSelectionRect(
    geometry,
    positionState.tableLeft,
    positionState.tableTop,
    columnIndex,
    columnIndex,
    rowIndex,
    rowIndex,
  );
}

export function isTableSelectionForContext(view: EditorView, tablePos: number): boolean {
  const selection = view.state.selection;
  return selection instanceof NodeSelection
    && selection.from === tablePos
    && selection.node.type.name === s1000dTableNodeNames.table;
}

export function isSingleRowSelection(
  selection: EditorView['state']['selection'],
  selectionInfo: ReturnType<typeof getS1000DSelectionInfo> | undefined,
): boolean {
  return Boolean(
    selectionInfo
    && isS1000DCellSelection(selection)
    && selection.isRowSelection()
    && selectionInfo.top === selectionInfo.bottom,
  );
}

export function isSingleColumnSelection(
  selection: EditorView['state']['selection'],
  selectionInfo: ReturnType<typeof getS1000DSelectionInfo> | undefined,
): boolean {
  return Boolean(
    selectionInfo
    && isS1000DCellSelection(selection)
    && selection.isColSelection()
    && selectionInfo.left === selectionInfo.right,
  );
}

export function findAxisAnchorEntry(
  grid: S1000DTgroupGrid,
  axis: 'row' | 'column',
  axisIndex: number,
): S1000DEntryRef | undefined {
  if (axis === 'row') {
    for (let columnIndex = 0; columnIndex < grid.width; columnIndex += 1) {
      const entry = grid.slots[axisIndex]?.[columnIndex]?.entry;
      if (entry) {
        return entry;
      }
    }
    return undefined;
  }

  for (let rowIndex = 0; rowIndex < grid.height; rowIndex += 1) {
    const entry = grid.slots[rowIndex]?.[axisIndex]?.entry;
    if (entry) {
      return entry;
    }
  }
  return undefined;
}

export function getHoveredRowIndex(geometry: TableGeometry, clientY: number): number | null {
  const localY = clientY - geometry.tableRect.top;
  const row = geometry.rows.find((item) => localY >= item.top && localY <= item.top + item.height);
  return row?.index ?? null;
}

export function getHoveredColumnIndex(geometry: TableGeometry, clientX: number): number | null {
  const localX = clientX - geometry.tableRect.left;
  const column = geometry.columns.find((item) => localX >= item.left && localX <= item.left + item.width);
  return column?.index ?? null;
}

export function getGridHitAtPoint(
  context: S1000DTableDOMContext,
  clientX: number,
  clientY: number,
  clampToTable: boolean,
): { entry: S1000DEntryRef; rowIndex: number; columnIndex: number } | undefined {
  if (!context.activeTgroup) {
    return undefined;
  }

  const geometry = measureS1000DRenderedTableGeometry(context.dom, context.wrapper, context.activeTgroupIndex);
  const localX = clampToTable
    ? clamp(clientX - geometry.tableRect.left, 0, Math.max(0, geometry.tableRect.width - 1))
    : clientX - geometry.tableRect.left;
  const localY = clampToTable
    ? clamp(clientY - geometry.tableRect.top, 0, Math.max(0, geometry.tableRect.height - 1))
    : clientY - geometry.tableRect.top;
  const rowIndex = findIndexByOffset(geometry.rows.map((row) => ({ start: row.top, size: row.height })), localY);
  const columnIndex = findIndexByOffset(geometry.columns.map((column) => ({ start: column.left, size: column.width })), localX);
  if (rowIndex === null || columnIndex === null) {
    return undefined;
  }

  const grid = createS1000DTableAdapter().createGrid(context.activeTgroup, context.activeTgroupIndex);
  const entry = grid.slots[rowIndex]?.[columnIndex]?.entry;
  return entry ? { entry, rowIndex, columnIndex } : undefined;
}

export function getS1000DCellDragContext(
  view: EditorView,
  target: EventTarget | null,
  clientX?: number,
  clientY?: number,
): { tablePos: number; entryPos: number; rowIndex: number; columnIndex: number } | null {
  const targetNode = target instanceof Node ? target : null;
  const targetElement = targetNode instanceof Element ? targetNode : targetNode?.parentElement ?? null;
  const cellElement = targetElement?.closest('td,th') as HTMLElement | null;
  const tableContext = findS1000DTableAtDOM(view, cellElement ?? targetElement);
  if (!tableContext?.activeTgroup) {
    return null;
  }

  const grid = createS1000DTableAdapter().createGrid(tableContext.activeTgroup, tableContext.activeTgroupIndex);

  if (cellElement) {
    const entryPos = resolveEntryPosFromCellDOM(view, cellElement);
    if (entryPos !== undefined) {
      const entry = grid.entries.find((candidate) => findS1000DEntryPosition(tableContext, candidate) === entryPos);
      if (entry) {
        return {
          tablePos: tableContext.tablePos,
          entryPos,
          rowIndex: entry.rowIndex,
          columnIndex: entry.columnIndex,
        };
      }
    }
  }

  if (clientX == null || clientY == null) {
    return null;
  }

  const hit = getGridHitAtPoint(tableContext, clientX, clientY, true);
  if (!hit) {
    return null;
  }

  const entryPos = findS1000DEntryPosition(tableContext, hit.entry);
  if (typeof entryPos !== 'number') {
    return null;
  }

  return {
    tablePos: tableContext.tablePos,
    entryPos,
    rowIndex: hit.rowIndex,
    columnIndex: hit.columnIndex,
  };
}

export function findIndexByOffset(
  items: ReadonlyArray<{ start: number; size: number }>,
  offset: number,
): number | null {
  const match = items.findIndex((item) => offset >= item.start && offset <= item.start + item.size);
  return match >= 0 ? match : null;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function getMenuPosition(
  hostRect: DOMRect,
  scope: 'table' | 'row' | 'column' | 'cell',
  anchor: { left: number; top: number },
) {
  const inset = 12;
  const position = getTableContextMenuPosition(
    scope,
    anchor.left - hostRect.left,
    anchor.top - hostRect.top,
    256,
    320,
    inset,
    inset,
    Math.max(inset, hostRect.width - inset),
    Math.max(inset, hostRect.height - inset),
  );

  return {
    left: position.left,
    top: position.top,
  };
}

export function isSameGeometry(current: TableGeometry | null, next: TableGeometry | null) {
  if (!current || !next) return current === next;
  if (
    current.tableRect.left !== next.tableRect.left
    || current.tableRect.top !== next.tableRect.top
    || current.tableRect.width !== next.tableRect.width
    || current.tableRect.height !== next.tableRect.height
    || current.wrapperRect.left !== next.wrapperRect.left
    || current.wrapperRect.top !== next.wrapperRect.top
    || current.wrapperRect.width !== next.wrapperRect.width
    || current.wrapperRect.height !== next.wrapperRect.height
    || current.visibleTableRect.left !== next.visibleTableRect.left
    || current.visibleTableRect.top !== next.visibleTableRect.top
    || current.visibleTableRect.width !== next.visibleTableRect.width
    || current.visibleTableRect.height !== next.visibleTableRect.height
    || current.scrollLeft !== next.scrollLeft
    || current.scrollTop !== next.scrollTop
    || current.columns.length !== next.columns.length
    || current.rows.length !== next.rows.length
  ) {
    return false;
  }

  for (let index = 0; index < current.columns.length; index += 1) {
    const column = current.columns[index]!;
    const nextColumn = next.columns[index]!;
    if (column.left !== nextColumn.left || column.width !== nextColumn.width) {
      return false;
    }
  }

  for (let index = 0; index < current.rows.length; index += 1) {
    const row = current.rows[index]!;
    const nextRow = next.rows[index]!;
    if (row.top !== nextRow.top || row.height !== nextRow.height) {
      return false;
    }
  }

  return true;
}

export function resolveEntryPosFromCellDOM(view: EditorView, cell: HTMLElement): number | undefined {
  try {
    const resolved = view.state.doc.resolve(view.posAtDOM(cell, 0));
    for (let depth = resolved.depth; depth > 0; depth -= 1) {
      if (resolved.node(depth).type.name === s1000dTableNodeNames.entry) {
        return resolved.before(depth);
      }
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export function getPointerElement(ownerDocument: Document, event: MouseEvent): Element | null {
  const pointTarget = ownerDocument.elementFromPoint(event.clientX, event.clientY);
  if (pointTarget instanceof Element) {
    return pointTarget;
  }

  if (event.target instanceof Element) {
    return event.target;
  }

  return event.target instanceof Node ? event.target.parentElement : null;
}

export function hitTestRenderedTablePoint(
  context: S1000DTableDOMContext,
  clientX: number,
  clientY: number,
): boolean {
  const geometry = measureS1000DRenderedTableGeometry(context.dom, context.wrapper, context.activeTgroupIndex);
  return clientX >= geometry.tableRect.left
    && clientX <= geometry.tableRect.right
    && clientY >= geometry.tableRect.top
    && clientY <= geometry.tableRect.bottom;
}

export function measureS1000DRenderedTableGeometry(
  table: HTMLTableElement,
  wrapper?: HTMLElement,
  activeTgroupIndex?: number | null,
): TableGeometry {
  const tableRect = measureS1000DTableRect(table, activeTgroupIndex);
  const wrapperRect = wrapper ? toTableRect(wrapper.getBoundingClientRect()) : tableRect;
  const visibleTableRect = getVisibleTableRect(tableRect, wrapperRect);
  const columnBoundaries = measureS1000DColumnBoundaries(table, tableRect);
  const rowElements = getRenderedRowElements(table, activeTgroupIndex);
  const rows = rowElements.map((row, index) => {
    const rect = row.getBoundingClientRect();
    return {
      index,
      top: rect.top - tableRect.top,
      height: rect.height,
    };
  });

  return {
    tableRect,
    wrapperRect,
    visibleTableRect,
    scrollLeft: wrapper ? wrapper.scrollLeft : 0,
    scrollTop: wrapper ? wrapper.scrollTop : 0,
    columns: columnBoundaries.slice(0, -1).map((left, index) => ({
      index,
      left,
      width: Math.max(0, (columnBoundaries[index + 1] ?? left) - left),
    })),
    rows,
  };
}

function getRenderedRowElements(table: HTMLTableElement, activeTgroupIndex?: number | null): HTMLTableRowElement[] {
  const renderedTgroup = getRenderedTgroupElement(table, activeTgroupIndex);
  const rowRoot = renderedTgroup ?? table;
  return Array.from(rowRoot.querySelectorAll('tr'));
}

function getRenderedTgroupElement(
  table: HTMLTableElement,
  activeTgroupIndex?: number | null,
): HTMLElement | null {
  if (typeof activeTgroupIndex !== 'number' || activeTgroupIndex < 0) {
    return null;
  }

  const directTgroups = Array.from(table.children).filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement
      && child.matches('tbody[data-s1000d="tgroup"]'),
  );
  return directTgroups[activeTgroupIndex] ?? null;
}

export function measureS1000DTableRect(
  table: HTMLTableElement,
  activeTgroupIndex?: number | null,
): TableRect {
  const tableRect = toTableRect(table.getBoundingClientRect());
  const rows = getRenderedRowElements(table, activeTgroupIndex);
  if (rows.length === 0) {
    return tableRect;
  }

  const firstRowRect = rows[0]?.getBoundingClientRect();
  const lastRowRect = rows[rows.length - 1]?.getBoundingClientRect();
  if (!firstRowRect || !lastRowRect) {
    return tableRect;
  }

  return {
    left: tableRect.left,
    right: tableRect.right,
    width: tableRect.width,
    top: firstRowRect.top,
    bottom: lastRowRect.bottom,
    height: Math.max(0, lastRowRect.bottom - firstRowRect.top),
  };
}

export function measureS1000DColumnBoundaries(table: HTMLTableElement, tableRect: TableRect): number[] {
  const rows = Array.from(table.querySelectorAll('tr'));
  const boundaries: Array<number | undefined> = [0];
  const activeRowSpans: number[] = [];
  const spanningCells: Array<{ start: number; span: number; left: number; right: number }> = [];
  let width = 0;

  for (const row of rows) {
    const cells = Array.from(row.children).filter(
      (cell): cell is HTMLTableCellElement => cell instanceof HTMLTableCellElement,
    );
    let columnIndex = 0;

    for (const cell of cells) {
      while ((activeRowSpans[columnIndex] ?? 0) > 0) {
        columnIndex += 1;
      }

      const colSpan = Math.max(1, cell.colSpan || 1);
      const rowSpan = Math.max(1, cell.rowSpan || 1);
      const rect = cell.getBoundingClientRect();
      const left = rect.left - tableRect.left;
      const right = rect.right - tableRect.left;

      boundaries[columnIndex] = left;
      boundaries[columnIndex + colSpan] = right;
      width = Math.max(width, columnIndex + colSpan);

      if (colSpan > 1) {
        spanningCells.push({
          start: columnIndex,
          span: colSpan,
          left,
          right,
        });
      }

      for (let offset = 0; offset < colSpan; offset += 1) {
        activeRowSpans[columnIndex + offset] = Math.max(activeRowSpans[columnIndex + offset] ?? 0, rowSpan);
      }

      columnIndex += colSpan;
    }

    for (let index = 0; index < activeRowSpans.length; index += 1) {
      if ((activeRowSpans[index] ?? 0) > 0) {
        activeRowSpans[index] = (activeRowSpans[index] ?? 0) - 1;
      }
    }
  }

  const resolvedBoundaries = boundaries.slice(0, width + 1);
  resolvedBoundaries[0] ??= 0;
  resolvedBoundaries[width] ??= tableRect.width;

  for (const cell of spanningCells) {
    const start = cell.start;
    const end = cell.start + cell.span;

    if (resolvedBoundaries[start] === undefined) {
      resolvedBoundaries[start] = cell.left;
    }

    if (resolvedBoundaries[end] === undefined) {
      resolvedBoundaries[end] = cell.right;
    }

    let hasGap = false;
    for (let index = start + 1; index < end; index += 1) {
      if (resolvedBoundaries[index] === undefined) {
        hasGap = true;
        break;
      }
    }

    if (!hasGap) continue;

    const segmentWidth = cell.right - cell.left;
    for (let index = start + 1; index < end; index += 1) {
      resolvedBoundaries[index] ??= cell.left + (segmentWidth * (index - start)) / cell.span;
    }
  }

  for (let index = 1; index < resolvedBoundaries.length; index += 1) {
    resolvedBoundaries[index] ??= resolvedBoundaries[index - 1] ?? 0;
  }

  return resolvedBoundaries.map((boundary) => boundary ?? 0);
}
