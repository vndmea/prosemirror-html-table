import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorState, Transaction } from 'prosemirror-state';

import { htmlTableNodeNames } from './names.js';
import { normalizeHtmlTable, type NormalizeHtmlTableOptions } from './normalize.js';
import type { HtmlTableNodeNames } from './types.js';

export interface FixTablesTransactionOptions extends NormalizeHtmlTableOptions {}

export function createFixTablesTransaction(
  state: EditorState,
  oldState?: EditorState,
  options: FixTablesTransactionOptions = {},
): Transaction | undefined {
  void oldState;

  const names: HtmlTableNodeNames = {
    ...htmlTableNodeNames,
    ...options.names,
  };
  const replacements: Array<{ pos: number; node: ProseMirrorNode; normalized: ProseMirrorNode }> = [];

  state.doc.descendants((node, pos) => {
    if (node.type.name !== names.table) return true;

    const normalized = normalizeHtmlTable(node, options);
    if (!node.eq(normalized)) {
      replacements.push({ pos, node, normalized });
    }

    return false;
  });

  if (replacements.length === 0) return undefined;

  let transaction = state.tr;
  for (const replacement of [...replacements].sort((a, b) => b.pos - a.pos)) {
    transaction = transaction.replaceWith(
      replacement.pos,
      replacement.pos + replacement.node.nodeSize,
      replacement.normalized,
    );
  }

  return transaction;
}
