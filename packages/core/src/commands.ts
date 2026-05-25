import type { Command } from 'prosemirror-state';

import { createHtmlTableNode, type CreateHtmlTableOptions } from './builders.js';

export interface InsertHtmlTableCommandOptions extends CreateHtmlTableOptions {
  selectInsertedTable?: boolean;
}

export function insertHtmlTable(options: InsertHtmlTableCommandOptions = {}): Command {
  return (state, dispatch) => {
    const table = createHtmlTableNode(state.schema, options);

    if (dispatch) {
      const transaction = state.tr.replaceSelectionWith(table);
      dispatch(transaction.scrollIntoView());
    }

    return true;
  };
}
