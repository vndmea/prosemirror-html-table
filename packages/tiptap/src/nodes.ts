import { mergeAttributes, Node, type NodeViewRendererProps } from '@tiptap/core';
import { CellSelection } from 'prosemirror-html-table';

import { createHtmlTableCommands } from './commands.js';
import { createHtmlTableHandlePlugin } from './html-table-handles.js';
import { createHtmlTableInteractionPlugin } from './html-table-interaction.js';
import { defaultHtmlTableTiptapOptions, type HtmlTableTiptapOptions } from './options.js';
import { HtmlTableNodeView } from './table-view.js';
import { createHtmlTableSelectionPlugin, findAdjacentCell, getTableSelectionInfo } from './table-utils.js';

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

  addKeyboardShortcuts() {
    const moveSelection =
      (direction: 'left' | 'right' | 'up' | 'down') =>
      () => {
        const selectionInfo = getTableSelectionInfo(this.editor.state.doc, this.editor.state.selection);
        if (!selectionInfo) return false;

        const targetCell = findAdjacentCell(selectionInfo, direction);
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
        if (this.editor.commands.goToNextHtmlTableCell()) return true;
        if (!this.editor.commands.addHtmlTableRowAfter()) return false;
        return this.editor.commands.goToNextHtmlTableCell();
      },
      'Shift-Tab': () => this.editor.commands.goToPreviousHtmlTableCell(),
      'Shift-ArrowLeft': moveSelection('left'),
      'Shift-ArrowRight': moveSelection('right'),
      'Shift-ArrowUp': moveSelection('up'),
      'Shift-ArrowDown': moveSelection('down'),
    };
  },

  addProseMirrorPlugins() {
    return [
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

  parseHTML() {
    return [{ tag: 'caption' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['caption', HTMLAttributes, 0];
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

const cellAttributes = {
  colspan: {
    default: 1,
    parseHTML: (element: HTMLElement) => Number(element.getAttribute('colspan') || 1),
    renderHTML: (attrs: Record<string, unknown>) => (attrs.colspan !== 1 ? { colspan: attrs.colspan } : {}),
  },
  rowspan: {
    default: 1,
    parseHTML: (element: HTMLElement) => Number(element.getAttribute('rowspan') || 1),
    renderHTML: (attrs: Record<string, unknown>) => (attrs.rowspan !== 1 ? { rowspan: attrs.rowspan } : {}),
  },
  colwidth: {
    default: null,
    parseHTML: (element: HTMLElement) => {
      const value = element.getAttribute('data-colwidth');
      return value ? value.split(',').map((item) => Number(item)) : null;
    },
    renderHTML: (attrs: Record<string, unknown>) =>
      Array.isArray(attrs.colwidth) ? { 'data-colwidth': attrs.colwidth.join(',') } : {},
  },
};

export const HtmlTableCell = Node.create({
  name: 'htmlTableCell',

  content: 'block+',

  isolating: true,

  addAttributes() {
    return cellAttributes;
  },

  parseHTML() {
    return [{ tag: 'td' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['td', HTMLAttributes, 0];
  },
});

export const HtmlTableHeaderCell = Node.create({
  name: 'htmlTableHeaderCell',

  content: 'block+',

  isolating: true,

  addAttributes() {
    return cellAttributes;
  },

  parseHTML() {
    return [{ tag: 'th' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['th', HTMLAttributes, 0];
  },
});

export const HtmlTableExtensions = [
  HtmlTable,
  HtmlTableCaption,
  HtmlTableColgroup,
  HtmlTableCol,
  HtmlTableHead,
  HtmlTableBody,
  HtmlTableFoot,
  HtmlTableRow,
  HtmlTableHeaderCell,
  HtmlTableCell,
];
