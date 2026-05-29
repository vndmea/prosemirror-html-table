import { describe, expect, it } from 'vitest';

import {
  HtmlTable,
  HtmlTableBody,
  HtmlTableCaption,
  HtmlTableCell,
  HtmlTableCol,
  HtmlTableColgroup,
  createHtmlTableExtensions,
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

  it('creates configurable cell extensions for custom attrs', () => {
    const extensions = createHtmlTableExtensions({
      cellAttributes: {
        textAlign: {
          default: null,
          parseHTML: (element) => element.getAttribute('data-align'),
          renderHTML: (attrs) => (attrs.textAlign ? { 'data-align': String(attrs.textAlign) } : {}),
        },
      },
    });

    const cellExtension = extensions.find((extension) => extension.name === 'htmlTableCell') as {
      config: {
        addAttributes?: () => Record<string, {
          default: unknown;
          parseHTML?: (element: HTMLElement) => unknown;
          renderHTML?: (attrs: Record<string, unknown>) => Record<string, string>;
        }>;
      };
    };
    const headerCellExtension = extensions.find((extension) => extension.name === 'htmlTableHeaderCell') as typeof cellExtension;
    const cellAttributes = cellExtension.config.addAttributes?.() ?? {};
    const headerCellAttributes = headerCellExtension.config.addAttributes?.() ?? {};

    expect(cellAttributes.textAlign?.default).toBeNull();
    expect(headerCellAttributes.textAlign?.default).toBeNull();
    expect(cellAttributes.textAlign?.parseHTML?.({
      getAttribute: () => 'center',
    } as unknown as HTMLElement)).toBe('center');
    expect(cellAttributes.textAlign?.renderHTML?.({ textAlign: 'center' })).toEqual({
      'data-align': 'center',
    });
  });

  it('exposes default style-based cell attrs on cell extensions', () => {
    const cellExtension = HtmlTableCell as unknown as {
      config: {
        addAttributes?: () => Record<string, {
          default: unknown;
          parseHTML?: (element: HTMLElement) => unknown;
          renderHTML?: (attrs: Record<string, unknown>) => Record<string, string>;
        }>;
      };
    };
    const cellAttributes = (cellExtension.config.addAttributes?.() ?? {}) as Record<string, {
      default: unknown;
      parseHTML?: (element: HTMLElement) => unknown;
      renderHTML?: (attrs: Record<string, unknown>) => Record<string, string>;
    }>;

    expect(cellAttributes.textAlign?.default).toBeNull();
    expect(cellAttributes.backgroundColor?.default).toBeNull();
    expect(cellAttributes.textAlign?.parseHTML?.({
      style: {
        textAlign: 'right',
      },
      getAttribute: () => null,
    } as unknown as HTMLElement)).toBe('right');
    expect(cellAttributes.backgroundColor?.renderHTML?.({ backgroundColor: '#ffeeaa' })).toEqual({
      style: 'background-color: #ffeeaa;',
    });
  });
});
