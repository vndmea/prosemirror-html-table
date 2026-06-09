import type { Node as ProseMirrorNode, ResolvedPos } from 'prosemirror-model';
import { Selection, TextSelection, type SelectionBookmark } from 'prosemirror-state';
import type { Mappable } from 'prosemirror-transform';

import { HtmlTableMap } from './table-map.js';

export class CellSelection extends Selection {
  constructor(
    $anchorCell: ReturnType<ProseMirrorNode['resolve']>,
    $headCell: ReturnType<ProseMirrorNode['resolve']>,
    readonly anchorCellPos: number,
    readonly headCellPos: number,
  ) {
    super($anchorCell, $headCell);
  }

  static create(doc: ProseMirrorNode, anchorCellPos: number, headCellPos = anchorCellPos): CellSelection {
    return new CellSelection(
      doc.resolve(anchorCellPos + 1),
      doc.resolve(headCellPos + 1),
      anchorCellPos,
      headCellPos,
    );
  }

  static fromJSON(doc: ProseMirrorNode, json: { anchorCellPos: number; headCellPos: number }): CellSelection {
    return CellSelection.create(doc, json.anchorCellPos, json.headCellPos);
  }

  map(doc: ProseMirrorNode, mapping: Mappable): Selection {
    const anchorCellPos = mapping.map(this.anchorCellPos);
    const headCellPos = mapping.map(this.headCellPos);

    if (!isValidCellPosition(doc, anchorCellPos) || !isValidCellPosition(doc, headCellPos)) {
      const fallbackPos = clampSelectionPos(doc, Math.min(anchorCellPos, headCellPos));
      return TextSelection.near(doc.resolve(fallbackPos));
    }

    return CellSelection.create(doc, anchorCellPos, headCellPos);
  }

  isColSelection(): boolean {
    const context = findTableContext(this.$anchor);
    if (!context) return false;

    const map = HtmlTableMap.get(context.table);
    const anchorRect = map.findCell(this.anchorCellPos - context.tablePos);
    const headRect = map.findCell(this.headCellPos - context.tablePos);

    if (Math.min(anchorRect.top, headRect.top) > 0) return false;
    return Math.max(anchorRect.bottom, headRect.bottom) === map.height;
  }

  static colSelection($anchorCell: ResolvedPos, $headCell: ResolvedPos = $anchorCell): CellSelection {
    return createAxisSelection($anchorCell, $headCell, 'column');
  }

  isRowSelection(): boolean {
    const context = findTableContext(this.$anchor);
    if (!context) return false;

    const map = HtmlTableMap.get(context.table);
    const anchorRect = map.findCell(this.anchorCellPos - context.tablePos);
    const headRect = map.findCell(this.headCellPos - context.tablePos);

    if (Math.min(anchorRect.left, headRect.left) > 0) return false;
    return Math.max(anchorRect.right, headRect.right) === map.width;
  }

  static rowSelection($anchorCell: ResolvedPos, $headCell: ResolvedPos = $anchorCell): CellSelection {
    return createAxisSelection($anchorCell, $headCell, 'row');
  }

  eq(selection: Selection): boolean {
    return (
      selection instanceof CellSelection &&
      selection.anchorCellPos === this.anchorCellPos &&
      selection.headCellPos === this.headCellPos
    );
  }

  toJSON(): { type: string; anchorCellPos: number; headCellPos: number } {
    return {
      type: 'html-table-cell',
      anchorCellPos: this.anchorCellPos,
      headCellPos: this.headCellPos,
    };
  }

  getBookmark(): SelectionBookmark {
    return new CellBookmark(this.anchorCellPos, this.headCellPos);
  }
}

export function isCellSelection(selection: Selection): selection is CellSelection {
  return selection instanceof CellSelection;
}

class CellBookmark implements SelectionBookmark {
  constructor(
    readonly anchorCellPos: number,
    readonly headCellPos: number,
  ) {}

  map(mapping: Mappable): CellBookmark {
    return new CellBookmark(mapping.map(this.anchorCellPos), mapping.map(this.headCellPos));
  }

  resolve(doc: ProseMirrorNode): Selection {
    if (!isValidCellPosition(doc, this.anchorCellPos) || !isValidCellPosition(doc, this.headCellPos)) {
      const fallbackPos = clampSelectionPos(doc, Math.min(this.anchorCellPos, this.headCellPos));
      return TextSelection.near(doc.resolve(fallbackPos));
    }

    return CellSelection.create(doc, this.anchorCellPos, this.headCellPos);
  }
}

Selection.jsonID('html-table-cell', CellSelection);
CellSelection.prototype.visible = false;

function createAxisSelection(
  $anchorCell: ResolvedPos,
  $headCell: ResolvedPos,
  axis: 'row' | 'column',
): CellSelection {
  const anchorCellPos = resolveCellPos($anchorCell);
  const headCellPos = resolveCellPos($headCell);
  const anchorTable = findTableContext($anchorCell);
  const headTable = findTableContext($headCell);

  if (
    anchorCellPos == null
    || headCellPos == null
    || !anchorTable
    || !headTable
    || anchorTable.tablePos !== headTable.tablePos
  ) {
    throw new RangeError('CellSelection row/column helpers require positions inside the same table cell.');
  }

  const map = HtmlTableMap.get(anchorTable.table);
  const anchorRect = map.findCell(anchorCellPos - anchorTable.tablePos);
  const headRect = map.findCell(headCellPos - anchorTable.tablePos);
  let nextAnchorCellPos = anchorCellPos;
  let nextHeadCellPos = headCellPos;

  if (axis === 'column') {
    if (anchorRect.top <= headRect.top) {
      if (anchorRect.top > 0) {
        nextAnchorCellPos = resolveMapCellPos(map, anchorTable.tablePos, anchorRect.left, nextAnchorCellPos);
      }
      if (headRect.bottom < map.height) {
        nextHeadCellPos = resolveMapCellPos(
          map,
          anchorTable.tablePos,
          (map.width * (map.height - 1)) + headRect.right - 1,
          nextHeadCellPos,
        );
      }
    } else {
      if (headRect.top > 0) {
        nextHeadCellPos = resolveMapCellPos(map, anchorTable.tablePos, headRect.left, nextHeadCellPos);
      }
      if (anchorRect.bottom < map.height) {
        nextAnchorCellPos = resolveMapCellPos(
          map,
          anchorTable.tablePos,
          (map.width * (map.height - 1)) + anchorRect.right - 1,
          nextAnchorCellPos,
        );
      }
    }
  } else if (anchorRect.left <= headRect.left) {
    if (anchorRect.left > 0) {
      nextAnchorCellPos = resolveMapCellPos(map, anchorTable.tablePos, anchorRect.top * map.width, nextAnchorCellPos);
    }
    if (headRect.right < map.width) {
      nextHeadCellPos = resolveMapCellPos(
        map,
        anchorTable.tablePos,
        (map.width * (headRect.top + 1)) - 1,
        nextHeadCellPos,
      );
    }
  } else {
    if (headRect.left > 0) {
      nextHeadCellPos = resolveMapCellPos(map, anchorTable.tablePos, headRect.top * map.width, nextHeadCellPos);
    }
    if (anchorRect.right < map.width) {
      nextAnchorCellPos = resolveMapCellPos(
        map,
        anchorTable.tablePos,
        (map.width * (anchorRect.top + 1)) - 1,
        nextAnchorCellPos,
      );
    }
  }

  return CellSelection.create($anchorCell.doc, nextAnchorCellPos, nextHeadCellPos);
}

function isValidCellPosition(doc: ProseMirrorNode, pos: number): boolean {
  if (pos < 0 || pos >= doc.content.size) return false;

  const node = doc.nodeAt(pos);
  return node?.type.name === 'htmlTableCell' || node?.type.name === 'htmlTableHeaderCell';
}

function clampSelectionPos(doc: ProseMirrorNode, pos: number): number {
  return Math.max(0, Math.min(pos, doc.content.size));
}

function resolveCellPos($pos: ResolvedPos): number | null {
  if (isCellNode($pos.nodeAfter)) {
    return $pos.pos;
  }

  for (let depth = $pos.depth - 1; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.spec.tableRole === 'row') {
      return $pos.before(depth + 1);
    }
  }

  return null;
}

function findTableContext($pos: ResolvedPos): { table: ProseMirrorNode; tablePos: number } | null {
  for (let depth = $pos.depth; depth >= 0; depth -= 1) {
    const node = $pos.node(depth);
    if (node.type.spec.tableRole !== 'table') continue;

    return {
      table: node,
      tablePos: depth === 0 ? 0 : $pos.before(depth),
    };
  }

  return null;
}

function resolveMapCellPos(
  map: HtmlTableMap,
  tablePos: number,
  mapIndex: number,
  fallback: number,
): number {
  const pos = map.map[mapIndex];
  return pos !== undefined && pos >= 0 ? tablePos + pos : fallback;
}

function isCellNode(node: ProseMirrorNode | null | undefined): boolean {
  const role = node?.type.spec.tableRole;
  return role === 'cell' || role === 'header_cell';
}
