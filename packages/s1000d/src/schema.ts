import type { NodeSpec } from 'prosemirror-model';
import {
  createAttrs,
  createGroupedAttrs,
  entryBlockAttrs,
  graphicAttrs,
} from './attrs.js';
import { resolveS1000DTableNodeNames } from './names.js';
import {
  allowsGraphicOnlyTable,
  allowsSpanspec,
  allowsTfoot,
  getKnownColspecAttrs,
  getKnownEntryAttrs,
  getKnownRowAttrs,
  getKnownSectionAttrs,
  getKnownSpanspecAttrs,
  getKnownTableAttrs,
  getKnownTgroupAttrs,
  normalizeS1000DTableProfile,
  supportsGroupedRowAttrs,
  supportsGroupedTableAttrs,
} from './profile.js';
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
    profile: normalizeS1000DTableProfile(options.profile),
  };
}

export function createS1000DTableNodeSpecs(options: S1000DTableSchemaOptions = {}): S1000DTableNodeSpecs {
  const config = normalizeS1000DTableSchemaOptions(options);
  const { names } = config;

  return {
    [names.table]: createTableSpec(config),
    [names.title]: createTitleSpec(config),
    [names.tgroup]: createTgroupSpec(config),
    [names.colspec]: createColspecSpec(config),
    [names.spanspec]: createSpanspecSpec(config),
    [names.thead]: createSectionSpec(config, 'thead', `${names.colspec}* ${names.row}+`),
    [names.tfoot]: createSectionSpec(config, 'tfoot', `${names.colspec}* ${names.row}+`),
    [names.tbody]: createSectionSpec(config, 'tbody', `${names.row}+`),
    [names.row]: createRowSpec(config),
    [names.entry]: createEntrySpec(config),
    [names.entryBlock]: createEntryBlockSpec(),
    [names.graphic]: createGraphicSpec(),
  };
}

function createTableSpec(config: NormalizedS1000DTableSchemaOptions): NodeSpec {
  const { names } = config;
  const supportsGraphicOnlyTable = allowsGraphicOnlyTable(config.profile);

  return {
    group: config.tableGroup,
    content: supportsGraphicOnlyTable
      ? `${names.title}? (${names.tgroup}+ | ${names.graphic}+)`
      : `${names.title}? ${names.tgroup}+`,
    tableRole: 's1000d-table',
    isolating: true,
    attrs: supportsGroupedTableAttrs(config.profile)
      ? createGroupedAttrs(getKnownTableAttrs(config.profile))
      : createAttrs(getKnownTableAttrs(config.profile)),
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
  const spanspecContent = allowsSpanspec(config.profile) ? ` ${names.spanspec}*` : '';
  const tfootContent = allowsTfoot(config.profile) ? ` ${names.tfoot}?` : '';

  return {
    content: `${names.colspec}*${spanspecContent} ${names.thead}?${tfootContent} ${names.tbody}`,
    tableRole: 's1000d-tgroup',
    isolating: true,
    attrs: createAttrs(getKnownTgroupAttrs(config.profile)),
    toDOM: () => ['tbody', { 'data-s1000d': 'tgroup' }, 0],
  };
}

function createColspecSpec(config: NormalizedS1000DTableSchemaOptions): NodeSpec {
  return {
    atom: true,
    tableRole: 's1000d-colspec',
    attrs: createAttrs(getKnownColspecAttrs(config.profile)),
    toDOM: () => ['col', { 'data-s1000d': 'colspec' }],
  };
}

function createSpanspecSpec(config: NormalizedS1000DTableSchemaOptions): NodeSpec {
  return {
    atom: true,
    tableRole: 's1000d-spanspec',
    attrs: createAttrs(getKnownSpanspecAttrs(config.profile)),
    toDOM: () => ['span', { 'data-s1000d': 'spanspec' }],
  };
}

function createSectionSpec(
  config: NormalizedS1000DTableSchemaOptions,
  xmlName: 'thead' | 'tfoot' | 'tbody',
  content: string,
): NodeSpec {
  return {
    content,
    tableRole: `s1000d-${xmlName}`,
    isolating: true,
    attrs: createAttrs(getKnownSectionAttrs(config.profile)),
    toDOM: () => [xmlName, { 'data-s1000d': xmlName }, 0],
  };
}

function createRowSpec(config: NormalizedS1000DTableSchemaOptions): NodeSpec {
  return {
    content: `${config.names.entry}+`,
    tableRole: 's1000d-row',
    attrs: supportsGroupedRowAttrs(config.profile)
      ? createGroupedAttrs(getKnownRowAttrs(config.profile))
      : createAttrs(getKnownRowAttrs(config.profile)),
    toDOM: () => ['tr', { 'data-s1000d': 'row' }, 0],
  };
}

function createEntrySpec(config: NormalizedS1000DTableSchemaOptions): NodeSpec {
  return {
    content: config.entryContent,
    tableRole: 's1000d-entry',
    isolating: true,
    attrs: createAttrs(getKnownEntryAttrs(config.profile)),
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
