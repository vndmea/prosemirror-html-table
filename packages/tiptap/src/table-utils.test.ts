import { Schema } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';

import { createHtmlTableNode, createHtmlTableNodeSpecs } from 'prosemirror-html-table';

import { applyColumnWidths, getTableColumnWidths } from './table-utils.js';

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

describe('table width utilities', () => {
  it('derives widths from colgroup and cell colwidth attrs', () => {
    const table = schema.nodes.htmlTable!.create(null, [
      schema.nodes.htmlTableColgroup!.create(null, [
        schema.nodes.htmlTableCol!.create({ width: 180 }),
        schema.nodes.htmlTableCol!.create({ width: 240 }),
      ]),
      createHtmlTableNode(schema, { rows: 1, cols: 2 }).child(0),
    ]);

    expect(getTableColumnWidths(table, 120)).toEqual([180, 240]);
  });

  it('applies widths into colgroup and cell colwidth arrays', () => {
    const table = createHtmlTableNode(schema, { rows: 1, cols: 2 });
    const resized = applyColumnWidths(table, [160, 220]);
    const colgroup = resized.child(0);
    const body = resized.child(resized.childCount - 1);
    const firstRow = body.child(0);

    expect(colgroup.type.name).toBe('htmlTableColgroup');
    expect(colgroup.child(0).attrs.width).toBe(160);
    expect(colgroup.child(1).attrs.width).toBe(220);
    expect(firstRow.child(0).attrs.colwidth).toEqual([160]);
    expect(firstRow.child(1).attrs.colwidth).toEqual([220]);
  });
});
