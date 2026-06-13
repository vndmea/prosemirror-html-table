export interface TableRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface TableColumnGeometry {
  index: number;
  left: number;
  width: number;
}

export interface TableRowGeometry {
  index: number;
  top: number;
  height: number;
}

export interface TableGeometry {
  tableRect: TableRect;
  wrapperRect: TableRect;
  visibleTableRect: TableRect;
  scrollLeft: number;
  scrollTop: number;
  columns: TableColumnGeometry[];
  rows: TableRowGeometry[];
}

export function measureRenderedColumnBoundaries(table: HTMLTableElement): number[] {
  const tableRect = table.getBoundingClientRect();
  const activeRowSpans: number[] = [];
  const boundaries: Array<number | undefined> = [0];
  const spanningCells: Array<{ start: number; span: number; left: number; right: number }> = [];
  let width = 0;

  for (const row of Array.from(table.rows)) {
    let columnIndex = 0;

    for (const cell of Array.from(row.cells)) {
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

export function measureRenderedRowBoundaries(table: HTMLTableElement): number[] {
  const tableRect = getRenderedGridRect(table);
  const boundaries: number[] = [0];

  for (const row of Array.from(table.rows)) {
    const rect = row.getBoundingClientRect();
    boundaries.push(rect.bottom - tableRect.top);
  }

  return boundaries;
}

export function measureRenderedTableGeometry(table: HTMLTableElement, wrapper?: HTMLElement): TableGeometry {
  const tableRect = getRenderedGridRect(table);
  const wrapperRect = wrapper ? toTableRect(wrapper.getBoundingClientRect()) : tableRect;
  const visibleTableRect = getVisibleTableRect(tableRect, wrapperRect);
  const columnBoundaries = measureRenderedColumnBoundaries(table);
  const rowBoundaries = measureRenderedRowBoundaries(table);

  return {
    tableRect,
    wrapperRect,
    visibleTableRect,
    scrollLeft: wrapper?.scrollLeft ?? 0,
    scrollTop: wrapper?.scrollTop ?? 0,
    columns: Array.from({ length: Math.max(0, columnBoundaries.length - 1) }, (_value, index) => ({
      index,
      left: columnBoundaries[index] ?? 0,
      width: Math.max(0, (columnBoundaries[index + 1] ?? 0) - (columnBoundaries[index] ?? 0)),
    })),
    rows: Array.from({ length: Math.max(0, rowBoundaries.length - 1) }, (_value, index) => ({
      index,
      top: rowBoundaries[index] ?? 0,
      height: Math.max(0, (rowBoundaries[index + 1] ?? 0) - (rowBoundaries[index] ?? 0)),
    })),
  };
}

function getRenderedGridRect(table: HTMLTableElement): TableRect {
  const tableRect = table.getBoundingClientRect();
  const rows = Array.from(table.rows);
  if (rows.length === 0) {
    return toTableRect(tableRect);
  }

  const firstRowRect = rows[0]?.getBoundingClientRect();
  const lastRowRect = rows[rows.length - 1]?.getBoundingClientRect();
  if (!firstRowRect || !lastRowRect) {
    return toTableRect(tableRect);
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

export function toTableRect(rect: DOMRect | DOMRectReadOnly): TableRect {
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  };
}

export function getVisibleTableRect(tableRect: TableRect, wrapperRect: TableRect): TableRect {
  const left = Math.max(tableRect.left, wrapperRect.left);
  const top = Math.max(tableRect.top, wrapperRect.top);
  const right = Math.min(tableRect.right, wrapperRect.right);
  const bottom = Math.min(tableRect.bottom, wrapperRect.bottom);

  return {
    left,
    top,
    right: Math.max(left, right),
    bottom: Math.max(top, bottom),
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}
