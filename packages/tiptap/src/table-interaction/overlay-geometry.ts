import type { TableGeometry, TableRect } from './dom-geometry.js';

export type TableContextMenuPlacement =
  | 'right-start'
  | 'right-center'
  | 'left-start'
  | 'left-center'
  | 'bottom-center'
  | 'top-center';

export interface TableContextMenuPosition {
  left: number;
  top: number;
  placement: TableContextMenuPlacement;
}

export interface TableOverlayPositionState {
  tableLeft: number;
  tableTop: number;
  visibleTableLeft: number;
  visibleTableTop: number;
  visibleTableWidth: number;
  visibleTableHeight: number;
  rowHandleLeft: number;
  columnHandleTop: number;
}

export interface TableOverlayViewportBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function getTableContextMenuPosition(
  scope: 'table' | 'row' | 'column' | 'cell',
  anchorLeft: number,
  anchorTop: number,
  menuWidth: number,
  menuHeight: number,
  viewportLeft: number,
  viewportTop: number,
  viewportRight: number,
  viewportBottom: number,
): TableContextMenuPosition {
  const offset = 12;
  let left = anchorLeft + offset;
  let top =
    scope === 'column'
      ? anchorTop + offset
      : scope === 'table'
        ? anchorTop + offset
        : anchorTop - menuHeight / 2;
  let placement: TableContextMenuPlacement =
    scope === 'column' ? 'bottom-center' : scope === 'table' ? 'right-start' : 'right-center';

  if (scope === 'column') {
    left = anchorLeft - menuWidth / 2;
  }

  if (left + menuWidth > viewportRight) {
    if (scope === 'column') {
      left = viewportRight - menuWidth;
    } else {
      left = anchorLeft - offset - menuWidth;
      placement = scope === 'table' ? 'left-start' : 'left-center';
    }
  }

  if (left < viewportLeft) {
    left = viewportLeft;
  }

  if (scope === 'column' || scope === 'table') {
    if (top + menuHeight > viewportBottom) {
      top = anchorTop - offset - menuHeight;
      placement = 'top-center';
    }
  }

  if (top < viewportTop) {
    top = viewportTop;
  }

  if (top + menuHeight > viewportBottom) {
    top = Math.max(viewportTop, viewportBottom - menuHeight);
  }

  return {
    left,
    top,
    placement,
  };
}

export function getTableContextMenuTransformOrigin(placement: TableContextMenuPlacement): string {
  switch (placement) {
    case 'left-start':
      return 'right top';
    case 'left-center':
      return 'right center';
    case 'bottom-center':
      return 'center top';
    case 'top-center':
      return 'center bottom';
    case 'right-start':
      return 'left top';
    case 'right-center':
    default:
      return 'left center';
  }
}

export function getTableOverlayPositionState(
  geometry: TableGeometry,
  hostRect: DOMRect,
  minHandleInset: number,
  rowHandleOffset: number,
  columnHandleOffset: number,
): TableOverlayPositionState {
  const tableLeft = geometry.tableRect.left - hostRect.left;
  const tableTop = geometry.tableRect.top - hostRect.top;
  const visibleTableLeft = geometry.visibleTableRect.left - hostRect.left;
  const visibleTableTop = geometry.visibleTableRect.top - hostRect.top;

  return {
    tableLeft,
    tableTop,
    visibleTableLeft,
    visibleTableTop,
    visibleTableWidth: geometry.visibleTableRect.width,
    visibleTableHeight: geometry.visibleTableRect.height,
    rowHandleLeft: Math.max(minHandleInset, visibleTableLeft - rowHandleOffset),
    columnHandleTop: Math.max(minHandleInset, visibleTableTop - columnHandleOffset),
  };
}

export function getTableOverlayViewportBounds(
  hostRect: DOMRect,
  viewportWidth: number,
  viewportHeight: number,
  inset: number,
): TableOverlayViewportBounds {
  return {
    left: inset - hostRect.left,
    top: inset - hostRect.top,
    right: viewportWidth - hostRect.left - inset,
    bottom: viewportHeight - hostRect.top - inset,
  };
}

export function getVisibleTableSelectionRect(
  geometry: TableGeometry,
  tableLeft: number,
  tableTop: number,
  leftColumnIndex: number,
  rightColumnIndex: number,
  topRowIndex: number,
  bottomRowIndex: number,
): TableRect | null {
  const selectionRect = getTableSelectionRect(
    geometry,
    tableLeft,
    tableTop,
    leftColumnIndex,
    rightColumnIndex,
    topRowIndex,
    bottomRowIndex,
  );
  if (!selectionRect) {
    return null;
  }

  return clampTableRect(selectionRect, getVisibleTableOverlayRect(geometry, tableLeft, tableTop));
}

export function getVisibleTableOverlayRect(
  geometry: TableGeometry,
  tableLeft: number,
  tableTop: number,
): TableRect {
  return {
    left: tableLeft + (geometry.visibleTableRect.left - geometry.tableRect.left),
    top: tableTop + (geometry.visibleTableRect.top - geometry.tableRect.top),
    right: tableLeft + (geometry.visibleTableRect.right - geometry.tableRect.left),
    bottom: tableTop + (geometry.visibleTableRect.bottom - geometry.tableRect.top),
    width: geometry.visibleTableRect.width,
    height: geometry.visibleTableRect.height,
  };
}

function getTableSelectionRect(
  geometry: TableGeometry,
  tableLeft: number,
  tableTop: number,
  leftColumnIndex: number,
  rightColumnIndex: number,
  topRowIndex: number,
  bottomRowIndex: number,
): TableRect | null {
  const leftColumn = geometry.columns[leftColumnIndex];
  const rightColumn = geometry.columns[rightColumnIndex];
  const topRow = geometry.rows[topRowIndex];
  const bottomRow = geometry.rows[bottomRowIndex];
  if (!leftColumn || !rightColumn || !topRow || !bottomRow) {
    return null;
  }

  const left = tableLeft + leftColumn.left;
  const top = tableTop + topRow.top;
  const right = tableLeft + rightColumn.left + rightColumn.width;
  const bottom = tableTop + bottomRow.top + bottomRow.height;

  return {
    left,
    top,
    right,
    bottom,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

function clampTableRect(rect: TableRect, visibleRect: TableRect): TableRect | null {
  const left = Math.max(rect.left, visibleRect.left);
  const top = Math.max(rect.top, visibleRect.top);
  const right = Math.min(rect.right, visibleRect.right);
  const bottom = Math.min(rect.bottom, visibleRect.bottom);

  if (right <= left || bottom <= top) {
    return null;
  }

  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}
