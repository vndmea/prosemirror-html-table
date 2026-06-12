import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { s1000dTableNodeNames } from '../names.js';

export interface ResolvedColspec {
  index: number;
  colname: string;
  colnum: number;
  colwidth: string | null;
  node: ProseMirrorNode;
}

export function resolveColspecs(tgroup: ProseMirrorNode): ResolvedColspec[] {
  const colspecs: ResolvedColspec[] = [];
  let nextIndex = 0;

  tgroup.forEach((child) => {
    if (child.type.name !== s1000dTableNodeNames.colspec) return;

    const colnum = parsePositiveInteger(child.attrs.colnum, nextIndex + 1);
    const index = colnum - 1;
    const colname = typeof child.attrs.colname === 'string' && child.attrs.colname
      ? child.attrs.colname
      : `col${colnum}`;

    colspecs.push({
      index,
      colname,
      colnum,
      colwidth: typeof child.attrs.colwidth === 'string' ? child.attrs.colwidth : null,
      node: child,
    });
    nextIndex = Math.max(nextIndex + 1, colnum);
  });

  return colspecs;
}

export function findColspecIndex(colspecs: readonly ResolvedColspec[], colname: unknown): number | undefined {
  if (typeof colname !== 'string') return undefined;
  return colspecs.find((colspec) => colspec.colname === colname)?.index;
}

export function parsePositiveInteger(value: unknown, fallback: number): number {
  const numberValue = Number(value);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : fallback;
}
