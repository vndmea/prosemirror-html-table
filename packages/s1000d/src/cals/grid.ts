import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { s1000dTableNodeNames } from '../names.js';
import { findColspecIndex, parsePositiveInteger, resolveColspecs } from './colspec.js';
import { resolveNamedSpan, resolveSpanspecs } from './spanspec.js';

export function resolveEntryRowSpan(entry: ProseMirrorNode): number {
  const morerows = Number(entry.attrs.morerows ?? 0);
  return Number.isInteger(morerows) && morerows >= 0 ? morerows + 1 : 1;
}

export function resolveEntryColSpan(entry: ProseMirrorNode, tgroup: ProseMirrorNode): number {
  const colspecs = resolveColspecs(tgroup);
  const { spanspecs } = resolveSpanspecs(tgroup);
  const namedSpan = resolveNamedSpan(entry, colspecs, spanspecs);
  return namedSpan ? namedSpan.to - namedSpan.from + 1 : 1;
}

export function resolveEntryColumn(
  entry: ProseMirrorNode,
  tgroup: ProseMirrorNode,
  fallbackColumn = 0,
): number {
  const colspecs = resolveColspecs(tgroup);
  const directColname = findColspecIndex(colspecs, entry.attrs.colname);
  if (directColname !== undefined) return directColname;

  const { spanspecs } = resolveSpanspecs(tgroup);
  const namedSpan = resolveNamedSpan(entry, colspecs, spanspecs);
  return namedSpan?.from ?? fallbackColumn;
}

export function resolveTgroupColumnCount(tgroup: ProseMirrorNode): number {
  return parsePositiveInteger(tgroup.attrs.cols, 0);
}

export function isS1000DEntry(node: ProseMirrorNode): boolean {
  return node.type.name === s1000dTableNodeNames.entry;
}
