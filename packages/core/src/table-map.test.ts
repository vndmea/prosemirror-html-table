import { Schema, type Node as ProseMirrorNode, type NodeSpec } from 'prosemirror-model';
import { TableMap, tableNodes } from 'prosemirror-tables';
import { describe, expect, it } from 'vitest';

import {
  HtmlTableMap,
  createHtmlTableNodeSpecs,
  type HtmlTableCellRef,
  type HtmlTableRect,
  type HtmlTableRowRef,
} from './index.js';

const baseNodes: Record<'doc' | 'text' | 'paragraph', NodeSpec> = {
  doc: { content: 'block+' },
  text: { group: 'inline' },
  paragraph: {
    group: 'block',
    content: 'inline*',
    toDOM: () => ['p', 0] as const,
    parseDOM: [{ tag: 'p' }],
  },
};

const htmlSchema = new Schema({
  nodes: {
    ...baseNodes,
    ...createHtmlTableNodeSpecs(),
  },
});

const officialSchema = new Schema({
  nodes: {
    ...baseNodes,
    ...tableNodes({
      tableGroup: 'block',
      cellContent: 'block+',
      cellAttributes: {},
    }),
  },
});

describe('HtmlTableMap', () => {
  it('adds a cached TableMap-style adapter on top of the section-aware grid', () => {
    const table = htmlSchema.nodes.htmlTable!.create(null, [
      htmlSchema.nodes.htmlTableHead!.create(null, [
        htmlSchema.nodes.htmlTableRow!.create(null, [
          createHtmlCell('head-1'),
          createHtmlCell('head-2'),
        ]),
      ]),
      htmlSchema.nodes.htmlTableBody!.create(null, [
        htmlSchema.nodes.htmlTableRow!.create(null, [
          createHtmlCell('body-1'),
          createHtmlCell('body-2'),
        ]),
      ]),
      htmlSchema.nodes.htmlTableFoot!.create(null, [
        htmlSchema.nodes.htmlTableRow!.create(null, [
          createHtmlCell('foot-1'),
          createHtmlCell('foot-2'),
        ]),
      ]),
    ]);

    const map = HtmlTableMap.get(table);

    expect(HtmlTableMap.get(table)).toBe(map);
    expect(map.grid.rows.map((row) => row.section)).toEqual(['head', 'body', 'foot']);
    expect(map.width).toBe(2);
    expect(map.height).toBe(3);
    expect(map.cellPositions.size).toBe(map.grid.cells.length);

    for (const cell of map.grid.cells) {
      const cellPos = map.cellPositions.get(cell);

      expect(cellPos).toBeTypeOf('number');
      expect(map.findCell(cellPos!)).toEqual({
        left: cell.columnIndex,
        top: cell.rowIndex,
        right: cell.columnIndex + cell.colSpan,
        bottom: cell.rowIndex + cell.rowSpan,
      });
    }

    const headRight = getCellByText(map.grid.cells, 'head-2');
    const bodyRight = getCellByText(map.grid.cells, 'body-2');
    const footRight = getCellByText(map.grid.cells, 'foot-2');
    const headRightPos = map.cellPositions.get(headRight);
    const bodyRightPos = map.cellPositions.get(bodyRight);
    const footRightPos = map.cellPositions.get(footRight);

    expect(headRightPos).toBeTypeOf('number');
    expect(bodyRightPos).toBeTypeOf('number');
    expect(footRightPos).toBeTypeOf('number');
    expect(map.colCount(headRightPos!)).toBe(1);
    expect(map.nextCell(headRightPos!, 'vert', 1)).toBe(bodyRightPos);
    expect(map.nextCell(bodyRightPos!, 'vert', 1)).toBe(footRightPos);
    expect(map.positionAt(2, 1, table)).toBe(footRightPos);
  });

  it('matches official TableMap behavior for body-only tables with merged cells', () => {
    const htmlTable = htmlSchema.nodes.htmlTable!.create(null, [
      htmlSchema.nodes.htmlTableBody!.create(null, [
        htmlSchema.nodes.htmlTableRow!.create(null, [
          createHtmlCell('a', { rowspan: 2, colspan: 2 }),
          createHtmlCell('b'),
        ]),
        htmlSchema.nodes.htmlTableRow!.create(null, [
          createHtmlCell('c'),
        ]),
        htmlSchema.nodes.htmlTableRow!.create(null, [
          createHtmlCell('d'),
          createHtmlCell('e'),
          createHtmlCell('f'),
        ]),
      ]),
    ]);

    const officialTable = officialSchema.nodes.table!.create(null, [
      officialSchema.nodes.table_row!.create(null, [
        createOfficialCell('a', { rowspan: 2, colspan: 2 }),
        createOfficialCell('b'),
      ]),
      officialSchema.nodes.table_row!.create(null, [
        createOfficialCell('c'),
      ]),
      officialSchema.nodes.table_row!.create(null, [
        createOfficialCell('d'),
        createOfficialCell('e'),
        createOfficialCell('f'),
      ]),
    ]);

    const htmlMap = HtmlTableMap.get(htmlTable);
    const officialMap = TableMap.get(officialTable);
    const officialPositions = uniquePositions(officialMap.map);
    const translatePosition = createPositionTranslator(officialMap, htmlMap);

    expect(normalizeMapPattern(htmlMap.map)).toEqual(normalizeMapPattern(officialMap.map));

    for (const officialPos of officialPositions) {
      const htmlPos = translatePosition(officialPos);

      expect(htmlMap.findCell(htmlPos)).toEqual(officialMap.findCell(officialPos));
      expect(htmlMap.colCount(htmlPos)).toBe(officialMap.colCount(officialPos));

      for (const axis of ['horiz', 'vert'] as const) {
        for (const dir of [-1, 1] as const) {
          expect(toRectKey(officialMap, officialMap.nextCell(officialPos, axis, dir))).toBe(
            toRectKey(htmlMap, htmlMap.nextCell(htmlPos, axis, dir)),
          );
        }
      }
    }

    for (const from of officialPositions) {
      for (const to of officialPositions) {
        const officialRect = officialMap.rectBetween(from, to);
        const htmlRect = htmlMap.rectBetween(translatePosition(from), translatePosition(to));

        expect(htmlRect).toEqual(officialRect);
        expect(htmlMap.cellsInRect(htmlRect).map((pos) => rectKey(htmlMap.findCell(pos)))).toEqual(
          officialMap.cellsInRect(officialRect).map((pos) => rectKey(officialMap.findCell(pos))),
        );
      }
    }

    for (let rowIndex = 0; rowIndex < officialMap.height; rowIndex += 1) {
      for (let columnIndex = 0; columnIndex < officialMap.width; columnIndex += 1) {
        const officialSignature = describeOfficialRowPosition(
          officialTable,
          rowIndex,
          officialMap.positionAt(rowIndex, columnIndex, officialTable),
        );
        const htmlSignature = describeHtmlRowPosition(
          htmlTable,
          htmlMap.grid.rows[rowIndex]!,
          htmlMap.positionAt(rowIndex, columnIndex, htmlTable),
        );

        expect(htmlSignature).toEqual(officialSignature);
      }
    }
  });
});

function createHtmlCell(text: string, attrs: Record<string, unknown> = {}): ProseMirrorNode {
  return htmlSchema.nodes.htmlTableCell!.create(attrs, [createParagraph(htmlSchema, text)]);
}

function createOfficialCell(text: string, attrs: Record<string, unknown> = {}): ProseMirrorNode {
  return officialSchema.nodes.table_cell!.create(attrs, [createParagraph(officialSchema, text)]);
}

function createParagraph(schema: Schema, text: string): ProseMirrorNode {
  return schema.nodes.paragraph!.create(null, text ? schema.text(text) : undefined);
}

function getCellByText(cells: HtmlTableCellRef[], text: string): HtmlTableCellRef {
  const cell = cells.find((item) => item.node.textContent === text);

  if (!cell) {
    throw new Error(`Unable to find cell with text "${text}"`);
  }

  return cell;
}

function uniquePositions(map: number[]): number[] {
  return Array.from(new Set(map.filter((pos) => pos >= 0)));
}

function normalizeMapPattern(map: number[]): number[] {
  const ids = new Map<number, number>();
  let nextId = 0;

  return map.map((pos) => {
    const existing = ids.get(pos);
    if (existing !== undefined) return existing;

    ids.set(pos, nextId);
    nextId += 1;
    return nextId - 1;
  });
}

function createPositionTranslator(officialMap: TableMap, htmlMap: HtmlTableMap): (pos: number) => number {
  const htmlPositionsByRect = new Map<string, number>();

  for (const htmlPos of uniquePositions(htmlMap.map)) {
    htmlPositionsByRect.set(rectKey(htmlMap.findCell(htmlPos)), htmlPos);
  }

  return (officialPos: number) => {
    const translated = htmlPositionsByRect.get(rectKey(officialMap.findCell(officialPos)));

    if (translated === undefined) {
      throw new Error(`Unable to translate official TableMap position ${officialPos}`);
    }

    return translated;
  };
}

function toRectKey(
  map: Pick<TableMap, 'findCell'> | Pick<HtmlTableMap, 'findCell'>,
  pos: number | null,
): string | null {
  return pos === null ? null : rectKey(map.findCell(pos));
}

function rectKey(rect: HtmlTableRect): string {
  return `${rect.left}:${rect.top}:${rect.right}:${rect.bottom}`;
}

function describeOfficialRowPosition(
  table: ProseMirrorNode,
  rowIndex: number,
  pos: number,
): { kind: 'cell'; cellIndex: number } | { kind: 'end' } {
  let rowStart = 0;

  for (let index = 0; index < rowIndex; index += 1) {
    rowStart += table.child(index)!.nodeSize;
  }

  const row = table.child(rowIndex)!;
  let matchedCellIndex: number | undefined;

  row.forEach((_cell, cellOffset, cellIndex) => {
    if (pos === rowStart + 1 + cellOffset) {
      matchedCellIndex = cellIndex;
    }
  });

  if (matchedCellIndex !== undefined) {
    return {
      kind: 'cell',
      cellIndex: matchedCellIndex,
    };
  }

  if (pos === rowStart + row.nodeSize - 1) {
    return { kind: 'end' };
  }

  throw new Error(`Unexpected official row position ${pos} for row ${rowIndex}`);
}

function describeHtmlRowPosition(
  table: ProseMirrorNode,
  rowRef: HtmlTableRowRef,
  pos: number,
): { kind: 'cell'; cellIndex: number } | { kind: 'end' } {
  const rowContext = findHtmlRowContext(table, rowRef);
  let matchedCellIndex: number | undefined;

  rowContext.row.forEach((_cell, cellOffset, cellIndex) => {
    if (pos === rowContext.rowStart + 1 + cellOffset) {
      matchedCellIndex = cellIndex;
    }
  });

  if (matchedCellIndex !== undefined) {
    return {
      kind: 'cell',
      cellIndex: matchedCellIndex,
    };
  }

  if (pos === rowContext.rowStart + rowContext.row.nodeSize - 1) {
    return { kind: 'end' };
  }

  throw new Error(`Unexpected HtmlTableMap row position ${pos} for row ${rowRef.rowIndex}`);
}

function findHtmlRowContext(
  table: ProseMirrorNode,
  rowRef: HtmlTableRowRef,
): { row: ProseMirrorNode; rowStart: number } {
  const sectionCounters = {
    head: 0,
    body: 0,
    foot: 0,
  };
  let result: { row: ProseMirrorNode; rowStart: number } | undefined;

  table.forEach((sectionNode, sectionOffset) => {
    if (result) return;

    const section =
      sectionNode.type.name === 'htmlTableHead'
        ? 'head'
        : sectionNode.type.name === 'htmlTableBody'
          ? 'body'
          : sectionNode.type.name === 'htmlTableFoot'
            ? 'foot'
            : undefined;
    if (!section) return;

    const sectionIndex = sectionCounters[section];
    sectionCounters[section] += 1;
    if (section !== rowRef.section || sectionIndex !== rowRef.sectionIndex) return;

    sectionNode.forEach((rowNode, rowOffset, rowIndexInSection) => {
      if (result || rowIndexInSection !== rowRef.rowIndexInSection) return;

      result = {
        row: rowNode,
        rowStart: 1 + sectionOffset + 1 + rowOffset,
      };
    });
  });

  if (!result) {
    throw new Error(`Unable to find row context for logical row ${rowRef.rowIndex}`);
  }

  return result;
}
