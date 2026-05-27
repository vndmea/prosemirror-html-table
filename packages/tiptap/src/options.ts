import type { HtmlTableNodeView } from './table-view.js';

export interface HtmlTableTiptapOptions {
  HTMLAttributes: Record<string, unknown>;
  resizable: boolean;
  renderWrapper: boolean;
  cellMinWidth: number;
  allowTableNodeSelection: boolean;
  View: typeof HtmlTableNodeView | null;
  wrapperClassName: string;
  selectedCellClassName: string;
  selectedTableClassName: string;
}

export const defaultHtmlTableTiptapOptions: HtmlTableTiptapOptions = {
  HTMLAttributes: {},
  resizable: true,
  renderWrapper: true,
  cellMinWidth: 120,
  allowTableNodeSelection: true,
  View: null,
  wrapperClassName: 'html-table-node__wrapper',
  selectedCellClassName: 'html-table-cell--selected',
  selectedTableClassName: 'html-table-node--selected',
};
