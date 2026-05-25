import { describe, expect, it } from 'vitest';

import {
  HtmlTable,
  HtmlTableBody,
  HtmlTableCaption,
  HtmlTableCell,
  HtmlTableCol,
  HtmlTableColgroup,
  HtmlTableExtensions,
  HtmlTableFoot,
  HtmlTableHead,
  HtmlTableHeaderCell,
  HtmlTableRow,
} from './index.js';

describe('HtmlTableExtensions', () => {
  it('exports all full HTML table node extensions in schema order', () => {
    expect(HtmlTableExtensions.map((extension) => extension.name)).toEqual([
      'htmlTable',
      'htmlTableCaption',
      'htmlTableColgroup',
      'htmlTableCol',
      'htmlTableHead',
      'htmlTableBody',
      'htmlTableFoot',
      'htmlTableRow',
      'htmlTableHeaderCell',
      'htmlTableCell',
    ]);
  });

  it('exports individual node extensions', () => {
    expect(HtmlTable.name).toBe('htmlTable');
    expect(HtmlTableCaption.name).toBe('htmlTableCaption');
    expect(HtmlTableColgroup.name).toBe('htmlTableColgroup');
    expect(HtmlTableCol.name).toBe('htmlTableCol');
    expect(HtmlTableHead.name).toBe('htmlTableHead');
    expect(HtmlTableBody.name).toBe('htmlTableBody');
    expect(HtmlTableFoot.name).toBe('htmlTableFoot');
    expect(HtmlTableRow.name).toBe('htmlTableRow');
    expect(HtmlTableHeaderCell.name).toBe('htmlTableHeaderCell');
    expect(HtmlTableCell.name).toBe('htmlTableCell');
  });
});
