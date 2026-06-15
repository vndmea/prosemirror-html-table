import type { Node as ProseMirrorNode } from 'prosemirror-model';

import type { S1000DEntryRef, S1000DTgroupGrid } from './grid.js';
import type { S1000DTablePositionContext } from './context.js';
import { s1000dTableNodeNames } from './names.js';
import { S1000DTableMap } from './table-map.js';

export function findS1000DTgroupPosition(
  table: ProseMirrorNode,
  tablePos: number,
  tgroupIndex: number,
): number | undefined {
  let found: number | undefined;
  let seenTgroupIndex = -1;

  table.forEach((child, offset) => {
    if (found !== undefined || child.type.name !== s1000dTableNodeNames.tgroup) return;
    seenTgroupIndex += 1;
    if (seenTgroupIndex === tgroupIndex) {
      found = tablePos + 1 + offset;
    }
  });

  return found;
}

export function requireS1000DTgroupPosition(
  table: ProseMirrorNode,
  tablePos: number,
  tgroupIndex: number,
): number {
  const tgroupPos = findS1000DTgroupPosition(table, tablePos, tgroupIndex);
  if (typeof tgroupPos === 'number') {
    return tgroupPos;
  }

  throw new RangeError(`Unable to resolve tgroup position: ${tgroupIndex}`);
}

export function findS1000DTgroupChildIndex(
  table: ProseMirrorNode,
  tgroupIndex: number,
): number | undefined {
  let matched: number | undefined;
  let seen = -1;

  table.forEach((child, _offset, index) => {
    if (matched !== undefined || child.type.name !== s1000dTableNodeNames.tgroup) return;
    seen += 1;
    if (seen === tgroupIndex) {
      matched = index;
    }
  });

  return matched;
}

export function requireS1000DTgroupChildIndex(
  table: ProseMirrorNode,
  tgroupIndex: number,
): number {
  const childIndex = findS1000DTgroupChildIndex(table, tgroupIndex);
  if (typeof childIndex === 'number') {
    return childIndex;
  }

  throw new RangeError(`No tgroup child index found for ${tgroupIndex}`);
}

export function findS1000DEntryByPosition(
  context: S1000DTablePositionContext,
  grid: S1000DTgroupGrid,
  entryPos: number,
): S1000DEntryRef | undefined {
  const tgroupPos = findS1000DTgroupPosition(context.table, context.tablePos, context.activeTgroupIndex);
  if (tgroupPos === undefined) return undefined;

  const tableMap = S1000DTableMap.get(context.table, context.activeTgroupIndex);
  const relativePos = entryPos - tgroupPos;
  const mapIndex = tableMap.map.findIndex((pos) => pos === relativePos);
  if (mapIndex < 0 || tableMap.width < 1) {
    return undefined;
  }

  const rowIndex = Math.floor(mapIndex / tableMap.width);
  const columnIndex = mapIndex % tableMap.width;
  return grid.slots[rowIndex]?.[columnIndex]?.entry;
}

export function findS1000DEntryByDocumentPosition(
  context: S1000DTablePositionContext,
  grid: S1000DTgroupGrid,
  docPos: number,
): S1000DEntryRef | undefined {
  const tableMap = S1000DTableMap.get(context.table, context.activeTgroupIndex);

  for (const entry of tableMap.grid.entries) {
    const absolutePos = findS1000DEntryPosition(context, entry);
    if (absolutePos === undefined) {
      continue;
    }

    if (docPos >= absolutePos && docPos <= absolutePos + entry.node.nodeSize) {
      return grid.entries.find((candidate) => (
        candidate.section === entry.section
        && candidate.rowIndex === entry.rowIndex
        && candidate.rowIndexInSection === entry.rowIndexInSection
        && candidate.columnIndex === entry.columnIndex
        && candidate.entryIndex === entry.entryIndex
      ));
    }
  }

  return undefined;
}

export function findS1000DEntryByNodePosition(
  doc: ProseMirrorNode,
  grid: S1000DTgroupGrid,
  docPos: number,
): S1000DEntryRef | undefined {
  let matchedNode: ProseMirrorNode | undefined;

  doc.nodesBetween(docPos, docPos, (node) => {
    if (node.type.name === s1000dTableNodeNames.entry) {
      matchedNode = node;
      return false;
    }
    return true;
  });

  if (matchedNode) {
    return grid.entries.find((entry) => entry.node === matchedNode);
  }

  return undefined;
}

export function findS1000DEntryPosition(
  context: S1000DTablePositionContext,
  entry: S1000DEntryRef,
): number | undefined {
  const tgroupPos = findS1000DTgroupPosition(context.table, context.tablePos, context.activeTgroupIndex);
  if (tgroupPos === undefined) return undefined;

  const tableMap = S1000DTableMap.get(context.table, context.activeTgroupIndex);
  const matched = tableMap.grid.entries.find((item) => (
    item.section === entry.section
      && item.rowIndex === entry.rowIndex
      && item.rowIndexInSection === entry.rowIndexInSection
      && item.columnIndex === entry.columnIndex
      && item.entryIndex === entry.entryIndex
  ));
  const relativePos = matched ? tableMap.entryPositions.get(matched) : undefined;
  return relativePos === undefined ? undefined : tgroupPos + relativePos;
}

export function findS1000DNodePosition(
  doc: ProseMirrorNode,
  targetNode: ProseMirrorNode,
): number | undefined {
  let found: number | undefined;

  doc.descendants((node, pos) => {
    if (found !== undefined) return false;
    if (node !== targetNode) return true;
    found = pos;
    return false;
  });

  return found;
}

export function findS1000DNodePositions(node: ProseMirrorNode, nodeName: string): number[] {
  const positions: number[] = [];
  node.descendants((descendant, pos) => {
    if (descendant.type.name === nodeName) {
      positions.push(pos);
    }
    return true;
  });
  return positions;
}

export function findFirstS1000DDescendantPosition(
  node: ProseMirrorNode,
  nodeName: string,
  offset: number,
): number | undefined {
  const positions = findS1000DNodePositions(node, nodeName);
  return positions.length > 0 ? offset + 1 + positions[0]! : undefined;
}

export function findFirstS1000DEntryPosition(doc: ProseMirrorNode): number | undefined {
  let found: number | undefined;

  doc.descendants((node, pos) => {
    if (found !== undefined) return false;
    if (node.type.name !== s1000dTableNodeNames.entry) return true;
    found = pos;
    return false;
  });

  return found;
}
