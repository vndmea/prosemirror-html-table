import { Fragment, Slice, type Node as ProseMirrorNode, type ResolvedPos } from 'prosemirror-model';
import { Selection, TextSelection, type SelectionBookmark, type Transaction } from 'prosemirror-state';
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

  content(): Slice {
    const context = findTableContext(this.$anchor);
    if (!context) {
      throw new RangeError('CellSelection.content() requires a selection inside a table.');
    }

    const table = context.table;
    const map = HtmlTableMap.get(table);
    const rect = getSelectionRect(map, context.tablePos, this.anchorCellPos, this.headCellPos);
    const seen = new Set<number>();
    const sections = new Map<string, ProseMirrorNode[]>();
    const sectionOrder: string[] = [];
    const sectionContexts = createSectionContextMap(table);

    for (let row = rect.top; row < rect.bottom; row += 1) {
      const rowRef = map.grid.rows[row];
      if (!rowRef) {
        throw new RangeError(`No row at index ${row} found`);
      }

      const sectionKey = createSectionKey(rowRef.section, rowRef.sectionIndex);
      const sectionContext = sectionContexts.get(sectionKey);
      if (!sectionContext) {
        throw new RangeError(`Unable to resolve section context for ${sectionKey}`);
      }

      const sourceRow = sectionContext.section.child(rowRef.rowIndexInSection);
      const rowContent: ProseMirrorNode[] = [];

      for (
        let index = (row * map.width) + rect.left, col = rect.left;
        col < rect.right;
        col += 1, index += 1
      ) {
        const pos = map.map[index];
        if (pos === undefined || pos < 0 || seen.has(pos)) continue;
        seen.add(pos);
        rowContent.push(clipCellForContent(table, map, pos, rect));
      }

      const rows = sections.get(sectionKey) ?? [];
      rows.push(sourceRow.copy(Fragment.fromArray(rowContent)));
      if (!sections.has(sectionKey)) {
        sections.set(sectionKey, rows);
        sectionOrder.push(sectionKey);
      }
    }

    const fragment = this.isColSelection() && this.isRowSelection()
      ? Fragment.from(table)
      : Fragment.fromArray(
        sectionOrder.map((sectionKey) => {
          const sectionContext = sectionContexts.get(sectionKey);
          const rows = sections.get(sectionKey);
          if (!sectionContext || !rows) {
            throw new RangeError(`Unable to rebuild selected section ${sectionKey}`);
          }

          return sectionContext.section.copy(Fragment.fromArray(rows));
        }),
      );

    return new Slice(fragment, 1, 1);
  }

  replace(tr: Transaction, content: Slice = Slice.empty): void {
    const context = findTableContext(this.$anchor);
    if (!context) return;

    const table = context.table;
    const map = HtmlTableMap.get(table);
    const mapFrom = tr.steps.length;
    const ranges = getReplacementRanges(table, map, context.tablePos, this.headCellPos, this.anchorCellPos);

    for (let index = 0; index < ranges.length; index += 1) {
      const range = ranges[index];
      if (!range) continue;

      const mapping = tr.mapping.slice(mapFrom);
      tr.replace(
        mapping.map(range.from),
        mapping.map(range.to),
        index === 0 ? content : Slice.empty,
      );
    }

    const selectionTarget = ranges[0]?.to ?? this.headCellPos + 1;
    const selection = Selection.findFrom(
      tr.doc.resolve(tr.mapping.slice(mapFrom).map(selectionTarget)),
      -1,
    );

    if (selection) {
      tr.setSelection(selection);
    }
  }

  replaceWith(tr: Transaction, node: ProseMirrorNode): void {
    this.replace(tr, new Slice(Fragment.from(node), 0, 0));
  }

  forEachCell(f: (node: ProseMirrorNode, pos: number) => void): void {
    const context = findTableContext(this.$anchor);
    if (!context) return;

    const table = context.table;
    const map = HtmlTableMap.get(table);
    const rect = getSelectionRect(map, context.tablePos, this.anchorCellPos, this.headCellPos);
    const cells = map.cellsInRect(rect);

    for (const pos of cells) {
      const cell = getCellNodeAtTableOffset(table, pos);
      if (!cell) {
        throw new RangeError(`No cell with offset ${pos} found`);
      }

      f(cell, context.tablePos + pos);
    }
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

function getSelectionRect(
  map: HtmlTableMap,
  tablePos: number,
  anchorCellPos: number,
  headCellPos: number,
) {
  return map.rectBetween(anchorCellPos - tablePos, headCellPos - tablePos);
}

function createSectionContextMap(table: ProseMirrorNode): Map<string, { section: ProseMirrorNode }> {
  const sections = new Map<string, { section: ProseMirrorNode }>();
  const sectionCounters = {
    head: 0,
    body: 0,
    foot: 0,
  };

  table.forEach((child) => {
    const section = getSectionName(child);
    if (!section) return;

    const sectionIndex = sectionCounters[section];
    sectionCounters[section] += 1;
    sections.set(createSectionKey(section, sectionIndex), { section: child });
  });

  return sections;
}

function clipCellForContent(
  table: ProseMirrorNode,
  map: HtmlTableMap,
  pos: number,
  rect: { left: number; top: number; right: number; bottom: number },
): ProseMirrorNode {
  const cellRect = map.findCell(pos);
  let cell = getCellNodeAtTableOffset(table, pos);
  if (!cell) {
    throw new RangeError(`No cell with offset ${pos} found`);
  }

  const extraLeft = rect.left - cellRect.left;
  const extraRight = cellRect.right - rect.right;

  if (extraLeft > 0 || extraRight > 0) {
    let attrs = cell.attrs as Record<string, unknown>;
    if (extraLeft > 0) attrs = trimColSpan(attrs, 0, extraLeft);
    if (extraRight > 0) attrs = trimColSpan(attrs, getColSpan(attrs) - extraRight, extraRight);

    if (cellRect.left < rect.left) {
      cell = createFilledCell(cell, attrs);
    } else {
      cell = cell.type.create(attrs, cell.content, cell.marks);
    }
  }

  if (cellRect.top < rect.top || cellRect.bottom > rect.bottom) {
    const attrs: Record<string, unknown> = {
      ...cell.attrs,
      rowspan: Math.min(cellRect.bottom, rect.bottom) - Math.max(cellRect.top, rect.top),
    };

    if (cellRect.top < rect.top) {
      cell = createFilledCell(cell, attrs);
    } else {
      cell = cell.type.create(attrs, cell.content, cell.marks);
    }
  }

  return cell;
}

function createFilledCell(
  source: ProseMirrorNode,
  attrs: Record<string, unknown>,
): ProseMirrorNode {
  const cell = source.type.createAndFill(attrs);
  if (!cell) {
    throw new RangeError(`Could not create cell with attrs ${JSON.stringify(attrs)}`);
  }

  return cell;
}

function trimColSpan(
  attrs: Record<string, unknown>,
  pos: number,
  count = 1,
): Record<string, unknown> {
  const next: Record<string, unknown> = {
    ...attrs,
    colspan: getColSpan(attrs) - count,
  };
  const colwidth = Array.isArray(next.colwidth) ? [...next.colwidth] : null;

  if (colwidth) {
    colwidth.splice(pos, count);
    next.colwidth = colwidth.some((width) => Number(width) > 0) ? colwidth : null;
  }

  return next;
}

function getColSpan(attrs: Record<string, unknown>): number {
  const colspan = Number(attrs.colspan ?? 1);
  return Number.isInteger(colspan) && colspan > 0 ? colspan : 1;
}

function getReplacementRanges(
  table: ProseMirrorNode,
  map: HtmlTableMap,
  tablePos: number,
  headCellPos: number,
  anchorCellPos: number,
): Array<{ from: number; to: number }> {
  const rect = getSelectionRect(map, tablePos, anchorCellPos, headCellPos);
  const headRelativePos = headCellPos - tablePos;
  const cells = map.cellsInRect(rect).filter((pos) => pos !== headRelativePos);
  cells.unshift(headRelativePos);

  return cells.map((pos) => {
    const cell = getCellNodeAtTableOffset(table, pos);
    if (!cell) {
      throw new RangeError(`No cell with offset ${pos} found`);
    }

    const from = tablePos + pos + 1;
    return {
      from,
      to: from + cell.content.size,
    };
  });
}

function getSectionName(node: ProseMirrorNode): 'head' | 'body' | 'foot' | null {
  if (node.type.name === 'htmlTableHead') return 'head';
  if (node.type.name === 'htmlTableBody') return 'body';
  if (node.type.name === 'htmlTableFoot') return 'foot';
  return null;
}

function createSectionKey(section: 'head' | 'body' | 'foot', sectionIndex: number): string {
  return `${section}:${sectionIndex}`;
}

function getCellNodeAtTableOffset(table: ProseMirrorNode, pos: number): ProseMirrorNode | null {
  return pos > 0 ? table.nodeAt(pos - 1) : null;
}
