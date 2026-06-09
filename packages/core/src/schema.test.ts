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

  it('includes default text and background style attrs for cells', () => {
    const specs = createHtmlTableNodeSpecs();
    const cellAttrs = specs.htmlTableCell?.attrs as Record<string, { default: unknown }>;
    const parseRule = specs.htmlTableCell?.parseDOM?.[0];
    const rendered = specs.htmlTableCell?.toDOM?.({
      attrs: {
        colspan: 1,
        rowspan: 1,
        colwidth: null,
        textAlign: 'right',
        backgroundColor: '#ffeeaa',
      },
    } as never);
    const parsed = parseRule && 'getAttrs' in parseRule
      ? parseRule.getAttrs?.({
          getAttribute: () => null,
          style: {
            textAlign: 'right',
            backgroundColor: 'rgb(255, 238, 170)',
          },
        } as unknown as HTMLElement)
      : null;

    expect(cellAttrs.textAlign?.default).toBeNull();
    expect(cellAttrs.backgroundColor?.default).toBeNull();
    expect(parsed).toMatchObject({
      textAlign: 'right',
      backgroundColor: 'rgb(255, 238, 170)',
    });
    expect(rendered).toEqual(['td', { style: 'text-align: right; background-color: #ffeeaa;' }, 0]);
  });

  it('includes default vertical align style attrs for cells', () => {
    const specs = createHtmlTableNodeSpecs();
    const cellAttrs = specs.htmlTableCell?.attrs as Record<string, { default: unknown }>;
    const parseRule = specs.htmlTableCell?.parseDOM?.[0];
    const rendered = specs.htmlTableCell?.toDOM?.({
      attrs: {
        colspan: 1,
        rowspan: 1,
        colwidth: null,
        textAlign: null,
        backgroundColor: null,
        verticalAlign: 'middle',
      },
    } as never);
    const parsed = parseRule && 'getAttrs' in parseRule
      ? parseRule.getAttrs?.({
          getAttribute: () => null,
          style: {
            textAlign: '',
            backgroundColor: '',
            verticalAlign: 'middle',
          },
        } as unknown as HTMLElement)
      : null;

    expect(cellAttrs.verticalAlign?.default).toBeNull();
    expect(parsed).toMatchObject({
      verticalAlign: 'middle',
    });
    expect(rendered).toEqual(['td', { style: 'vertical-align: middle;' }, 0]);
  });

  it('sanitizes invalid span and colwidth values while parsing cells', () => {
    const specs = createHtmlTableNodeSpecs();
    const parseRule = specs.htmlTableCell?.parseDOM?.[0];
    const parsed = parseRule && 'getAttrs' in parseRule
      ? parseRule.getAttrs?.({
          getAttribute: (name: string) => {
            if (name === 'colspan') return 'abc';
            if (name === 'rowspan') return '0';
            if (name === 'data-colwidth') return '120,abc,-5,0,240';
            return null;
          },
          style: {},
        } as HTMLElement)
      : null;

    expect(parsed).toMatchObject({
      colspan: 1,
      rowspan: 1,
      colwidth: [120, 240],
    });
  });

  it('normalizes whitespace, decimal, and infinite cell sizing inputs while parsing', () => {
    const specs = createHtmlTableNodeSpecs();
    const parseRule = specs.htmlTableCell?.parseDOM?.[0];
    const parsed = parseRule && 'getAttrs' in parseRule
      ? parseRule.getAttrs?.({
          getAttribute: (name: string) => {
            if (name === 'colspan') return ' 2 ';
            if (name === 'rowspan') return '1.5';
            if (name === 'data-colwidth') return ' 80.5 , Infinity , 160 ';
            return null;
          },
          style: {},
        } as HTMLElement)
      : null;

    expect(parsed).toMatchObject({
      colspan: 2,
      rowspan: 1,
      colwidth: [80.5, 160],
    });
  });
});
