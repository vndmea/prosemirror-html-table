import type { Node as ProseMirrorNode } from 'prosemirror-model';

import {
  createS1000DTgroupGrid,
  type S1000DEntryRef,
  type S1000DTgroupGrid,
} from './grid.js';
import { s1000dTableNodeNames } from './names.js';

export interface S1000DTableRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const s1000dTableMapCache = new WeakMap<ProseMirrorNode, Map<number, S1000DTableMap>>();

export class S1000DTableMap {
  public readonly width: number;
  public readonly height: number;
  public readonly map: number[];
  public readonly grid: S1000DTgroupGrid;
  public readonly entryPositions: Map<S1000DEntryRef, number>;

  constructor(
    grid: S1000DTgroupGrid,
    map: number[],
    entryPositions: Map<S1000DEntryRef, number>,
    private readonly rowStartOffsets: number[],
    private readonly rowEndOffsets: number[],
  ) {
    this.width = grid.width;
    this.height = grid.height;
    this.map = map;
    this.grid = grid;
    this.entryPositions = entryPositions;
  }

  static get(table: ProseMirrorNode, tgroupIndex = 0): S1000DTableMap {
    const cached = s1000dTableMapCache.get(table)?.get(tgroupIndex);
    if (cached) return cached;

    const tgroup = findTgroupByIndex(table, tgroupIndex);
    if (!tgroup) {
      throw new RangeError(`No tgroup at index ${tgroupIndex} found`);
    }

    const map = createS1000DTableMap(tgroup, tgroupIndex);
    const cacheEntry = s1000dTableMapCache.get(table) ?? new Map<number, S1000DTableMap>();
    cacheEntry.set(tgroupIndex, map);
    s1000dTableMapCache.set(table, cacheEntry);
    return map;
  }

  findCell(pos: number): S1000DTableRect {
    if (pos < 0) {
      throw new RangeError(`No entry with offset ${pos} found`);
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

      return { left, top, right, bottom };
    }

    throw new RangeError(`No entry with offset ${pos} found`);
  }

  colCount(pos: number): number {
    if (pos < 0) {
      throw new RangeError(`No entry with offset ${pos} found`);
    }

    for (let index = 0; index < this.map.length; index += 1) {
      if (this.map[index] === pos) {
        return index % this.width;
      }
    }

    throw new RangeError(`No entry with offset ${pos} found`);
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

  rectBetween(a: number, b: number): S1000DTableRect {
    const rectA = this.findCell(a);
    const rectB = this.findCell(b);
    return {
      left: Math.min(rectA.left, rectB.left),
      top: Math.min(rectA.top, rectB.top),
      right: Math.max(rectA.right, rectB.right),
      bottom: Math.max(rectA.bottom, rectB.bottom),
    };
  }

  cellsInRect(rect: S1000DTableRect): number[] {
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

export function createS1000DTableMap(tgroup: ProseMirrorNode, tgroupIndex: number): S1000DTableMap {
  const grid = createS1000DTgroupGrid(tgroup, tgroupIndex);
  const entryPositions = new Map<S1000DEntryRef, number>();
  const rowStartOffsets = Array.from({ length: grid.height }, () => -1);
  const rowEndOffsets = Array.from({ length: grid.height }, () => -1);
  const entryRefsByKey = new Map<string, S1000DEntryRef>();

  for (const entry of grid.entries) {
    entryRefsByKey.set(createEntryKey(entry.rowIndexInSection, entry.entryIndex, entry.section), entry);
  }

  let rowIndex = 0;
  tgroup.forEach((sectionNode, sectionOffset) => {
    const section = getSectionName(sectionNode.type.name);
    if (!section) return;

    sectionNode.forEach((rowNode, rowOffset, rowIndexInSection) => {
      const rowStart = 1 + sectionOffset + 1 + rowOffset;
      rowStartOffsets[rowIndex] = rowStart;
      rowEndOffsets[rowIndex] = rowStart + rowNode.nodeSize;

      rowNode.forEach((entryNode, entryOffset, entryIndex) => {
        const entryRef = entryRefsByKey.get(createEntryKey(rowIndexInSection, entryIndex, section));
        if (!entryRef || entryRef.node !== entryNode || entryRef.rowIndex !== rowIndex) return;
        entryPositions.set(entryRef, rowStart + 1 + entryOffset);
      });

      rowIndex += 1;
    });
  });

  const map = Array.from({ length: grid.width * grid.height }, (_, index) => {
    const row = Math.floor(index / grid.width);
    const column = index % grid.width;
    const entry = grid.slots[row]?.[column]?.entry;
    if (!entry) return -1;
    return entryPositions.get(entry) ?? -1;
  });

  return new S1000DTableMap(grid, map, entryPositions, rowStartOffsets, rowEndOffsets);
}

function findTgroupByIndex(table: ProseMirrorNode, tgroupIndex: number): ProseMirrorNode | undefined {
  let matched: ProseMirrorNode | undefined;
  let seenTgroupIndex = -1;
  table.forEach((child) => {
    if (matched || child.type.name !== s1000dTableNodeNames.tgroup) return;
    seenTgroupIndex += 1;
    if (seenTgroupIndex === tgroupIndex) {
      matched = child;
    }
  });
  return matched;
}

function getSectionName(typeName: string): 'thead' | 'tbody' | 'tfoot' | undefined {
  if (typeName === s1000dTableNodeNames.thead) return 'thead';
  if (typeName === s1000dTableNodeNames.tbody) return 'tbody';
  if (typeName === s1000dTableNodeNames.tfoot) return 'tfoot';
  return undefined;
}

function createEntryKey(
  rowIndexInSection: number,
  entryIndex: number,
  section: 'thead' | 'tbody' | 'tfoot',
): string {
  return `${section}:${rowIndexInSection}:${entryIndex}`;
}
