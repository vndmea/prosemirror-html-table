import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorState, Transaction } from 'prosemirror-state';

import { htmlTableNodeNames } from './names.js';
import { normalizeHtmlTable, type NormalizeHtmlTableOptions } from './normalize.js';
import type { HtmlTableNodeNames } from './types.js';

export type FixTablesTransactionOptions = NormalizeHtmlTableOptions;

export function createFixTablesTransaction(
  state: EditorState,
  oldState?: EditorState,
  options: FixTablesTransactionOptions = {},
): Transaction | undefined {
  const names: HtmlTableNodeNames = {
    ...htmlTableNodeNames,
    ...options.names,
  };
  const changedRange = oldState ? findChangedRange(oldState.doc, state.doc) : undefined;
  if (oldState && !changedRange) return undefined;

  const replacements: Array<{ pos: number; node: ProseMirrorNode; normalized: ProseMirrorNode }> = [];

  state.doc.descendants((node, pos) => {
    if (node.type.name !== names.table) return true;
    if (changedRange && !rangesOverlap(pos, pos + node.nodeSize, changedRange.from, changedRange.to)) {
      return false;
    }

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

function findChangedRange(
  oldDoc: ProseMirrorNode,
  newDoc: ProseMirrorNode,
): { from: number; to: number } | undefined {
  const from = oldDoc.content.findDiffStart(newDoc.content);
  if (from == null) return undefined;

  const end = oldDoc.content.findDiffEnd(newDoc.content);
  if (!end) return { from, to: from };

  return {
    from,
    to: Math.max(from, end.b),
  };
}

function rangesOverlap(
  leftFrom: number,
  leftTo: number,
  rightFrom: number,
  rightTo: number,
): boolean {
  if (rightFrom === rightTo) {
    return leftFrom <= rightFrom && rightFrom <= leftTo;
  }

  return leftFrom < rightTo && rightFrom < leftTo;
}
