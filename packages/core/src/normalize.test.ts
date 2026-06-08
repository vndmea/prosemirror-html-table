import { Schema, type Node as ProseMirrorNode, type NodeSpec } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';

import { createHtmlTableNodeSpecs, normalizeHtmlTable } from './index.js';

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

describe('normalizeHtmlTable', () => {
  it('creates a body with one empty row when a table has no body', () => {
    const table = schema.nodes.htmlTable!.create(null, []);
    const normalized = normalizeHtmlTable(table);
    const body = getRequiredChild(normalized, 'htmlTableBody');

    expect(normalized.childCount).toBe(1);
    expect(body.childCount).toBe(1);
    expect(body.child(0).childCount).toBe(1);
    expect(body.child(0).child(0).type.name).toBe('htmlTableCell');
  });

  it('keeps caption and colgroup before normalized sections', () => {
    const table = schema.nodes.htmlTable!.create(null, [
      schema.nodes.htmlTableBody!.create(null, [row(['A'])]),
      schema.nodes.htmlTableCaption!.create(null, schema.text('Summary')),
      schema.nodes.htmlTableColgroup!.create(null, [
        schema.nodes.htmlTableCol!.create({ span: null, width: 120 }),
      ]),
    ]);

    const normalized = normalizeHtmlTable(table);

    expect(normalized.child(0).type.name).toBe('htmlTableCaption');
    expect(normalized.child(1).type.name).toBe('htmlTableColgroup');
    expect(normalized.child(2).type.name).toBe('htmlTableBody');
  });

  it('keeps multiple tbody sections while padding them to the common table width', () => {
    const table = schema.nodes.htmlTable!.create(null, [
      schema.nodes.htmlTableBody!.create(null, [row(['A', 'B'])]),
      schema.nodes.htmlTableBody!.create(null, [row(['C'])]),
    ]);

    const normalized = normalizeHtmlTable(table);
    const firstBody = normalized.child(0);
    const secondBody = normalized.child(1);

    expect(firstBody.type.name).toBe('htmlTableBody');
    expect(secondBody.type.name).toBe('htmlTableBody');
    expect(firstBody.child(0).childCount).toBe(2);
    expect(secondBody.child(0).childCount).toBe(2);
    expect(secondBody.child(0).textContent).toBe('C');
  });

  it('merges duplicate head and foot sections while preserving body sections', () => {
    const table = schema.nodes.htmlTable!.create(null, [
      schema.nodes.htmlTableHead!.create(null, [headerRow(['H1'])]),
      schema.nodes.htmlTableHead!.create(null, [headerRow(['H2'])]),
      schema.nodes.htmlTableBody!.create(null, [row(['A'])]),
      schema.nodes.htmlTableFoot!.create(null, [row(['F1'])]),
      schema.nodes.htmlTableFoot!.create(null, [row(['F2'])]),
    ]);

    const normalized = normalizeHtmlTable(table);
    const head = getRequiredChild(normalized, 'htmlTableHead');
    const body = getRequiredChild(normalized, 'htmlTableBody');
    const foot = getRequiredChild(normalized, 'htmlTableFoot');

    expect(countChildren(normalized, 'htmlTableHead')).toBe(1);
    expect(countChildren(normalized, 'htmlTableBody')).toBe(1);
    expect(countChildren(normalized, 'htmlTableFoot')).toBe(1);
    expect(head.childCount).toBe(2);
    expect(head.child(0).textContent).toBe('H1');
    expect(head.child(1).textContent).toBe('H2');
    expect(body.child(0).textContent).toBe('A');
    expect(foot.childCount).toBe(2);
    expect(foot.child(0).textContent).toBe('F1');
    expect(foot.child(1).textContent).toBe('F2');
  });

  it('expands colgroup span into single logical columns and pads missing columns', () => {
    const table = schema.nodes.htmlTable!.create(null, [
      schema.nodes.htmlTableColgroup!.create(null, [
        schema.nodes.htmlTableCol!.create({ span: 2, width: 120 }),
      ]),
      schema.nodes.htmlTableBody!.create(null, [row(['A', 'B', 'C'])]),
    ]);

    const normalized = normalizeHtmlTable(table);
    const colgroup = getRequiredChild(normalized, 'htmlTableColgroup');

    expect(colgroup.childCount).toBe(3);
    expect(colgroup.child(0).attrs.span).toBeNull();
    expect(colgroup.child(0).attrs.width).toBe(120);
    expect(colgroup.child(1).attrs.width).toBe(120);
    expect(colgroup.child(2).attrs.width).toBeNull();
  });

  it('pads head, body and foot rows to the widest section', () => {
    const table = schema.nodes.htmlTable!.create(null, [
      schema.nodes.htmlTableHead!.create(null, [headerRow(['H'])]),
      schema.nodes.htmlTableBody!.create(null, [row(['A', 'B', 'C'])]),
      schema.nodes.htmlTableFoot!.create(null, [row(['F'])]),
    ]);

    const normalized = normalizeHtmlTable(table);

    expect(getRequiredChild(normalized, 'htmlTableHead').child(0).childCount).toBe(3);
    expect(getRequiredChild(normalized, 'htmlTableBody').child(0).childCount).toBe(3);
    expect(getRequiredChild(normalized, 'htmlTableFoot').child(0).childCount).toBe(3);
    expect(getRequiredChild(normalized, 'htmlTableHead').child(0).child(1).type.name).toBe('htmlTableHeaderCell');
    expect(getRequiredChild(normalized, 'htmlTableFoot').child(0).child(1).type.name).toBe('htmlTableCell');
  });

  it('clamps row spans to the remaining rows in the same section', () => {
    const table = schema.nodes.htmlTable!.create(null, [
      schema.nodes.htmlTableBody!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [cell('A', { rowspan: 99 })]),
        row(['B']),
      ]),
    ]);

    const normalized = normalizeHtmlTable(table);
    const body = getRequiredChild(normalized, 'htmlTableBody');

    expect(body.child(0).child(0).attrs.rowspan).toBe(2);
  });

  it('normalizes colwidth arrays to the clamped colspan', () => {
    const table = schema.nodes.htmlTable!.create(null, [
      schema.nodes.htmlTableBody!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          cell('A', { colspan: 4, colwidth: [100, 200, 300, 400] }),
        ]),
        row(['B', 'C']),
      ]),
    ]);

    const normalized = normalizeHtmlTable(table);
    const body = getRequiredChild(normalized, 'htmlTableBody');

    expect(body.child(0).child(0).attrs.colspan).toBe(4);
    expect(body.child(0).child(0).attrs.colwidth).toEqual([100, 200, 300, 400]);
  });

  it('preserves table, section and row attributes when rebuilding normalized nodes', () => {
    const table = schema.nodes.htmlTable!.create({ width: 480 }, [
      schema.nodes.htmlTableBody!.create({ class: 'body' }, [
        schema.nodes.htmlTableRow!.create({ data: 'row' }, [cell('A')]),
      ]),
    ]);

    const normalized = normalizeHtmlTable(table);
    const body = getRequiredChild(normalized, 'htmlTableBody');

    expect(normalized.attrs.width).toBe(480);
    expect(body.attrs).toEqual(table.child(0).attrs);
    expect(body.child(0).attrs).toEqual(table.child(0).child(0).attrs);
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

function getRequiredChild(node: ProseMirrorNode, typeName: string): ProseMirrorNode {
  for (let index = 0; index < node.childCount; index += 1) {
    const child = node.child(index);
    if (child.type.name === typeName) return child;
  }

  throw new Error(`Expected child node of type ${typeName}.`);
}

function countChildren(node: ProseMirrorNode, typeName: string): number {
  let count = 0;
  node.forEach((child) => {
    if (child.type.name === typeName) count += 1;
  });
  return count;
}
