import type { HtmlTableInteractionState } from '../interaction/plugin.js';
import {
  getTableContextMenuPosition,
  getTableContextSubmenuPosition,
  getTableContextSubmenuTransformOrigin,
  getTableContextMenuTransformOrigin,
  getTableOverlayPositionState,
  getTableOverlayViewportBounds,
  getVisibleTableOverlayRect,
  getVisibleTableSelectionRect,
  type TableContextMenuPlacement,
  type TableContextMenuPosition,
  type TableContextSubmenuPlacement,
  type TableContextSubmenuPosition,
  type TableOverlayPositionState,
  type TableOverlayViewportBounds,
} from '../table-interaction/overlay-geometry.js';
import type { HtmlTableGeometry } from '../table-dom.js';
import { getTableSelectionInfo } from '../table-utils.js';

export type HtmlTableSelectionScope = 'table' | 'row' | 'column' | 'cell';

export interface HtmlTableSelectionAnchor {
  left: number;
  top: number;
}

export type HtmlTableContextMenuPlacement = TableContextMenuPlacement;
export type HtmlTableContextMenuPosition = TableContextMenuPosition;
export type HtmlTableContextSubmenuPlacement = TableContextSubmenuPlacement;
export type HtmlTableContextSubmenuPosition = TableContextSubmenuPosition;
export type HtmlTableOverlayPositionState = TableOverlayPositionState;
export type HtmlTableOverlayViewportBounds = TableOverlayViewportBounds;

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

export const getHtmlTableContextMenuPosition = getTableContextMenuPosition;
export const getHtmlTableContextMenuTransformOrigin = getTableContextMenuTransformOrigin;
export const getHtmlTableContextSubmenuPosition = getTableContextSubmenuPosition;
export const getHtmlTableContextSubmenuTransformOrigin = getTableContextSubmenuTransformOrigin;
export const getHtmlTableOverlayPositionState = getTableOverlayPositionState;
export const getHtmlTableOverlayViewportBounds = getTableOverlayViewportBounds;
export const getHtmlTableVisibleSelectionRect = getVisibleTableSelectionRect;
export const getHtmlTableVisibleOverlayRect = getVisibleTableOverlayRect;
