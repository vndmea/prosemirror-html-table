import { Fragment, type Node as ProseMirrorNode } from 'prosemirror-model';

import { resolveColspecs } from './cals/index.js';
import { s1000dTableNodeNames } from './names.js';

export function applyS1000DColumnWidthsToTgroup(
  tgroup: ProseMirrorNode,
  widths: readonly number[],
): ProseMirrorNode {
  const children: ProseMirrorNode[] = [];
  tgroup.forEach((child) => children.push(child));

  const colspecType = tgroup.type.schema.nodes[s1000dTableNodeNames.colspec];
  if (!colspecType) {
    throw new Error(`Missing node type in schema: ${s1000dTableNodeNames.colspec}`);
  }

  const resolvedColspecs = resolveColspecs(tgroup);
  const preservedChildren = children.filter((child) => child.type.name !== s1000dTableNodeNames.colspec);
  const targetCount = Math.max(
    1,
    widths.length,
    resolvedColspecs.reduce((max, colspec) => Math.max(max, colspec.index + 1), 0),
    Number.parseInt(String(tgroup.attrs.cols ?? '0'), 10) || 0,
  );
  const nextColspecs = Array.from({ length: targetCount }, (_value, index) => {
    const existing = resolvedColspecs.find((colspec) => colspec.index === index)?.node;
    const width = formatS1000DColumnWidth(widths[index]);

    if (existing) {
      return existing.type.create(
        {
          ...existing.attrs,
          colwidth: width ?? existing.attrs.colwidth ?? null,
        },
        existing.content,
        existing.marks,
      );
    }

    return colspecType.create({
      colname: `c${index + 1}`,
      colwidth: width,
    });
  });

  return tgroup.type.create(
    {
      ...tgroup.attrs,
      cols: String(targetCount),
    },
    Fragment.fromArray([...nextColspecs, ...preservedChildren]),
    tgroup.marks,
  );
}

export function distributeS1000DColumnWidths(
  targetWidth: number,
  columnCount: number,
  minColumnWidth = 48,
  currentWidths?: readonly number[],
): number[] {
  if (!Number.isFinite(targetWidth) || targetWidth <= 0 || columnCount <= 0) {
    return [];
  }

  const normalizedMin = Math.max(1, Math.round(minColumnWidth));
  const roundedTarget = Math.max(normalizedMin * columnCount, Math.round(targetWidth));
  if (!currentWidths || currentWidths.length !== columnCount) {
    return distributeEvenly(roundedTarget, columnCount, normalizedMin);
  }

  const normalizedCurrent = currentWidths.map((width) => Math.max(normalizedMin, Math.round(width)));
  const currentTotal = normalizedCurrent.reduce((sum, width) => sum + width, 0);
  if (currentTotal <= 0) {
    return distributeEvenly(roundedTarget, columnCount, normalizedMin);
  }

  const scaled = normalizedCurrent.map((width) => Math.max(normalizedMin, Math.floor((width / currentTotal) * roundedTarget)));
  let remainder = roundedTarget - scaled.reduce((sum, width) => sum + width, 0);
  let index = 0;

  while (remainder > 0) {
    scaled[index % scaled.length] = (scaled[index % scaled.length] ?? normalizedMin) + 1;
    remainder -= 1;
    index += 1;
  }

  return scaled;
}

function distributeEvenly(targetWidth: number, columnCount: number, minColumnWidth: number): number[] {
  const baseWidth = Math.max(minColumnWidth, Math.floor(targetWidth / columnCount));
  const widths = Array.from({ length: columnCount }, () => baseWidth);
  let remainder = targetWidth - (baseWidth * columnCount);
  let index = 0;

  while (remainder > 0) {
    widths[index % widths.length] = (widths[index % widths.length] ?? baseWidth) + 1;
    remainder -= 1;
    index += 1;
  }

  return widths;
}

function formatS1000DColumnWidth(width: number | undefined): string | null {
  if (!Number.isFinite(width) || width == null || width <= 0) {
    return null;
  }

  return `${Math.round(width)}px`;
}
