import { describe, expect, it } from 'vitest';

import { createHtmlTableNodeSpecs, htmlTableNodeNames } from './index.js';

describe('createHtmlTableNodeSpecs', () => {
  it('creates specs for full HTML table structure', () => {
    const specs = createHtmlTableNodeSpecs();

    expect(Object.keys(specs)).toEqual(Object.values(htmlTableNodeNames));
    expect(specs.htmlTable?.content).toBe(
      'htmlTableCaption? htmlTableColgroup? htmlTableHead? htmlTableBody+ htmlTableFoot?',
    );
    expect(specs.htmlTableCaption?.toDOM?.({} as never)).toEqual(['caption', 0]);
    expect(specs.htmlTableHead?.toDOM?.({} as never)).toEqual(['thead', 0]);
    expect(specs.htmlTableBody?.toDOM?.({} as never)).toEqual(['tbody', 0]);
    expect(specs.htmlTableFoot?.toDOM?.({} as never)).toEqual(['tfoot', 0]);
  });

  it('allows custom node names and content expressions', () => {
    const specs = createHtmlTableNodeSpecs({
      names: {
        table: 'table',
        body: 'tableBody',
        row: 'tableRow',
        cell: 'tableCell',
        headerCell: 'tableHeader',
      },
      cellContent: 'paragraph+',
      captionContent: 'text*',
    });

    expect(specs.table?.content).toBe('htmlTableCaption? htmlTableColgroup? htmlTableHead? tableBody+ htmlTableFoot?');
    expect(specs.tableRow?.content).toBe('(tableHeader | tableCell)*');
    expect(specs.tableCell?.content).toBe('paragraph+');
    expect(specs.htmlTableCaption?.content).toBe('text*');
  });

  it('extends cell attrs with custom parse and render behavior', () => {
    const specs = createHtmlTableNodeSpecs({
      cellAttributes: {
        textAlign: {
          default: null,
          parseHTML: (element) => element.getAttribute('data-align'),
          renderHTML: (attrs) => (attrs.textAlign ? { 'data-align': String(attrs.textAlign) } : {}),
        },
      },
    });

    const cellAttrs = specs.htmlTableCell?.attrs as Record<string, { default: unknown }>;
    const parseRule = specs.htmlTableCell?.parseDOM?.[0];
    const rendered = specs.htmlTableCell?.toDOM?.({
      attrs: {
        colspan: 1,
        rowspan: 1,
        colwidth: null,
        textAlign: 'center',
      },
    } as never);
    const parsed = parseRule && 'getAttrs' in parseRule
      ? parseRule.getAttrs?.({
          getAttribute: (name: string) => {
            if (name === 'data-align') return 'center';
            return null;
          },
          style: {},
        } as HTMLElement)
      : null;

    expect(cellAttrs.textAlign?.default).toBeNull();
    expect(parsed).toMatchObject({
      colspan: 1,
      rowspan: 1,
      colwidth: null,
      textAlign: 'center',
    });
    expect(rendered).toEqual(['td', { 'data-align': 'center' }, 0]);
  });
});
