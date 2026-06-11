import type { NodeSpec } from 'prosemirror-model';

import {
  createHtmlTableCellAttributes,
  getHtmlTableCellNodeSpecAttributes,
  parseHtmlTableCellAttributes,
  renderHtmlTableCellAttributes,
} from './cell-attributes.js';
import { htmlTableNodeNames } from './names.js';
import type { HtmlTableNodeSpecs, HtmlTableSchemaOptions, NormalizedHtmlTableSchemaOptions } from './types.js';

export function normalizeHtmlTableSchemaOptions(
  options: HtmlTableSchemaOptions = {},
): NormalizedHtmlTableSchemaOptions {
  return {
    names: {
      ...htmlTableNodeNames,
      ...options.names,
    },
    cellContent: options.cellContent ?? 'block+',
    captionContent: options.captionContent ?? 'inline*',
    tableGroup: options.tableGroup ?? 'block',
    cellGroup: options.cellGroup ?? 'htmlTableCellGroup',
    cellAttributes: createHtmlTableCellAttributes(options.cellAttributes),
  };
}

export function createHtmlTableNodeSpecs(options: HtmlTableSchemaOptions = {}): HtmlTableNodeSpecs {
  const config = normalizeHtmlTableSchemaOptions(options);
  const { names } = config;

  return {
    [names.table]: createTableSpec(config),
    [names.caption]: createCaptionSpec(config),
    [names.colgroup]: createColgroupSpec(config),
    [names.col]: createColSpec(),
    [names.head]: createSectionSpec('thead', `${names.row}+`),
    [names.body]: createSectionSpec('tbody', `${names.row}+`),
    [names.foot]: createSectionSpec('tfoot', `${names.row}+`),
    [names.row]: createRowSpec(config),
    [names.headerCell]: createCellSpec('th', config),
    [names.cell]: createCellSpec('td', config),
  };
}

function createTableSpec(config: NormalizedHtmlTableSchemaOptions): NodeSpec {
  const { names } = config;

  return {
    group: config.tableGroup,
    content: `${names.caption}? ${names.colgroup}? ${names.head}? ${names.body}+ ${names.foot}?`,
    tableRole: 'table',
    isolating: true,
    attrs: {
      width: { default: null },
    },
    parseDOM: [
      {
        tag: 'table',
        getAttrs: (dom) => {
          const element = dom as HTMLElement;
          return {
            width: element.getAttribute('width') ?? (element.style.width || null),
          };
        },
      },
    ],
    toDOM: (node) => {
      const attrs: Record<string, string> = {};
      if (node.attrs.width) attrs.width = String(node.attrs.width);
      return ['table', attrs, 0];
    },
  };
}

function createCaptionSpec(config: NormalizedHtmlTableSchemaOptions): NodeSpec {
  return {
    content: config.captionContent,
    tableRole: 'caption',
    defining: true,
    parseDOM: [{ tag: 'caption' }],
    toDOM: () => ['caption', 0],
  };
}

function createColgroupSpec(config: NormalizedHtmlTableSchemaOptions): NodeSpec {
  return {
    content: `${config.names.col}+`,
    tableRole: 'colgroup',
    isolating: true,
    parseDOM: [{ tag: 'colgroup' }],
    toDOM: () => ['colgroup', 0],
  };
}

function createColSpec(): NodeSpec {
  return {
    atom: true,
    tableRole: 'col',
    attrs: {
      span: { default: null },
      width: { default: null },
    },
    parseDOM: [
      {
        tag: 'col',
        getAttrs: (dom) => {
          const element = dom as HTMLElement;
          return {
            span: element.getAttribute('span'),
            width: element.getAttribute('width') ?? (element.style.width || null),
          };
        },
      },
    ],
    toDOM: (node) => {
      const attrs: Record<string, string> = {};
      if (node.attrs.span) attrs.span = String(node.attrs.span);
      if (node.attrs.width) attrs.width = String(node.attrs.width);
      return ['col', attrs];
    },
  };
}

function createSectionSpec(tag: 'thead' | 'tbody' | 'tfoot', content: string): NodeSpec {
  return {
    content,
    tableRole: tag === 'thead' ? 'head' : tag === 'tbody' ? 'body' : 'foot',
    isolating: true,
    parseDOM: [{ tag }],
    toDOM: () => [tag, 0],
  };
}

function createRowSpec(config: NormalizedHtmlTableSchemaOptions): NodeSpec {
  return {
    content: `(${config.names.headerCell} | ${config.names.cell})*`,
    tableRole: 'row',
    parseDOM: [{ tag: 'tr' }],
    toDOM: () => ['tr', 0],
  };
}

function createCellSpec(tag: 'td' | 'th', config: NormalizedHtmlTableSchemaOptions): NodeSpec {
  return {
    content: config.cellContent,
    group: config.cellGroup,
    tableRole: tag === 'th' ? 'header_cell' : 'cell',
    isolating: true,
    attrs: getHtmlTableCellNodeSpecAttributes(config.cellAttributes),
    parseDOM: [
      {
        tag,
        getAttrs: (dom) => parseHtmlTableCellAttributes(dom as HTMLElement, config.cellAttributes),
      },
    ],
    toDOM: (node) => [tag, renderHtmlTableCellAttributes(node.attrs as Record<string, unknown>, config.cellAttributes), 0],
  };
}
