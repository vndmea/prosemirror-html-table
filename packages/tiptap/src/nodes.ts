import { mergeAttributes, Node } from '@tiptap/core';

import { defaultHtmlTableTiptapOptions, type HtmlTableTiptapOptions } from './options.js';

export const HtmlTable = Node.create<HtmlTableTiptapOptions>({
  name: 'htmlTable',

  group: 'block',

  content: 'htmlTableCaption? htmlTableColgroup? htmlTableHead? htmlTableBody+ htmlTableFoot?',

  isolating: true,

  addOptions() {
    return defaultHtmlTableTiptapOptions;
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
        parseHTML: (element) => element.getAttribute('width') ?? element.style.width || null,
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
