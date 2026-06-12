import type { NodeSpec } from 'prosemirror-model';
import {
  colspecAttrs,
  createAttrs,
  createGroupedAttrs,
  entryAttrs,
  entryBlockAttrs,
  graphicAttrs,
  rowAttrs,
  sectionAttrs,
  spanspecAttrs,
  tableAttrs,
  tgroupAttrs,
} from './attrs.js';
import { resolveS1000DTableNodeNames } from './names.js';
import type {
  NormalizedS1000DTableSchemaOptions,
  S1000DTableNodeSpecs,
  S1000DTableSchemaOptions,
} from './types.js';

export function normalizeS1000DTableSchemaOptions(
  options: S1000DTableSchemaOptions = {},
): NormalizedS1000DTableSchemaOptions {
  return {
    names: resolveS1000DTableNodeNames(options.names),
    tableGroup: options.tableGroup ?? 'block',
    titleContent: options.titleContent ?? 'inline*',
    entryContent: options.entryContent ?? `${resolveS1000DTableNodeNames(options.names).entryBlock}*`,
  };
}

export function createS1000DTableNodeSpecs(options: S1000DTableSchemaOptions = {}): S1000DTableNodeSpecs {
  const config = normalizeS1000DTableSchemaOptions(options);
  const { names } = config;

  return {
    [names.table]: createTableSpec(config),
    [names.title]: createTitleSpec(config),
    [names.tgroup]: createTgroupSpec(config),
    [names.colspec]: createColspecSpec(),
    [names.spanspec]: createSpanspecSpec(),
    [names.thead]: createSectionSpec('thead', `${names.colspec}* ${names.row}+`),
    [names.tfoot]: createSectionSpec('tfoot', `${names.colspec}* ${names.row}+`),
    [names.tbody]: createSectionSpec('tbody', `${names.row}+`),
    [names.row]: createRowSpec(config),
    [names.entry]: createEntrySpec(config),
    [names.entryBlock]: createEntryBlockSpec(),
    [names.graphic]: createGraphicSpec(),
  };
}

function createTableSpec(config: NormalizedS1000DTableSchemaOptions): NodeSpec {
  const { names } = config;

  return {
    group: config.tableGroup,
    content: `${names.title}? (${names.tgroup}+ | ${names.graphic}+)`,
    tableRole: 's1000d-table',
    isolating: true,
    attrs: createGroupedAttrs(tableAttrs),
    toDOM: () => ['table', { 'data-s1000d': 'table' }, 0],
  };
}

function createTitleSpec(config: NormalizedS1000DTableSchemaOptions): NodeSpec {
  return {
    content: config.titleContent,
    tableRole: 's1000d-title',
    defining: true,
    toDOM: () => ['caption', { 'data-s1000d': 'title' }, 0],
  };
}

function createTgroupSpec(config: NormalizedS1000DTableSchemaOptions): NodeSpec {
  const { names } = config;

  return {
    content: `${names.colspec}* ${names.spanspec}* ${names.thead}? ${names.tfoot}? ${names.tbody}`,
    tableRole: 's1000d-tgroup',
    isolating: true,
    attrs: createAttrs(tgroupAttrs),
    toDOM: () => ['tbody', { 'data-s1000d': 'tgroup' }, 0],
  };
}

function createColspecSpec(): NodeSpec {
  return {
    atom: true,
    tableRole: 's1000d-colspec',
    attrs: createAttrs(colspecAttrs),
    toDOM: () => ['col', { 'data-s1000d': 'colspec' }],
  };
}

function createSpanspecSpec(): NodeSpec {
  return {
    atom: true,
    tableRole: 's1000d-spanspec',
    attrs: createAttrs(spanspecAttrs),
    toDOM: () => ['span', { 'data-s1000d': 'spanspec' }],
  };
}

function createSectionSpec(xmlName: 'thead' | 'tfoot' | 'tbody', content: string): NodeSpec {
  return {
    content,
    tableRole: `s1000d-${xmlName}`,
    isolating: true,
    attrs: createAttrs(sectionAttrs),
    toDOM: () => [xmlName, { 'data-s1000d': xmlName }, 0],
  };
}

function createRowSpec(config: NormalizedS1000DTableSchemaOptions): NodeSpec {
  return {
    content: `${config.names.entry}+`,
    tableRole: 's1000d-row',
    attrs: createGroupedAttrs(rowAttrs),
    toDOM: () => ['tr', { 'data-s1000d': 'row' }, 0],
  };
}

function createEntrySpec(config: NormalizedS1000DTableSchemaOptions): NodeSpec {
  return {
    content: config.entryContent,
    tableRole: 's1000d-entry',
    isolating: true,
    attrs: createAttrs(entryAttrs),
    toDOM: () => ['td', { 'data-s1000d': 'entry' }, 0],
  };
}

function createEntryBlockSpec(): NodeSpec {
  return {
    content: 'inline*',
    group: 'block',
    defining: true,
    attrs: createAttrs(entryBlockAttrs),
    toDOM: (node) => [String(node.attrs.xmlName ?? 'para'), { 'data-s1000d': 'entry-block' }, 0],
  };
}

function createGraphicSpec(): NodeSpec {
  return {
    atom: true,
    tableRole: 's1000d-graphic',
    attrs: createAttrs(graphicAttrs),
    toDOM: () => ['figure', { 'data-s1000d': 'graphic' }],
  };
}
