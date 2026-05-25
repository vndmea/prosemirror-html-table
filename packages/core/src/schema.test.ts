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
});
