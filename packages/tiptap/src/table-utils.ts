import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { NodeSelection, Plugin, PluginKey } from '@tiptap/pm/state';
import {
  CellSelection,
  getTableSelectionInfo,
  htmlTableNodeNames,
} from 'prosemirror-html-table';

import type { HtmlTableTiptapOptions } from './options.js';
export {
  applyColumnWidths,
  createAxisFocusTransaction,
  createColumnResizeTransaction,
  createColumnSelectionTransaction,
  createRowSelectionTransaction,
  findAdjacentCell,
  getTableColumnWidths,
  getTableSelectionInfo,
} from 'prosemirror-html-table';
export type { TableSelectionInfo } from 'prosemirror-html-table';
export {
  measureHtmlTableGeometry,
  measureRenderedColumnBoundaries,
  measureRenderedRowBoundaries,
  type HtmlTableColumnGeometry,
  type HtmlTableDOMContext,
  type HtmlTableGeometry,
  type HtmlTableRect,
  type HtmlTableRowGeometry,
} from './table-dom.js';

export const htmlTableSelectionPluginKey = new PluginKey('html-table-selection-visuals');

export function createSelectionDecorations(
  state: import('@tiptap/pm/state').EditorState,
  options: HtmlTableTiptapOptions,
): DecorationSet {
  const decorations: Decoration[] = [];
  const selectionInfo =
    state.selection instanceof CellSelection || state.selection.empty
      ? getTableSelectionInfo(state.doc, state.selection)
      : undefined;

  if (selectionInfo) {
    for (const cell of selectionInfo.cells) {
      const cellPos = selectionInfo.cellPositions.get(cell);
      if (cellPos === undefined) continue;

      const classNames = [options.selectedCellClassName];
      if (cell === selectionInfo.anchorCell) classNames.push(`${options.selectedCellClassName}--anchor`);
      if (cell === selectionInfo.headCell) classNames.push(`${options.selectedCellClassName}--head`);

      decorations.push(
        Decoration.node(cellPos, cellPos + cell.node.nodeSize, {
          class: classNames.join(' '),
          'data-testid': 'pmht-selected-cell',
        }),
      );
    }

    decorations.push(
      Decoration.node(selectionInfo.tablePos, selectionInfo.tablePos + selectionInfo.table.nodeSize, {
        class: 'html-table-node--has-selection',
      }),
    );
  }

  if (state.selection instanceof NodeSelection && state.selection.node.type.name === htmlTableNodeNames.table) {
    decorations.push(
      Decoration.node(state.selection.from, state.selection.to, {
        class: options.selectedTableClassName,
      }),
    );
  }

  return DecorationSet.create(state.doc, decorations);
}

export function createHtmlTableSelectionPlugin(options: HtmlTableTiptapOptions): Plugin {
  return new Plugin({
    key: htmlTableSelectionPluginKey,
    props: {
      decorations(state) {
        return createSelectionDecorations(state, options);
      },
      handleClickOn(_view, _pos, node, _nodePos, event, direct) {
        if (!direct || node.type.name !== htmlTableNodeNames.table) return false;
        if (options.allowTableNodeSelection) return false;

        const target = event.target as HTMLElement | null;
        if (target?.closest('td,th,caption')) return false;
        return true;
      },
    },
  });
}
