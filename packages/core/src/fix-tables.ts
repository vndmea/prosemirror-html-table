import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorState, Transaction } from 'prosemirror-state';

import { htmlTableNodeNames } from './names.js';
import { normalizeHtmlTable, type NormalizeHtmlTableOptions } from './normalize.js';
import type { HtmlTableNodeNames } from './types.js';

interface ChangedRange {
  from: number;
  to: number;
}

export interface FixTablesTransactionOptions extends NormalizeHtmlTableOptions {
  transactions?: readonly Transaction[];
}

export function createFixTablesTransaction(
  state: EditorState,
  oldState?: EditorState,
  options: FixTablesTransactionOptions = {},
): Transaction | undefined {
  const { transactions, ...normalizeOptions } = options;
  const names: HtmlTableNodeNames = {
    ...htmlTableNodeNames,
    ...normalizeOptions.names,
  };
  const changedRanges = oldState ? findChangedRanges(oldState.doc, state.doc, transactions) : undefined;
  if (oldState && !changedRanges) return undefined;

  const replacements: Array<{ pos: number; node: ProseMirrorNode; normalized: ProseMirrorNode }> = [];

  state.doc.descendants((node, pos) => {
    if (node.type.name !== names.table) return true;
    if (changedRanges && !changedRanges.some((range) => rangesOverlap(pos, pos + node.nodeSize, range.from, range.to))) {
      return false;
    }

    const normalized = normalizeHtmlTable(node, normalizeOptions);
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

function findChangedRanges(
  oldDoc: ProseMirrorNode,
  newDoc: ProseMirrorNode,
  transactions?: readonly Transaction[],
): ChangedRange[] | undefined {
  const transactionRanges = transactions ? getTransactionChangedRanges(transactions) : [];
  if (transactionRanges.length > 0) return transactionRanges;

  const from = oldDoc.content.findDiffStart(newDoc.content);
  if (from == null) return undefined;

  const end = oldDoc.content.findDiffEnd(newDoc.content);
  if (!end) return [{ from, to: from }];

  return [{
    from,
    to: Math.max(from, end.b),
  }];
}

function getTransactionChangedRanges(transactions: readonly Transaction[]): ChangedRange[] {
  const maps = transactions.flatMap((transaction) => transaction.mapping.maps);
  const ranges: ChangedRange[] = [];

  for (let mapIndex = 0; mapIndex < maps.length; mapIndex += 1) {
    const map = maps[mapIndex];
    if (!map) continue;

    map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      ranges.push(mapRangeToFinalDocument(newStart, newEnd, maps, mapIndex + 1));
    });
  }

  return mergeChangedRanges(ranges);
}

function mapRangeToFinalDocument(
  from: number,
  to: number,
  maps: readonly NonNullable<Transaction['mapping']['maps'][number]>[],
  startIndex: number,
): ChangedRange {
  let mappedFrom = from;
  let mappedTo = to;

  for (let index = startIndex; index < maps.length; index += 1) {
    const map = maps[index];
    if (!map) continue;

    mappedFrom = map.map(mappedFrom, -1);
    mappedTo = map.map(mappedTo, 1);
  }

  return {
    from: Math.min(mappedFrom, mappedTo),
    to: Math.max(mappedFrom, mappedTo),
  };
}

function mergeChangedRanges(ranges: ChangedRange[]): ChangedRange[] {
  const sortedRanges = ranges
    .filter((range) => range.from <= range.to)
    .sort((left, right) => left.from - right.from || left.to - right.to);
  const mergedRanges: ChangedRange[] = [];

  for (const range of sortedRanges) {
    const previous = mergedRanges[mergedRanges.length - 1];
    if (!previous || previous.to < range.from) {
      mergedRanges.push({ ...range });
      continue;
    }

    previous.to = Math.max(previous.to, range.to);
  }

  return mergedRanges;
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
