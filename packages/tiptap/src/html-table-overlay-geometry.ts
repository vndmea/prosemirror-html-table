import type { HtmlTableInteractionState } from './html-table-interaction.js';
import type { HtmlTableGeometry } from './table-dom.js';
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
  if (scope === 'table') {
    return {
      left: tableLeft,
      top: tableTop,
    };
  }

  if (scope === 'row' && interaction.selectedAxis.index !== null) {
    const row = geometry.rows[interaction.selectedAxis.index];
    if (!row) return null;
    return {
      left: tableLeft,
      top: tableTop + row.top + row.height / 2,
    };
  }

  if (scope === 'column' && interaction.selectedAxis.index !== null) {
    const column = geometry.columns[interaction.selectedAxis.index];
    if (!column) return null;
    return {
      left: tableLeft + column.left + column.width / 2,
      top: tableTop,
    };
  }

  if (scope === 'cell' && selectionInfo) {
    const leftColumn = geometry.columns[selectionInfo.left];
    const rightColumn = geometry.columns[selectionInfo.right];
    const topRow = geometry.rows[selectionInfo.top];
    const bottomRow = geometry.rows[selectionInfo.bottom];
    if (!leftColumn || !rightColumn || !topRow || !bottomRow) {
      return null;
    }

    const selectionTop = tableTop + topRow.top;
    const selectionBottom = tableTop + bottomRow.top + bottomRow.height;
    const selectionRight = tableLeft + rightColumn.left + rightColumn.width;

    return {
      left: selectionRight - 1,
      top: selectionTop + (selectionBottom - selectionTop) / 2,
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

  return {
    tableLeft,
    tableTop,
    rowHandleLeft: Math.max(minHandleInset, tableLeft - rowHandleOffset),
    columnHandleTop: Math.max(minHandleInset, tableTop - columnHandleOffset),
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
