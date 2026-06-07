import { Schema } from 'prosemirror-model';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { describe, expect, it } from 'vitest';

import { CellSelection, createHtmlTableNode, createHtmlTableNodeSpecs } from 'prosemirror-html-table';

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
import { defaultHtmlTableTiptapOptions } from './options.js';

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

  it('deletes the table when all cells are selected and delete shortcuts are used', () => {
    const table = createHtmlTableNode(schema, { rows: 2, cols: 2 });
    const doc = schema.nodes.doc!.create(null, [table]);
    const cellPositions = findNodePositions(doc, 'htmlTableCell');
    const state = EditorState.create({
      schema,
      doc,
      selection: CellSelection.create(doc, cellPositions[0]!, cellPositions[cellPositions.length - 1]!),
    });
    let deleteCalls = 0;
    const shortcuts = getHtmlTableShortcuts(state, {}, {
      deleteHtmlTable: () => {
        deleteCalls += 1;
        return true;
      },
    });

    for (const key of ['Backspace', 'Delete', 'Mod-Backspace', 'Mod-Delete'] as const) {
      expect(shortcuts[key]).toBeTypeOf('function');
      expect(shortcuts[key]?.()).toBe(true);
    }

    expect(deleteCalls).toBe(4);
  });

  it('does not delete the table for partial cell selections or when the option is disabled', () => {
    const table = createHtmlTableNode(schema, { rows: 2, cols: 2 });
    const doc = schema.nodes.doc!.create(null, [table]);
    const cellPositions = findNodePositions(doc, 'htmlTableCell');
    const partialState = EditorState.create({
      schema,
      doc,
      selection: CellSelection.create(doc, cellPositions[0]!, cellPositions[1]!),
    });
    const disabledState = EditorState.create({
      schema,
      doc,
      selection: CellSelection.create(doc, cellPositions[0]!, cellPositions[cellPositions.length - 1]!),
    });
    let deleteCalls = 0;

    const partialShortcuts = getHtmlTableShortcuts(partialState, {}, {
      deleteHtmlTable: () => {
        deleteCalls += 1;
        return true;
      },
    });
    const disabledShortcuts = getHtmlTableShortcuts(
      disabledState,
      { deleteTableOnAllCellsSelected: false },
      {
        deleteHtmlTable: () => {
          deleteCalls += 1;
          return true;
        },
      },
    );

    expect(partialShortcuts.Backspace?.()).toBe(false);
    expect(disabledShortcuts.Delete?.()).toBe(false);
    expect(deleteCalls).toBe(0);
  });

  it('allows Shift-Arrow expansion across sections when configured', () => {
    const sectionedTable = schema.nodes.htmlTable!.create(null, [
      schema.nodes.htmlTableHead!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableHeaderCell!.create(null, [schema.nodes.paragraph!.create()]),
        ]),
      ]),
      schema.nodes.htmlTableBody!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create()]),
        ]),
      ]),
    ]);
    const doc = schema.nodes.doc!.create(null, [sectionedTable]);
    const headPositions = findNodePositions(doc, 'htmlTableHeaderCell');
    const bodyPositions = findNodePositions(doc, 'htmlTableCell');
    const state = EditorState.create({
      schema,
      doc,
      selection: CellSelection.create(doc, headPositions[0]!),
    });

    const constrained = getHtmlTableShortcuts(state);
    expect(constrained['Shift-ArrowDown']?.()).toBe(false);

    const dispatched: unknown[] = [];
    const unconstrained = getHtmlTableShortcuts(
      state,
      { constrainShiftArrowToSection: false },
      {},
      (transaction) => {
        dispatched.push(transaction);
      },
    );

    expect(unconstrained['Shift-ArrowDown']?.()).toBe(true);
    expect(dispatched).toHaveLength(1);
    expect((dispatched[0] as { selection: unknown }).selection).toBeInstanceOf(CellSelection);
    expect(((dispatched[0] as { selection: CellSelection }).selection).headCellPos).toBe(bodyPositions[0]);
  });
});

function getHtmlTableShortcuts(
  state: EditorState,
  optionOverrides: Partial<typeof defaultHtmlTableTiptapOptions> = {},
  commandOverrides: Partial<{
    goToNextHtmlTableCell: () => boolean;
    goToPreviousHtmlTableCell: () => boolean;
    addHtmlTableRowAfter: () => boolean;
    deleteHtmlTable: () => boolean;
  }> = {},
  dispatch: (transaction: unknown) => void = () => {},
) {
  const extension = HtmlTable as unknown as {
    config: {
      addKeyboardShortcuts?: () => Record<string, () => boolean>;
    };
  };

  return extension.config.addKeyboardShortcuts?.call({
    editor: {
      state,
      commands: {
        goToNextHtmlTableCell: () => false,
        goToPreviousHtmlTableCell: () => false,
        addHtmlTableRowAfter: () => false,
        deleteHtmlTable: () => false,
        ...commandOverrides,
      },
      view: { dispatch },
    },
    options: {
      ...defaultHtmlTableTiptapOptions,
      ...optionOverrides,
    },
  }) ?? {};
}

function findNodePositions(doc: import('prosemirror-model').Node, typeName: string): number[] {
  const positions: number[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name === typeName) {
      positions.push(pos);
    }
  });

  return positions;
}
