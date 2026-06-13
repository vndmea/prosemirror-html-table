import type { Node as ProseMirrorNode, ResolvedPos } from 'prosemirror-model';
import { Selection, TextSelection, type SelectionBookmark } from 'prosemirror-state';
import type { Mappable } from 'prosemirror-transform';

import { s1000dTableNodeNames } from './names.js';
import { S1000DTableMap } from './table-map.js';

export interface S1000DCellSelectionJSON {
  type?: string;
  anchor?: number;
  head?: number;
  anchorEntryPos?: number;
  headEntryPos?: number;
}

export class S1000DCellSelection extends Selection {
  constructor(
    $anchorEntry: ReturnType<ProseMirrorNode['resolve']>,
    $headEntry: ReturnType<ProseMirrorNode['resolve']>,
    readonly anchorEntryPos: number,
    readonly headEntryPos: number,
  ) {
    super($anchorEntry, $headEntry);
  }

  static create(doc: ProseMirrorNode, anchorEntryPos: number, headEntryPos = anchorEntryPos): S1000DCellSelection {
    return new S1000DCellSelection(
      doc.resolve(anchorEntryPos + 1),
      doc.resolve(headEntryPos + 1),
      anchorEntryPos,
      headEntryPos,
    );
  }

  static fromJSON(doc: ProseMirrorNode, json: S1000DCellSelectionJSON): S1000DCellSelection {
    const anchorEntryPos = json.anchor ?? json.anchorEntryPos;
    const headEntryPos = json.head ?? json.headEntryPos ?? anchorEntryPos;
    if (typeof anchorEntryPos !== 'number' || typeof headEntryPos !== 'number') {
      throw new RangeError('Invalid S1000DCellSelection JSON');
    }

    return S1000DCellSelection.create(doc, anchorEntryPos, headEntryPos);
  }

  map(doc: ProseMirrorNode, mapping: Mappable): Selection {
    const anchorEntryPos = mapping.map(this.anchorEntryPos);
    const headEntryPos = mapping.map(this.headEntryPos);

    if (!isValidEntryPosition(doc, anchorEntryPos) || !isValidEntryPosition(doc, headEntryPos)) {
      const fallbackPos = clampSelectionPos(doc, Math.min(anchorEntryPos, headEntryPos));
      return TextSelection.near(doc.resolve(fallbackPos));
    }

    return S1000DCellSelection.create(doc, anchorEntryPos, headEntryPos);
  }

  isColSelection(): boolean {
    const context = findTgroupContext(this.$anchor);
    if (!context) return false;

    const map = S1000DTableMap.get(context.table, context.tgroupIndex);
    const anchorRect = map.findCell(this.anchorEntryPos - context.tgroupPos);
    const headRect = map.findCell(this.headEntryPos - context.tgroupPos);

    if (Math.min(anchorRect.top, headRect.top) > 0) return false;
    return Math.max(anchorRect.bottom, headRect.bottom) === map.height;
  }

  static colSelection($anchorEntry: ResolvedPos, $headEntry: ResolvedPos = $anchorEntry): S1000DCellSelection {
    return createAxisSelection($anchorEntry, $headEntry, 'column');
  }

  isRowSelection(): boolean {
    const context = findTgroupContext(this.$anchor);
    if (!context) return false;

    const map = S1000DTableMap.get(context.table, context.tgroupIndex);
    const anchorRect = map.findCell(this.anchorEntryPos - context.tgroupPos);
    const headRect = map.findCell(this.headEntryPos - context.tgroupPos);

    if (Math.min(anchorRect.left, headRect.left) > 0) return false;
    return Math.max(anchorRect.right, headRect.right) === map.width;
  }

  static rowSelection($anchorEntry: ResolvedPos, $headEntry: ResolvedPos = $anchorEntry): S1000DCellSelection {
    return createAxisSelection($anchorEntry, $headEntry, 'row');
  }

  eq(selection: Selection): boolean {
    return selection instanceof S1000DCellSelection
      && selection.anchorEntryPos === this.anchorEntryPos
      && selection.headEntryPos === this.headEntryPos;
  }

  toJSON(): S1000DCellSelectionJSON & {
    type: string;
    anchor: number;
    head: number;
    anchorEntryPos: number;
    headEntryPos: number;
  } {
    return {
      type: 's1000d-table-cell',
      anchor: this.anchorEntryPos,
      head: this.headEntryPos,
      anchorEntryPos: this.anchorEntryPos,
      headEntryPos: this.headEntryPos,
    };
  }

  getBookmark(): SelectionBookmark {
    return new S1000DCellBookmark(this.anchorEntryPos, this.headEntryPos);
  }
}

export function isS1000DCellSelection(selection: Selection): selection is S1000DCellSelection {
  return selection instanceof S1000DCellSelection;
}

class S1000DCellBookmark implements SelectionBookmark {
  constructor(
    readonly anchorEntryPos: number,
    readonly headEntryPos: number,
  ) {}

  map(mapping: Mappable): S1000DCellBookmark {
    return new S1000DCellBookmark(mapping.map(this.anchorEntryPos), mapping.map(this.headEntryPos));
  }

  resolve(doc: ProseMirrorNode): Selection {
    if (!isValidEntryPosition(doc, this.anchorEntryPos) || !isValidEntryPosition(doc, this.headEntryPos)) {
      const fallbackPos = clampSelectionPos(doc, Math.min(this.anchorEntryPos, this.headEntryPos));
      return TextSelection.near(doc.resolve(fallbackPos));
    }

    return S1000DCellSelection.create(doc, this.anchorEntryPos, this.headEntryPos);
  }
}

Selection.jsonID('s1000d-table-cell', S1000DCellSelection);
S1000DCellSelection.prototype.visible = false;

function createAxisSelection(
  $anchorEntry: ResolvedPos,
  $headEntry: ResolvedPos,
  axis: 'row' | 'column',
): S1000DCellSelection {
  const anchorEntryPos = resolveEntryPos($anchorEntry);
  const headEntryPos = resolveEntryPos($headEntry);
  const anchorContext = findTgroupContext($anchorEntry);
  const headContext = findTgroupContext($headEntry);

  if (
    anchorEntryPos == null
    || headEntryPos == null
    || !anchorContext
    || !headContext
    || anchorContext.tgroupPos !== headContext.tgroupPos
  ) {
    throw new RangeError('S1000DCellSelection row/column helpers require positions inside the same tgroup entry.');
  }

  const map = S1000DTableMap.get(anchorContext.table, anchorContext.tgroupIndex);
  const anchorRect = map.findCell(anchorEntryPos - anchorContext.tgroupPos);
  const headRect = map.findCell(headEntryPos - anchorContext.tgroupPos);
  let nextAnchorEntryPos = anchorEntryPos;
  let nextHeadEntryPos = headEntryPos;

  if (axis === 'column') {
    if (anchorRect.top <= headRect.top) {
      if (anchorRect.top > 0) {
        nextAnchorEntryPos = resolveMapEntryPos(map, anchorContext.tgroupPos, anchorRect.left, nextAnchorEntryPos);
      }
      if (headRect.bottom < map.height) {
        nextHeadEntryPos = resolveMapEntryPos(
          map,
          anchorContext.tgroupPos,
          (map.width * (map.height - 1)) + headRect.right - 1,
          nextHeadEntryPos,
        );
      }
    } else {
      if (headRect.top > 0) {
        nextHeadEntryPos = resolveMapEntryPos(map, anchorContext.tgroupPos, headRect.left, nextHeadEntryPos);
      }
      if (anchorRect.bottom < map.height) {
        nextAnchorEntryPos = resolveMapEntryPos(
          map,
          anchorContext.tgroupPos,
          (map.width * (map.height - 1)) + anchorRect.right - 1,
          nextAnchorEntryPos,
        );
      }
    }
  } else if (anchorRect.left <= headRect.left) {
    if (anchorRect.left > 0) {
      nextAnchorEntryPos = resolveMapEntryPos(map, anchorContext.tgroupPos, anchorRect.top * map.width, nextAnchorEntryPos);
    }
    if (headRect.right < map.width) {
      nextHeadEntryPos = resolveMapEntryPos(
        map,
        anchorContext.tgroupPos,
        (map.width * (headRect.top + 1)) - 1,
        nextHeadEntryPos,
      );
    }
  } else {
    if (headRect.left > 0) {
      nextHeadEntryPos = resolveMapEntryPos(map, anchorContext.tgroupPos, headRect.top * map.width, nextHeadEntryPos);
    }
    if (anchorRect.right < map.width) {
      nextAnchorEntryPos = resolveMapEntryPos(
        map,
        anchorContext.tgroupPos,
        (map.width * (anchorRect.top + 1)) - 1,
        nextAnchorEntryPos,
      );
    }
  }

  return S1000DCellSelection.create($anchorEntry.doc, nextAnchorEntryPos, nextHeadEntryPos);
}

function isValidEntryPosition(doc: ProseMirrorNode, pos: number): boolean {
  if (pos < 0 || pos >= doc.content.size) return false;

  return doc.nodeAt(pos)?.type.name === s1000dTableNodeNames.entry;
}

function clampSelectionPos(doc: ProseMirrorNode, pos: number): number {
  return Math.max(0, Math.min(pos, doc.content.size));
}

function resolveEntryPos($pos: ResolvedPos): number | null {
  if ($pos.nodeAfter?.type.name === s1000dTableNodeNames.entry) {
    return $pos.pos;
  }

  for (let depth = $pos.depth - 1; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.name === s1000dTableNodeNames.row) {
      return $pos.before(depth + 1);
    }
  }

  return null;
}

function findTgroupContext($pos: ResolvedPos): {
  table: ProseMirrorNode;
  tablePos: number;
  tgroup: ProseMirrorNode;
  tgroupPos: number;
  tgroupIndex: number;
} | null {
  let table: ProseMirrorNode | null = null;
  let tablePos = 0;
  let tgroup: ProseMirrorNode | null = null;
  let tgroupPos = 0;

  for (let depth = $pos.depth; depth >= 0; depth -= 1) {
    const node = $pos.node(depth);
    if (!tgroup && node.type.name === s1000dTableNodeNames.tgroup) {
      tgroup = node;
      tgroupPos = depth === 0 ? 0 : $pos.before(depth);
    }
    if (!table && node.type.name === s1000dTableNodeNames.table) {
      table = node;
      tablePos = depth === 0 ? 0 : $pos.before(depth);
    }
  }

  if (!table || !tgroup) {
    return null;
  }

  let tgroupIndex = -1;
  let seenTgroupIndex = -1;
  table.forEach((child) => {
    if (child.type.name !== s1000dTableNodeNames.tgroup || tgroupIndex >= 0) return;
    seenTgroupIndex += 1;
    if (child === tgroup) {
      tgroupIndex = seenTgroupIndex;
    }
  });

  if (tgroupIndex < 0) {
    return null;
  }

  return { table, tablePos, tgroup, tgroupPos, tgroupIndex };
}

function resolveMapEntryPos(
  map: S1000DTableMap,
  tgroupPos: number,
  mapIndex: number,
  fallback: number,
): number {
  const pos = map.map[mapIndex];
  return pos !== undefined && pos >= 0 ? tgroupPos + pos : fallback;
}
