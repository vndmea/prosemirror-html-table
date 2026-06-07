import type { HtmlTableNodeView } from './table-view.js';

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
  View: typeof HtmlTableNodeView | null;
  wrapperClassName: string;
  selectedCellClassName: string;
  selectedTableClassName: string;
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
  View: null,
  wrapperClassName: 'html-table-node__wrapper',
  selectedCellClassName: 'html-table-cell--selected',
  selectedTableClassName: 'html-table-node--selected',
};
