import { tableEditing } from 'prosemirror-html-table';

import type { HtmlTableTiptapOptions } from './options.js';

export function createHtmlTableEditingPlugin(options: HtmlTableTiptapOptions) {
  return tableEditing({
    allowTableNodeSelection: options.allowTableNodeSelection,
    clearCellsOnDelete: options.clearCellsOnDelete,
    clearWholeTableCellSelectionOnDelete: false,
    constrainShiftArrowToSection: options.constrainShiftArrowToSection,
    deleteTableOnAllCellsSelected: options.deleteTableOnAllCellsSelected,
    enableCellRangeClipboard: options.enableCellRangeClipboard,
    enableShiftArrowSelection: options.enableShiftArrowSelection,
    expandTableOnPaste: options.expandTableOnPaste,
  });
}
