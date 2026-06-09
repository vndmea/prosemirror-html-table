import type { Node as ProseMirrorNode } from 'prosemirror-model';

import { createHtmlTableGrid, type HtmlTableCellRef, type HtmlTableGrid, type HtmlTableGridOptions } from './grid.js';
import { htmlTableNodeNames } from './names.js';
import type { HtmlTableNodeNames } from './types.js';

export interface HtmlTableRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export type HtmlTableMapOptions = HtmlTableGridOptions;

const htmlTableMapCache = new WeakMap<ProseMirrorNode, Map<string, HtmlTableMap>>();

export class HtmlTableMap {
  public readonly width: number;
  public readonly height: number;
  public readonly map: number[];
  public readonly grid: HtmlTableGrid;
  public readonly cellPositions: Map<HtmlTableCellRef, number>;

  constructor(
    grid: HtmlTableGrid,
    map: number[],
    cellPositions: Map<HtmlTableCellRef, number>,
    private readonly rowStartOffsets: number[],
    private readonly rowEndOffsets: number[],
  ) {
    this.width = grid.width;
    this.height = grid.height;
    this.map = map;
    this.grid = grid;
    this.cellPositions = cellPositions;
  }

  static get(table: ProseMirrorNode, options: HtmlTableMapOptions = {}): HtmlTableMap {
    const names = resolveNodeNames(options.names);
    const cacheKey = createNamesCacheKey(names);
    const cached = htmlTableMapCache.get(table)?.get(cacheKey);
    if (cached) return cached;

    const htmlTableMap = createHtmlTableMap(table, options, names);
    const cacheEntry = htmlTableMapCache.get(table) ?? new Map<string, HtmlTableMap>();
    cacheEntry.set(cacheKey, htmlTableMap);
    htmlTableMapCache.set(table, cacheEntry);
    return htmlTableMap;
  }

  findCell(pos: number): HtmlTableRect {
    if (pos < 0) {
      throw new RangeError(`No cell with offset ${pos} found`);
    }

    for (let index = 0; index < this.map.length; index += 1) {
      const currentPos = this.map[index];
      if (currentPos !== pos) continue;

      const left = index % this.width;
      const top = Math.floor(index / this.width);
      let right = left + 1;
      let bottom = top + 1;

      for (let offset = 1; right < this.width && this.map[index + offset] === currentPos; offset += 1) {
        right += 1;
      }

      for (
        let offset = 1;
        bottom < this.height && this.map[index + (this.width * offset)] === currentPos;
        offset += 1
      ) {
        bottom += 1;
      }

      return {
        left,
        top,
        right,
        bottom,
      };
    }

    throw new RangeError(`No cell with offset ${pos} found`);
  }

  colCount(pos: number): number {
    if (pos < 0) {
      throw new RangeError(`No cell with offset ${pos} found`);
    }

    for (let index = 0; index < this.map.length; index += 1) {
      if (this.map[index] === pos) {
        return index % this.width;
      }
    }

    throw new RangeError(`No cell with offset ${pos} found`);
  }

  nextCell(pos: number, axis: 'horiz' | 'vert', dir: number): number | null {
    const { left, right, top, bottom } = this.findCell(pos);

    if (axis === 'horiz') {
      if (dir < 0 ? left === 0 : right === this.width) return null;

      const next = this.map[(top * this.width) + (dir < 0 ? left - 1 : right)];
      return next !== undefined && next >= 0 ? next : null;
    }

    if (dir < 0 ? top === 0 : bottom === this.height) return null;

    const next = this.map[left + (this.width * (dir < 0 ? top - 1 : bottom))];
    return next !== undefined && next >= 0 ? next : null;
  }

  rectBetween(a: number, b: number): HtmlTableRect {
    const { left: leftA, right: rightA, top: topA, bottom: bottomA } = this.findCell(a);
    const { left: leftB, right: rightB, top: topB, bottom: bottomB } = this.findCell(b);

    return {
      left: Math.min(leftA, leftB),
      top: Math.min(topA, topB),
      right: Math.max(rightA, rightB),
      bottom: Math.max(bottomA, bottomB),
    };
  }

  cellsInRect(rect: HtmlTableRect): number[] {
    const result: number[] = [];
    const seen = new Set<number>();

    for (let row = rect.top; row < rect.bottom; row += 1) {
      for (let col = rect.left; col < rect.right; col += 1) {
        const index = (row * this.width) + col;
        const pos = this.map[index];

        if (pos === undefined || pos < 0 || seen.has(pos)) continue;
        seen.add(pos);

        if (
          ((col === rect.left) && col > 0 && this.map[index - 1] === pos)
          || ((row === rect.top) && row > 0 && this.map[index - this.width] === pos)
        ) {
          continue;
        }

        result.push(pos);
      }
    }

    return result;
  }

  positionAt(row: number, col: number, table: ProseMirrorNode): number {
    void table;

    const rowStart = this.rowStartOffsets[row];
    const rowEnd = this.rowEndOffsets[row];

    if (rowStart === undefined || rowEnd === undefined) {
      throw new RangeError(`No row at index ${row} found`);
    }

    let index = col + (row * this.width);
    const rowEndIndex = (row + 1) * this.width;

    while (index < rowEndIndex && (this.map[index] ?? -1) < rowStart) {
      index += 1;
    }

    return index === rowEndIndex ? rowEnd - 1 : (this.map[index] ?? (rowEnd - 1));
  }
}

function createHtmlTableMap(
  table: ProseMirrorNode,
  options: HtmlTableMapOptions,
  names: HtmlTableNodeNames,
): HtmlTableMap {
  const grid = createHtmlTableGrid(table, options);
  const cellPositions = new Map<HtmlTableCellRef, number>();
  const rowStartOffsets = Array.from({ length: grid.height }, () => -1);
  const rowEndOffsets = Array.from({ length: grid.height }, () => -1);
  const cellRefsByKey = new Map<string, HtmlTableCellRef>();
  const sectionCounters = {
    head: 0,
    body: 0,
    foot: 0,
  };

  for (const cell of grid.cells) {
    cellRefsByKey.set(createCellKey(cell.section, cell.sectionIndex, cell.rowIndexInSection, cell.cellIndex), cell);
  }

  let rowIndex = 0;
  table.forEach((sectionNode, sectionOffset) => {
    const section = getSectionName(sectionNode.type.name, names);
    if (!section) return;

    const sectionIndex = sectionCounters[section];
    sectionCounters[section] += 1;

    sectionNode.forEach((rowNode, rowOffset, rowIndexInSection) => {
      const rowStart = 1 + sectionOffset + 1 + rowOffset;
      rowStartOffsets[rowIndex] = rowStart;
      rowEndOffsets[rowIndex] = rowStart + rowNode.nodeSize;

      rowNode.forEach((cellNode, cellOffset, cellIndex) => {
        const cell = cellRefsByKey.get(createCellKey(section, sectionIndex, rowIndexInSection, cellIndex));

        if (!cell || cell.node !== cellNode || cell.rowIndex !== rowIndex) return;

        cellPositions.set(cell, rowStart + 1 + cellOffset);
      });

      rowIndex += 1;
    });
  });

  const map = Array.from({ length: grid.width * grid.height }, (_, index) => {
    const row = Math.floor(index / grid.width);
    const column = index % grid.width;
    const cell = grid.slots[row]?.[column]?.cell;
    if (!cell) return -1;

    return cellPositions.get(cell) ?? -1;
  });

  return new HtmlTableMap(grid, map, cellPositions, rowStartOffsets, rowEndOffsets);
}

function resolveNodeNames(names?: Partial<HtmlTableNodeNames>): HtmlTableNodeNames {
  return {
    ...htmlTableNodeNames,
    ...names,
  };
}

function createNamesCacheKey(names: HtmlTableNodeNames): string {
  return [
    names.table,
    names.caption,
    names.colgroup,
    names.col,
    names.head,
    names.body,
    names.foot,
    names.row,
    names.headerCell,
    names.cell,
  ].join('|');
}

function getSectionName(
  typeName: string,
  names: HtmlTableNodeNames,
): 'head' | 'body' | 'foot' | undefined {
  if (typeName === names.head) return 'head';
  if (typeName === names.body) return 'body';
  if (typeName === names.foot) return 'foot';
  return undefined;
}

function createCellKey(
  section: 'head' | 'body' | 'foot',
  sectionIndex: number,
  rowIndexInSection: number,
  cellIndex: number,
): string {
  return `${section}:${sectionIndex}:${rowIndexInSection}:${cellIndex}`;
}
