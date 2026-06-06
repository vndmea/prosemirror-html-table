import { Schema } from 'prosemirror-model';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { describe, expect, it } from 'vitest';

import { createHtmlTableNode, createHtmlTableNodeSpecs } from 'prosemirror-html-table';

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
    expect(cellAttributes.verticalAlign?.parseHTML?.({
      style: {
        verticalAlign: 'middle',
      },
      getAttribute: () => null,
    } as unknown as HTMLElement)).toBe('middle');
    expect(cellAttributes.verticalAlign?.renderHTML?.({ verticalAlign: 'middle' })).toEqual({
      style: 'vertical-align: middle;',
    });
  });

  it('keeps an empty caption in place when Backspace is pressed at the start', () => {
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
    const table = createHtmlTableNode(schema, { rows: 1, cols: 1, withCaption: true });
    const doc = schema.nodes.doc!.create(null, [table]);
    const state = EditorState.create({
      schema,
      doc,
      selection: TextSelection.create(doc, 2),
    });
    const captionExtension = HtmlTableCaption as unknown as {
      config: {
        addKeyboardShortcuts?: () => Record<string, () => boolean>;
      };
    };
    const shortcuts = captionExtension.config.addKeyboardShortcuts?.call({
      editor: { state },
    });

    expect(shortcuts?.Backspace).toBeTypeOf('function');
    expect(shortcuts?.Backspace?.()).toBe(true);
  });

  it('does not intercept Backspace for non-empty captions', () => {
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
    const table = createHtmlTableNode(schema, {
      rows: 1,
      cols: 1,
      withCaption: true,
      captionText: 'Summary',
    });
    const doc = schema.nodes.doc!.create(null, [table]);
    const state = EditorState.create({
      schema,
      doc,
      selection: TextSelection.create(doc, 8),
    });
    const captionExtension = HtmlTableCaption as unknown as {
      config: {
        addKeyboardShortcuts?: () => Record<string, () => boolean>;
      };
    };
    const shortcuts = captionExtension.config.addKeyboardShortcuts?.call({
      editor: { state },
    });

    expect(shortcuts?.Backspace).toBeTypeOf('function');
    expect(shortcuts?.Backspace?.()).toBe(false);
  });

  it('renders caption nodes with a placeholder attribute', () => {
    const renderHTML = (HtmlTableCaption as unknown as {
      config: {
        renderHTML?: (props: { HTMLAttributes: Record<string, unknown> }) => unknown[];
      };
    }).config.renderHTML;

    expect(renderHTML?.({
      HTMLAttributes: {},
    })).toEqual(['caption', { 'data-placeholder': 'Type table caption' }, 0]);
  });
});
