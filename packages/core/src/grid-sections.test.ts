import { Schema, type Node as ProseMirrorNode, type NodeSpec } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';

import { createHtmlTableGrid, createHtmlTableNodeSpecs, getCellAt, isCellAnchor } from './index.js';

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

const schema = new Schema({
  nodes: {
    ...baseNodes,
    ...createHtmlTableNodeSpecs(),
  },
});

describe('createHtmlTableGrid section-aware behavior', () => {
  it('maps head, multiple body sections and foot into global row order', () => {
    const table = schema.nodes.htmlTable!.create(null, [
      schema.nodes.htmlTableHead!.create(null, [headerRow(['H1', 'H2'])]),
      schema.nodes.htmlTableBody!.create(null, [row(['A1', 'A2'])]),
      schema.nodes.htmlTableBody!.create(null, [row(['B1', 'B2'])]),
      schema.nodes.htmlTableFoot!.create(null, [row(['F1', 'F2'])]),
    ]);

    const grid = createHtmlTableGrid(table);

    expect(grid.width).toBe(2);
    expect(grid.height).toBe(4);
    expect(grid.rows.map((item) => item.section)).toEqual(['head', 'body', 'body', 'foot']);
    expect(grid.rows.map((item) => item.sectionIndex)).toEqual([0, 0, 1, 0]);
    expect(getCellAt(grid, 0, 0)?.node.textContent).toBe('H1');
    expect(getCellAt(grid, 1, 0)?.node.textContent).toBe('A1');
    expect(getCellAt(grid, 2, 0)?.node.textContent).toBe('B1');
    expect(getCellAt(grid, 3, 0)?.node.textContent).toBe('F1');
  });

  it('returns undefined for out-of-range coordinates', () => {
    const table = schema.nodes.htmlTable!.create(null, [
      schema.nodes.htmlTableBody!.create(null, [row(['A'])]),
    ]);
    const grid = createHtmlTableGrid(table);

    expect(getCellAt(grid, -1, 0)).toBeUndefined();
    expect(getCellAt(grid, 0, -1)).toBeUndefined();
    expect(getCellAt(grid, 1, 0)).toBeUndefined();
    expect(getCellAt(grid, 0, 1)).toBeUndefined();
  });

  it('marks only the origin slot of a rowspan and colspan cell as the anchor', () => {
    const table = schema.nodes.htmlTable!.create(null, [
      schema.nodes.htmlTableBody!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          cell('A', { rowspan: 2, colspan: 2 }),
          cell('B'),
        ]),
        schema.nodes.htmlTableRow!.create(null, [cell('C')]),
      ]),
    ]);

    const grid = createHtmlTableGrid(table);

    expect(grid.width).toBe(3);
    expect(grid.height).toBe(2);
    expect(getCellAt(grid, 0, 0)).toBe(getCellAt(grid, 0, 1));
    expect(getCellAt(grid, 0, 0)).toBe(getCellAt(grid, 1, 1));
    expect(isCellAnchor(grid, 0, 0)).toBe(true);
    expect(isCellAnchor(grid, 0, 1)).toBe(false);
    expect(isCellAnchor(grid, 1, 0)).toBe(false);
    expect(isCellAnchor(grid, 1, 1)).toBe(false);
    expect(isCellAnchor(grid, 1, 2)).toBe(true);
    expect(getCellAt(grid, 1, 2)?.node.textContent).toBe('C');
  });

  it('keeps cell and row indexes stable after earlier rowspans', () => {
    const table = schema.nodes.htmlTable!.create(null, [
      schema.nodes.htmlTableBody!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          cell('A', { rowspan: 2 }),
          cell('B'),
          cell('C'),
        ]),
        schema.nodes.htmlTableRow!.create(null, [
          cell('D'),
          cell('E'),
        ]),
      ]),
    ]);

    const grid = createHtmlTableGrid(table);
    const d = getCellAt(grid, 1, 1);
    const e = getCellAt(grid, 1, 2);

    expect(getCellAt(grid, 1, 0)?.node.textContent).toBe('A');
    expect(d?.node.textContent).toBe('D');
    expect(d?.rowIndex).toBe(1);
    expect(d?.columnIndex).toBe(1);
    expect(d?.cellIndex).toBe(0);
    expect(e?.node.textContent).toBe('E');
    expect(e?.cellIndex).toBe(1);
  });

  it('handles ragged rows by exposing only occupied logical slots', () => {
    const table = schema.nodes.htmlTable!.create(null, [
      schema.nodes.htmlTableBody!.create(null, [
        row(['A', 'B', 'C']),
        row(['D']),
      ]),
    ]);

    const grid = createHtmlTableGrid(table);

    expect(grid.width).toBe(3);
    expect(grid.height).toBe(2);
    expect(getCellAt(grid, 1, 0)?.node.textContent).toBe('D');
    expect(getCellAt(grid, 1, 1)).toBeUndefined();
    expect(getCellAt(grid, 1, 2)).toBeUndefined();
  });
});

function row(texts: string[]): ProseMirrorNode {
  return schema.nodes.htmlTableRow!.create(null, texts.map((text) => cell(text)));
}

function headerRow(texts: string[]): ProseMirrorNode {
  return schema.nodes.htmlTableRow!.create(null, texts.map((text) => headerCell(text)));
}

function cell(text: string, attrs: Record<string, unknown> = {}): ProseMirrorNode {
  return schema.nodes.htmlTableCell!.create(attrs, [paragraph(text)]);
}

function headerCell(text: string, attrs: Record<string, unknown> = {}): ProseMirrorNode {
  return schema.nodes.htmlTableHeaderCell!.create(attrs, [paragraph(text)]);
}

function paragraph(text: string): ProseMirrorNode {
  return schema.nodes.paragraph!.create(null, text ? schema.text(text) : undefined);
}
