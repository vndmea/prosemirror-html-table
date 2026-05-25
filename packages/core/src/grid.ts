import type { Node as ProseMirrorNode } from 'prosemirror-model';

import { htmlTableNodeNames } from './names.js';
import type { HtmlTableNodeNames } from './types.js';

export type HtmlTableSectionName = 'head' | 'body' | 'foot';

export interface HtmlTableGridOptions {
  names?: Partial<HtmlTableNodeNames>;
}

export interface HtmlTableRowRef {
  section: HtmlTableSectionName;
  sectionIndex: number;
  rowIndex: number;
  rowIndexInSection: number;
  node: ProseMirrorNode;
}

export interface HtmlTableCellRef {
  section: HtmlTableSectionName;
  sectionIndex: number;
  rowIndex: number;
  rowIndexInSection: number;
  columnIndex: number;
  cellIndex: number;
  rowSpan: number;
  colSpan: number;
  node: ProseMirrorNode;
}

export interface HtmlTableGridSlot {
  rowIndex: number;
  columnIndex: number;
  cell: HtmlTableCellRef;
  isAnchor: boolean;
}

export interface HtmlTableGrid {
  width: number;
  height: number;
  rows: HtmlTableRowRef[];
  cells: HtmlTableCellRef[];
  slots: Array<Array<HtmlTableGridSlot | null>>;
}

export function createHtmlTableGrid(table: ProseMirrorNode, options: HtmlTableGridOptions = {}): HtmlTableGrid {
  const names: HtmlTableNodeNames = {
    ...htmlTableNodeNames,
    ...options.names,
  };

  const rows: HtmlTableRowRef[] = [];
  const cells: HtmlTableCellRef[] = [];
  const slots: Array<Array<HtmlTableGridSlot | null>> = [];
  let width = 0;
  let sectionCounters: Record<HtmlTableSectionName, number> = {
    head: 0,
    body: 0,
    foot: 0,
  };

  table.forEach((sectionNode) => {
    const section = getSectionName(sectionNode, names);
    if (!section) return;

    const sectionIndex = sectionCounters[section];
    sectionCounters = {
      ...sectionCounters,
      [section]: sectionIndex + 1,
    };

    sectionNode.forEach((rowNode, _offset, rowIndexInSection) => {
      const rowIndex = rows.length;
      const rowRef: HtmlTableRowRef = {
        section,
        sectionIndex,
        rowIndex,
        rowIndexInSection,
        node: rowNode,
      };

      rows.push(rowRef);
      slots[rowIndex] ??= [];

      let columnIndex = firstAvailableColumn(slots[rowIndex]!);

      rowNode.forEach((cellNode, _cellOffset, cellIndex) => {
        while (slots[rowIndex]?.[columnIndex]) {
          columnIndex += 1;
        }

        const rowSpan = getPositiveIntegerAttr(cellNode, 'rowspan', 1);
        const colSpan = getPositiveIntegerAttr(cellNode, 'colspan', 1);
        const cellRef: HtmlTableCellRef = {
          section,
          sectionIndex,
          rowIndex,
          rowIndexInSection,
          columnIndex,
          cellIndex,
          rowSpan,
          colSpan,
          node: cellNode,
        };

        cells.push(cellRef);

        for (let rowOffset = 0; rowOffset < rowSpan; rowOffset += 1) {
          const targetRowIndex = rowIndex + rowOffset;
          slots[targetRowIndex] ??= [];

          for (let columnOffset = 0; columnOffset < colSpan; columnOffset += 1) {
            const targetColumnIndex = columnIndex + columnOffset;
            slots[targetRowIndex]![targetColumnIndex] = {
              rowIndex: targetRowIndex,
              columnIndex: targetColumnIndex,
              cell: cellRef,
              isAnchor: rowOffset === 0 && columnOffset === 0,
            };
          }
        }

        columnIndex += colSpan;
        width = Math.max(width, columnIndex);
      });
    });
  });

  return {
    width,
    height: rows.length,
    rows,
    cells,
    slots: slots.slice(0, rows.length).map((row) => normalizeGridRow(row, width)),
  };
}

export function getCellAt(grid: HtmlTableGrid, rowIndex: number, columnIndex: number): HtmlTableCellRef | undefined {
  return grid.slots[rowIndex]?.[columnIndex]?.cell;
}

export function isCellAnchor(grid: HtmlTableGrid, rowIndex: number, columnIndex: number): boolean {
  return grid.slots[rowIndex]?.[columnIndex]?.isAnchor === true;
}

function getSectionName(
  node: ProseMirrorNode,
  names: HtmlTableNodeNames,
): HtmlTableSectionName | undefined {
  if (node.type.name === names.head) return 'head';
  if (node.type.name === names.body) return 'body';
  if (node.type.name === names.foot) return 'foot';
  return undefined;
}

function firstAvailableColumn(row: Array<HtmlTableGridSlot | null>): number {
  let columnIndex = 0;

  while (row[columnIndex]) {
    columnIndex += 1;
  }

  return columnIndex;
}

function getPositiveIntegerAttr(node: ProseMirrorNode, name: string, fallback: number): number {
  const value = Number(node.attrs[name] ?? fallback);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function normalizeGridRow(
  row: Array<HtmlTableGridSlot | null> | undefined,
  width: number,
): Array<HtmlTableGridSlot | null> {
  return Array.from({ length: width }, (_, index) => row?.[index] ?? null);
}
