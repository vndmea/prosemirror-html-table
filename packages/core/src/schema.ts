import type { NodeSpec } from 'prosemirror-model';

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
  } as HtmlTableNodeSpecs;
}

function createTableSpec(config: NormalizedHtmlTableSchemaOptions): NodeSpec {
  const { names } = config;

  return {
    group: config.tableGroup,
    content: `${names.caption}? ${names.colgroup}? ${names.head}? ${names.body}+ ${names.foot}?`,
    tableRole: 'table',
    isolating: true,
    parseDOM: [{ tag: 'table' }],
    toDOM: () => ['table', 0],
  };
}

function createCaptionSpec(config: NormalizedHtmlTableSchemaOptions): NodeSpec {
  return {
    content: config.captionContent,
    defining: true,
    parseDOM: [{ tag: 'caption' }],
    toDOM: () => ['caption', 0],
  };
}

function createColgroupSpec(config: NormalizedHtmlTableSchemaOptions): NodeSpec {
  return {
    content: `${config.names.col}+`,
    isolating: true,
    parseDOM: [{ tag: 'colgroup' }],
    toDOM: () => ['colgroup', 0],
  };
}

function createColSpec(): NodeSpec {
  return {
    atom: true,
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
            width: element.getAttribute('width') ?? element.style.width || null,
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
    attrs: {
      colspan: { default: 1 },
      rowspan: { default: 1 },
      colwidth: { default: null },
    },
    parseDOM: [
      {
        tag,
        getAttrs: (dom) => {
          const element = dom as HTMLElement;
          return {
            colspan: Number(element.getAttribute('colspan') || 1),
            rowspan: Number(element.getAttribute('rowspan') || 1),
            colwidth: element.getAttribute('data-colwidth')
              ? element.getAttribute('data-colwidth')?.split(',').map((value) => Number(value))
              : null,
          };
        },
      },
    ],
    toDOM: (node) => {
      const attrs: Record<string, string> = {};
      if (node.attrs.colspan !== 1) attrs.colspan = String(node.attrs.colspan);
      if (node.attrs.rowspan !== 1) attrs.rowspan = String(node.attrs.rowspan);
      if (Array.isArray(node.attrs.colwidth)) attrs['data-colwidth'] = node.attrs.colwidth.join(',');
      return [tag, attrs, 0];
    },
  };
}
