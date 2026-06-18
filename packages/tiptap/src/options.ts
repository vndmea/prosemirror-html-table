import type { EditorState } from '@tiptap/pm/state';

import type { HtmlTableContextAction } from './html-table-actions.js';
import type { HtmlTableInteractionState } from './html-table-interaction.js';
import type { HtmlTableSelectionScope } from './html-table-overlay-geometry.js';
import type { HtmlTableNodeView } from './table-view.js';

export interface HtmlTableContextActionResolverParams {
  interaction: HtmlTableInteractionState;
  scope: HtmlTableSelectionScope;
  state: EditorState;
}

export type HtmlTableContextActionResolver = (
  params: HtmlTableContextActionResolverParams,
) => HtmlTableContextAction[];

export interface HtmlTableTiptapOptions {
  HTMLAttributes: Record<string, unknown>;
  resizable: boolean;
  renderWrapper: boolean;
  handleWidth: number;
  cellMinWidth: number;
  lastColumnResizable: boolean;
  allowTableNodeSelection: boolean;
  enableRowColumnDrag: boolean;
  allowCrossSectionRowDrag: boolean;
  enableTabNavigation: boolean;
  addRowOnTabAtEnd: boolean;
  enableShiftArrowSelection: boolean;
  constrainShiftArrowToSection: boolean;
  deleteTableOnAllCellsSelected: boolean;
  enableCellRangeClipboard: boolean;
  expandTableOnPaste: boolean;
  clearCellsOnDelete: boolean;
  View: typeof HtmlTableNodeView | null;
  wrapperClassName: string;
  selectedCellClassName: string;
  selectedTableClassName: string;
  contextActionResolver: HtmlTableContextActionResolver | null;
}

export const defaultHtmlTableTiptapOptions: HtmlTableTiptapOptions = {
  HTMLAttributes: {},
  resizable: true,
  renderWrapper: true,
  handleWidth: 1,
  cellMinWidth: 120,
  lastColumnResizable: true,
  allowTableNodeSelection: true,
  enableRowColumnDrag: true,
  allowCrossSectionRowDrag: false,
  enableTabNavigation: true,
  addRowOnTabAtEnd: true,
  enableShiftArrowSelection: true,
  constrainShiftArrowToSection: true,
  deleteTableOnAllCellsSelected: true,
  enableCellRangeClipboard: true,
  expandTableOnPaste: false,
  clearCellsOnDelete: true,
  View: null,
  wrapperClassName: 'html-table-node__wrapper',
  selectedCellClassName: 'html-table-cell--selected',
  selectedTableClassName: 'html-table-node--selected',
  contextActionResolver: null,
};
