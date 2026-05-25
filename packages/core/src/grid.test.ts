import { Schema } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';

import { createHtmlTableGrid, createHtmlTableNode, createHtmlTableNodeSpecs, getCellAt, isCellAnchor } from './index.js';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    text: { group: 'inline' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      toDOM: () => ['p', 0],
      parseDOM: [{ tag: 'p' }],
    },
    ...createHtmlTableNodeSpecs(),
  },
});

describe('createHtmlTableGrid', () => {
  it('maps generated table rows and cells into a logical grid', () => {
    const table = createHtmlTableNode(schema, {
      rows: 2,
      cols: 3,
      withHeaderRow: true,
      withCaption: true,
      captionText: 'Demo table',
    });

    const grid = createHtmlTableGrid(table);

    expect(grid.width).toBe(3);
    expect(grid.height).toBe(2);
    expect(grid.rows.map((row) => row.section)).toEqual(['body', 'body']);
    expect(grid.cells).toHaveLength(6);
    expect(getCellAt(grid, 0, 0)?.node.type.name).toBe('htmlTableHeaderCell');
    expect(getCellAt(grid, 1, 2)?.node.type.name).toBe('htmlTableCell');
    expect(isCellAnchor(grid, 0, 0)).toBe(true);
  });

  it('expands rowspan and colspan into occupied slots', () => {
    const paragraph = schema.nodes.paragraph!.createAndFill();
    const wideCell = schema.nodes.htmlTableCell!.create(
      {
        colspan: 2,
        rowspan: 2,
      },
      paragraph ? [paragraph] : undefined,
    );
    const normalCell = schema.nodes.htmlTableCell!.createAndFill();
    const rowA = schema.nodes.htmlTableRow!.create(null, [wideCell, normalCell]);
    const rowB = schema.nodes.htmlTableRow!.create(null, [schema.nodes.htmlTableCell!.createAndFill()]);
    const body = schema.nodes.htmlTableBody!.create(null, [rowA, rowB]);
    const table = schema.nodes.htmlTable!.create(null, [body]);

    const grid = createHtmlTableGrid(table);

    expect(grid.width).toBe(3);
    expect(grid.height).toBe(2);
    expect(getCellAt(grid, 0, 0)).toBe(getCellAt(grid, 1, 1));
    expect(isCellAnchor(grid, 0, 0)).toBe(true);
    expect(isCellAnchor(grid, 1, 1)).toBe(false);
    expect(getCellAt(grid, 1, 2)?.cellIndex).toBe(0);
  });
});
