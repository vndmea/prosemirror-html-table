import type { Node as ProseMirrorNode } from 'prosemirror-model';

import { s1000dTableNodeNames } from './names.js';
import {
  isS1000DEntry,
  resolveEntryColSpan,
  resolveEntryColumn,
  resolveEntryRowSpan,
} from './cals/index.js';

export type S1000DTableSectionName = 'thead' | 'tbody' | 'tfoot';

export interface S1000DRowRef {
  tgroupIndex: number;
  section: S1000DTableSectionName;
  rowIndex: number;
  rowIndexInSection: number;
  node: ProseMirrorNode;
}

export interface S1000DEntryRef {
  tgroupIndex: number;
  section: S1000DTableSectionName;
  rowIndex: number;
  rowIndexInSection: number;
  columnIndex: number;
  entryIndex: number;
  rowSpan: number;
  colSpan: number;
  node: ProseMirrorNode;
}

export interface S1000DGridSlot {
  rowIndex: number;
  columnIndex: number;
  entry: S1000DEntryRef;
  isAnchor: boolean;
}

export interface S1000DTgroupGrid {
  tgroup: ProseMirrorNode;
  tgroupIndex: number;
  width: number;
  height: number;
  rows: S1000DRowRef[];
  entries: S1000DEntryRef[];
  slots: Array<Array<S1000DGridSlot | null>>;
}

export interface S1000DTableGrid {
  tgroups: S1000DTgroupGrid[];
}

export function createS1000DTableGrid(table: ProseMirrorNode): S1000DTableGrid {
  const tgroups: S1000DTgroupGrid[] = [];

  table.forEach((child, _offset, index) => {
    if (child.type.name !== s1000dTableNodeNames.tgroup) return;
    tgroups.push(createS1000DTgroupGrid(child, index));
  });

  return { tgroups };
}

export function createS1000DTgroupGrid(tgroup: ProseMirrorNode, tgroupIndex = 0): S1000DTgroupGrid {
  const rows: S1000DRowRef[] = [];
  const entries: S1000DEntryRef[] = [];
  const slots: Array<Array<S1000DGridSlot | null>> = [];
  let width = 0;

  tgroup.forEach((child, _offset, sectionIndex) => {
    const section = getSectionName(child);
    if (!section) return;

    child.forEach((rowNode, _rowOffset, rowIndexInSection) => {
      const rowIndex = rows.length;
      rows.push({
        tgroupIndex,
        section,
        rowIndex,
        rowIndexInSection,
        node: rowNode,
      });
      slots[rowIndex] ??= [];

      let nextFallbackColumn = 0;
      rowNode.forEach((entryNode, _entryOffset, entryIndex) => {
        if (!isS1000DEntry(entryNode)) return;

        while (slots[rowIndex]?.[nextFallbackColumn]) {
          nextFallbackColumn += 1;
        }

        const columnIndex = resolveEntryColumn(entryNode, tgroup, nextFallbackColumn);
        const rowSpan = resolveEntryRowSpan(entryNode);
        const colSpan = resolveEntryColSpan(entryNode, tgroup);
        const entryRef: S1000DEntryRef = {
          tgroupIndex,
          section,
          rowIndex,
          rowIndexInSection,
          columnIndex,
          entryIndex,
          rowSpan,
          colSpan,
          node: entryNode,
        };

        entries.push(entryRef);

        for (let rowOffset = 0; rowOffset < rowSpan; rowOffset += 1) {
          const targetRowIndex = rowIndex + rowOffset;
          slots[targetRowIndex] ??= [];

          for (let columnOffset = 0; columnOffset < colSpan; columnOffset += 1) {
            const targetColumnIndex = columnIndex + columnOffset;
            slots[targetRowIndex]![targetColumnIndex] = {
              rowIndex: targetRowIndex,
              columnIndex: targetColumnIndex,
              entry: entryRef,
              isAnchor: rowOffset === 0 && columnOffset === 0,
            };
          }
        }

        nextFallbackColumn = columnIndex + colSpan;
        width = Math.max(width, nextFallbackColumn);
      });
    });

    void sectionIndex;
  });

  return {
    tgroup,
    tgroupIndex,
    width,
    height: rows.length,
    rows,
    entries,
    slots: slots.slice(0, rows.length).map((row) => normalizeGridRow(row, width)),
  };
}

export function getS1000DEntryAt(
  grid: S1000DTgroupGrid,
  rowIndex: number,
  columnIndex: number,
): S1000DEntryRef | undefined {
  return grid.slots[rowIndex]?.[columnIndex]?.entry;
}

function getSectionName(node: ProseMirrorNode): S1000DTableSectionName | undefined {
  if (node.type.name === s1000dTableNodeNames.thead) return 'thead';
  if (node.type.name === s1000dTableNodeNames.tbody) return 'tbody';
  if (node.type.name === s1000dTableNodeNames.tfoot) return 'tfoot';
  return undefined;
}

function normalizeGridRow(
  row: Array<S1000DGridSlot | null> | undefined,
  width: number,
): Array<S1000DGridSlot | null> {
  return Array.from({ length: width }, (_, index) => row?.[index] ?? null);
}
