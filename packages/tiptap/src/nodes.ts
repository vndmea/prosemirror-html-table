import { mergeAttributes, Node, type NodeViewRendererProps } from '@tiptap/core';
import { type EditorState } from '@tiptap/pm/state';
import {
  CellSelection,
  createTiptapHtmlTableCellAttributes,
  type HtmlTableCellAttributes,
} from 'prosemirror-html-table';

import { createHtmlTableCommands } from './commands.js';
import { createHtmlTableEditingPlugin } from './editing/plugin.js';
import { createHtmlTableHandlePlugin } from './overlay/plugin.js';
import { createHtmlTableInteractionPlugin } from './interaction/plugin.js';
import { defaultHtmlTableTiptapOptions, type HtmlTableTiptapOptions } from './options.js';
import { HtmlTableNodeView } from './table-view.js';
import { createHtmlTableSelectionPlugin, findAdjacentCell, getTableSelectionInfo } from './table-utils.js';

const DEFAULT_CAPTION_PLACEHOLDER = 'Type table caption';

export interface CreateHtmlTableExtensionsOptions {
  table?: Partial<HtmlTableTiptapOptions>;
  cellAttributes?: HtmlTableCellAttributes;
}

export const HtmlTable = Node.create<HtmlTableTiptapOptions>({
  name: 'htmlTable',

  group: 'block',

  content: 'htmlTableCaption? htmlTableColgroup? htmlTableHead? htmlTableBody+ htmlTableFoot?',

  isolating: true,

  addOptions() {
    return defaultHtmlTableTiptapOptions;
  },

  addCommands() {
    return createHtmlTableCommands();
  },

  addAttributes() {
    return {
      width: {
        default: null,
        parseHTML: (element) => element.getAttribute('width') ?? (element.style.width || null),
        renderHTML: (attrs) => {
          if (!attrs.width) return {};
          const width = String(attrs.width);
          return {
            width,
            style: `width: ${/^\d+(\.\d+)?$/.test(width) ? `${width}px` : width}`,
          };
        },
      },
    };
  },

  addKeyboardShortcuts() {
    const moveSelection =
      (direction: 'left' | 'right' | 'up' | 'down') =>
      () => {
        if (!this.options.enableShiftArrowSelection) return false;

        const selectionInfo = getTableSelectionInfo(this.editor.state.doc, this.editor.state.selection);
        if (!selectionInfo) return false;

        const targetCell = findAdjacentCell(selectionInfo, direction, {
          constrainToSection: this.options.constrainShiftArrowToSection,
        });
        if (!targetCell) return false;

        const targetPos = selectionInfo.cellPositions.get(targetCell);
        const anchorPos = selectionInfo.cellPositions.get(selectionInfo.anchorCell);
        if (targetPos === undefined || anchorPos === undefined) return false;

        this.editor.view.dispatch(
          this.editor.state.tr.setSelection(CellSelection.create(this.editor.state.doc, anchorPos, targetPos)).scrollIntoView(),
        );

        return true;
      };

    return {
      Tab: () => {
        if (!this.options.enableTabNavigation) return false;
        if (this.editor.commands.goToNextHtmlTableCell()) return true;
        if (!this.options.addRowOnTabAtEnd) return false;
        if (!this.editor.commands.addHtmlTableRowAfter()) return false;
        return this.editor.commands.goToNextHtmlTableCell();
      },
      'Shift-Tab': () => (this.options.enableTabNavigation ? this.editor.commands.goToPreviousHtmlTableCell() : false),
      'Shift-ArrowLeft': moveSelection('left'),
      'Shift-ArrowRight': moveSelection('right'),
      'Shift-ArrowUp': moveSelection('up'),
      'Shift-ArrowDown': moveSelection('down'),
    };
  },

    addProseMirrorPlugins() {
      return [
        createHtmlTableEditingPlugin(this.options),
        createHtmlTableInteractionPlugin(),
        createHtmlTableHandlePlugin(this.options),
        createHtmlTableSelectionPlugin(this.options),
      ];
  },

  addNodeView() {
    const View = this.options.View ?? HtmlTableNodeView;

    return (props: NodeViewRendererProps) => new View(props, this.options);
  },

  parseHTML() {
    return [{ tag: 'table' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['table', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  },
});

export const HtmlTableCaption = Node.create({
  name: 'htmlTableCaption',

  content: 'inline*',

  defining: true,

  addKeyboardShortcuts() {
    return {
      Backspace: () => shouldKeepEmptyCaption(this.editor.state),
    };
  },

  parseHTML() {
    return [{ tag: 'caption' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['caption', mergeAttributes(HTMLAttributes, {
      'data-placeholder': DEFAULT_CAPTION_PLACEHOLDER,
    }), 0];
  },
});

export const HtmlTableColgroup = Node.create({
  name: 'htmlTableColgroup',

  content: 'htmlTableCol+',

  isolating: true,

  parseHTML() {
    return [{ tag: 'colgroup' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['colgroup', HTMLAttributes, 0];
  },
});

export const HtmlTableCol = Node.create({
  name: 'htmlTableCol',

  atom: true,

  addAttributes() {
    return {
      span: {
        default: null,
        parseHTML: (element) => element.getAttribute('span'),
        renderHTML: (attrs) => (attrs.span ? { span: attrs.span } : {}),
      },
      width: {
        default: null,
        parseHTML: (element) => element.getAttribute('width') ?? (element.style.width || null),
        renderHTML: (attrs) => (attrs.width ? { width: attrs.width } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'col' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['col', HTMLAttributes];
  },
});

export const HtmlTableHead = Node.create({
  name: 'htmlTableHead',

  content: 'htmlTableRow+',

  isolating: true,

  parseHTML() {
    return [{ tag: 'thead' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['thead', HTMLAttributes, 0];
  },
});

export const HtmlTableBody = Node.create({
  name: 'htmlTableBody',

  content: 'htmlTableRow+',

  isolating: true,

  parseHTML() {
    return [{ tag: 'tbody' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['tbody', HTMLAttributes, 0];
  },
});

export const HtmlTableFoot = Node.create({
  name: 'htmlTableFoot',

  content: 'htmlTableRow+',

  isolating: true,

  parseHTML() {
    return [{ tag: 'tfoot' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['tfoot', HTMLAttributes, 0];
  },
});

export const HtmlTableRow = Node.create({
  name: 'htmlTableRow',

  content: '(htmlTableHeaderCell | htmlTableCell)*',

  parseHTML() {
    return [{ tag: 'tr' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['tr', HTMLAttributes, 0];
  },
});

export const HtmlTableCell = createHtmlTableCellExtension('htmlTableCell', 'td');

export const HtmlTableHeaderCell = createHtmlTableCellExtension('htmlTableHeaderCell', 'th');

function shouldKeepEmptyCaption(state: EditorState): boolean {
  const { selection } = state;
  const { $from, empty } = selection;

  return empty
    && $from.parent.type.name === 'htmlTableCaption'
    && $from.parent.textContent.length === 0
    && $from.parentOffset === 0;
}

export function createHtmlTableExtensions(options: CreateHtmlTableExtensionsOptions = {}) {
  const tableExtension = options.table ? HtmlTable.configure(options.table) : HtmlTable;

  return [
    tableExtension,
    HtmlTableCaption,
    HtmlTableColgroup,
    HtmlTableCol,
    HtmlTableHead,
    HtmlTableBody,
    HtmlTableFoot,
    HtmlTableRow,
    createHtmlTableCellExtension('htmlTableHeaderCell', 'th', options.cellAttributes),
    createHtmlTableCellExtension('htmlTableCell', 'td', options.cellAttributes),
  ];
}

export const HtmlTableExtensions = createHtmlTableExtensions();

function createHtmlTableCellExtension(
  name: 'htmlTableCell' | 'htmlTableHeaderCell',
  tag: 'td' | 'th',
  cellAttributes?: HtmlTableCellAttributes,
) {
  return Node.create({
    name,

    content: 'block+',

    isolating: true,

    addAttributes() {
      return createTiptapHtmlTableCellAttributes(cellAttributes);
    },

    parseHTML() {
      return [{ tag }];
    },

    renderHTML({ HTMLAttributes }) {
      return [tag, HTMLAttributes, 0];
    },
  });
}
