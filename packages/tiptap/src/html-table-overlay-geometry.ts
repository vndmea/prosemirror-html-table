import type { HtmlTableInteractionState } from './html-table-interaction.js';
import type { HtmlTableGeometry, HtmlTableRect } from './table-dom.js';
import { getTableSelectionInfo } from './table-utils.js';

export type HtmlTableSelectionScope = 'table' | 'row' | 'column' | 'cell';

export interface HtmlTableSelectionAnchor {
  left: number;
  top: number;
}

export type HtmlTableContextMenuPlacement =
  | 'right-start'
  | 'right-center'
  | 'left-start'
  | 'left-center'
  | 'bottom-center'
  | 'top-center';

export interface HtmlTableContextMenuPosition {
  left: number;
  top: number;
  placement: HtmlTableContextMenuPlacement;
}

export interface HtmlTableOverlayPositionState {
  tableLeft: number;
  tableTop: number;
  visibleTableLeft: number;
  visibleTableTop: number;
  visibleTableWidth: number;
  visibleTableHeight: number;
  rowHandleLeft: number;
  columnHandleTop: number;
}

export interface HtmlTableOverlayViewportBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function getHtmlTableSelectionScope(
  interaction: HtmlTableInteractionState,
  tablePos: number,
  selectionInfo: ReturnType<typeof getTableSelectionInfo> | null,
): HtmlTableSelectionScope | null {
  if (interaction.tableSelected && interaction.activeTable?.tablePos === tablePos) {
    return 'table';
  }

  if (Boolean(interaction.selectedAxisExplicit) && interaction.selectedAxis.tablePos === tablePos) {
    if (interaction.selectedAxis.kind === 'row') return 'row';
    if (interaction.selectedAxis.kind === 'column') return 'column';
  }

  if (selectionInfo?.tablePos === tablePos) {
    return 'cell';
  }

  return null;
}

export function getHtmlTableSelectionAnchor(
  interaction: HtmlTableInteractionState,
  tablePos: number,
  geometry: HtmlTableGeometry,
  tableLeft: number,
  tableTop: number,
  selectionInfo: ReturnType<typeof getTableSelectionInfo> | null,
): HtmlTableSelectionAnchor | null {
  const scope = getHtmlTableSelectionScope(interaction, tablePos, selectionInfo);
  const visibleTableRect = getHtmlTableVisibleOverlayRect(geometry, tableLeft, tableTop);
  if (scope === 'table') {
    return {
      left: visibleTableRect.left,
      top: visibleTableRect.top,
    };
  }

  if (scope === 'row' && interaction.selectedAxis.index !== null) {
    const rect = getHtmlTableVisibleSelectionRect(
      geometry,
      tableLeft,
      tableTop,
      0,
      Math.max(0, geometry.columns.length - 1),
      interaction.selectedAxis.index,
      interaction.selectedAxis.index,
    );
    if (!rect) return null;
    return {
      left: rect.left,
      top: rect.top + rect.height / 2,
    };
  }

  if (scope === 'column' && interaction.selectedAxis.index !== null) {
    const rect = getHtmlTableVisibleSelectionRect(
      geometry,
      tableLeft,
      tableTop,
      interaction.selectedAxis.index,
      interaction.selectedAxis.index,
      0,
      Math.max(0, geometry.rows.length - 1),
    );
    if (!rect) return null;
    return {
      left: rect.left + rect.width / 2,
      top: rect.top,
    };
  }

  if (scope === 'cell' && selectionInfo) {
    const rect = getHtmlTableVisibleSelectionRect(
      geometry,
      tableLeft,
      tableTop,
      selectionInfo.left,
      selectionInfo.right,
      selectionInfo.top,
      selectionInfo.bottom,
    );
    if (!rect) {
      return null;
    }

    return {
      left: rect.right - 1,
      top: rect.top + rect.height / 2,
    };
  }

  return null;
}

export function getHtmlTableContextMenuPosition(
  scope: HtmlTableSelectionScope,
  anchorLeft: number,
  anchorTop: number,
  menuWidth: number,
  menuHeight: number,
  viewportLeft: number,
  viewportTop: number,
  viewportRight: number,
  viewportBottom: number,
): HtmlTableContextMenuPosition {
  const offset = 12;
  let left = anchorLeft + offset;
  let top =
    scope === 'column'
      ? anchorTop + offset
      : scope === 'table'
        ? anchorTop + offset
        : anchorTop - menuHeight / 2;
  let placement: HtmlTableContextMenuPlacement =
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

export function getHtmlTableContextMenuTransformOrigin(
  placement: HtmlTableContextMenuPlacement,
): string {
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

export function getHtmlTableOverlayPositionState(
  geometry: HtmlTableGeometry,
  hostRect: DOMRect,
  minHandleInset: number,
  rowHandleOffset: number,
  columnHandleOffset: number,
): HtmlTableOverlayPositionState {
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

export function getHtmlTableOverlayViewportBounds(
  hostRect: DOMRect,
  viewportWidth: number,
  viewportHeight: number,
  inset: number,
): HtmlTableOverlayViewportBounds {
  return {
    left: inset - hostRect.left,
    top: inset - hostRect.top,
    right: viewportWidth - hostRect.left - inset,
    bottom: viewportHeight - hostRect.top - inset,
  };
}

export function getHtmlTableVisibleSelectionRect(
  geometry: HtmlTableGeometry,
  tableLeft: number,
  tableTop: number,
  leftColumnIndex: number,
  rightColumnIndex: number,
  topRowIndex: number,
  bottomRowIndex: number,
): HtmlTableRect | null {
  const selectionRect = getHtmlTableSelectionRect(
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

  return clampHtmlTableRect(selectionRect, getHtmlTableVisibleOverlayRect(geometry, tableLeft, tableTop));
}

export function getHtmlTableVisibleOverlayRect(
  geometry: HtmlTableGeometry,
  tableLeft: number,
  tableTop: number,
): HtmlTableRect {
  return {
    left: tableLeft + (geometry.visibleTableRect.left - geometry.tableRect.left),
    top: tableTop + (geometry.visibleTableRect.top - geometry.tableRect.top),
    right: tableLeft + (geometry.visibleTableRect.right - geometry.tableRect.left),
    bottom: tableTop + (geometry.visibleTableRect.bottom - geometry.tableRect.top),
    width: geometry.visibleTableRect.width,
    height: geometry.visibleTableRect.height,
  };
}

function getHtmlTableSelectionRect(
  geometry: HtmlTableGeometry,
  tableLeft: number,
  tableTop: number,
  leftColumnIndex: number,
  rightColumnIndex: number,
  topRowIndex: number,
  bottomRowIndex: number,
): HtmlTableRect | null {
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

function clampHtmlTableRect(rect: HtmlTableRect, visibleRect: HtmlTableRect): HtmlTableRect | null {
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
