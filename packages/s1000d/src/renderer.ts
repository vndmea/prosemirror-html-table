import type { Node as ProseMirrorNode } from 'prosemirror-model';

import { isStringRecord } from './attrs.js';
import { resolveColspecs, resolveEntryColSpan, resolveEntryRowSpan, resolveNamedSpan, resolveSpanspecs, resolveTgroupColumnCount } from './cals/index.js';
import { createS1000DTgroupGrid, type S1000DEntryRef, type S1000DRowRef, type S1000DTableSectionName } from './grid.js';
import { s1000dTableNodeNames } from './names.js';
import { normalizeS1000DTable } from './normalize.js';
import { normalizeS1000DTableProfile, type S1000DTableProfile } from './profile.js';
import { validateS1000DTable } from './validation.js';

export interface RenderS1000DTableHtmlOptions {
  includeDataAttributes?: boolean;
  includeRawAttrs?: boolean;
  includeApplicabilityAttrs?: boolean;
  pretty?: boolean;
  strict?: boolean;
  profile?: S1000DTableProfile;
}

interface ResolvedRenderOptions {
  includeDataAttributes: boolean;
  includeRawAttrs: boolean;
  includeApplicabilityAttrs: boolean;
  pretty: boolean;
  strict: boolean;
  profile: S1000DTableProfile;
}

interface RenderContext {
  options: ResolvedRenderOptions;
  depth: number;
}

export function renderS1000DTableToHtml(
  table: ProseMirrorNode,
  options: RenderS1000DTableHtmlOptions = {},
): string {
  if (table.type.name !== s1000dTableNodeNames.table) {
    throw new TypeError(`renderS1000DTableToHtml expects a ${s1000dTableNodeNames.table} node.`);
  }

  const resolvedOptions = resolveRenderOptions(options);
  const normalizedTable = normalizeS1000DTable(table);

  if (resolvedOptions.strict) {
    const validation = validateS1000DTable(normalizedTable, { profile: resolvedOptions.profile });
    if (!validation.valid) {
      throw new Error(`Unable to render invalid S1000D table: ${validation.issues.map((issue) => issue.message).join('; ')}`);
    }
  }

  if (containsGraphicOnlyTable(normalizedTable)) {
    throw new Error('Graphic-only S1000D tables are not supported by the HTML renderer MVP.');
  }

  const context: RenderContext = { options: resolvedOptions, depth: 0 };
  const children: string[] = [];

  normalizedTable.forEach((child) => {
    if (child.type.name === s1000dTableNodeNames.title) {
      children.push(renderCaption(child, nextDepth(context)));
      return;
    }

    if (child.type.name === s1000dTableNodeNames.tgroup) {
      children.push(...renderTgroup(child, nextDepth(context)));
    }
  });

  return renderBlockElement('table', collectTableAttrs(normalizedTable, resolvedOptions), children, context);
}

function resolveRenderOptions(options: RenderS1000DTableHtmlOptions): ResolvedRenderOptions {
  return {
    includeDataAttributes: options.includeDataAttributes ?? false,
    includeRawAttrs: options.includeRawAttrs ?? false,
    includeApplicabilityAttrs: options.includeApplicabilityAttrs ?? false,
    pretty: options.pretty ?? false,
    strict: options.strict ?? false,
    profile: normalizeS1000DTableProfile(options.profile),
  };
}

function renderTgroup(tgroup: ProseMirrorNode, context: RenderContext): string[] {
  const colspecs = resolveColspecs(tgroup);
  const spanspecResolution = resolveSpanspecs(tgroup);
  const grid = createS1000DTgroupGrid(tgroup);
  const sectionOrder = getSectionNodesInOrder(tgroup);
  const rendered: string[] = [];

  if (colspecs.length > 0) {
    rendered.push(renderColgroup(colspecs, context));
  } else {
    const implicitColumnCount = Math.max(resolveTgroupColumnCount(tgroup), grid.width);
    if (implicitColumnCount > 0) {
      rendered.push(renderImplicitColgroup(implicitColumnCount, context));
    }
  }

  for (const section of sectionOrder) {
    rendered.push(renderSection(section, grid.rows, grid.entries, tgroup, colspecs, spanspecResolution.spanspecs, context));
  }

  return rendered;
}

function renderColgroup(
  colspecs: ReturnType<typeof resolveColspecs>,
  context: RenderContext,
): string {
  const children = colspecs.map((colspec) => {
    const attrs: Record<string, string> = {};
    const width = typeof colspec.node.attrs.colwidth === 'string' ? colspec.node.attrs.colwidth.trim() : '';
    if (width) {
      attrs.style = `width: ${width};`;
    }
    if (context.options.includeDataAttributes) {
      attrs['data-s1000d'] = 'colspec';
    }
    appendSafeOptionalAttrs(attrs, colspec.node.attrs, context.options);
    return renderVoidElement('col', attrs, nextDepth(context));
  });

  return renderBlockElement('colgroup', createDataAttrs(context.options, 'colgroup'), children, context);
}

function renderImplicitColgroup(columnCount: number, context: RenderContext): string {
  const children = Array.from({ length: columnCount }, () => renderVoidElement('col', {}, nextDepth(context)));
  return renderBlockElement('colgroup', createDataAttrs(context.options, 'colgroup'), children, context);
}

function renderSection(
  sectionNode: ProseMirrorNode,
  rows: readonly S1000DRowRef[],
  entries: readonly S1000DEntryRef[],
  tgroup: ProseMirrorNode,
  colspecs: ReturnType<typeof resolveColspecs>,
  spanspecs: ReturnType<typeof resolveSpanspecs>['spanspecs'],
  context: RenderContext,
): string {
  const sectionName = getSectionName(sectionNode.type.name);
  const rowChildren = rows
    .filter((row) => row.section === sectionName)
    .map((row) => renderRow(row, entries, tgroup, colspecs, spanspecs, nextDepth(context)));

  return renderBlockElement(sectionName, collectSectionAttrs(sectionNode, context.options, sectionName), rowChildren, context);
}

function renderRow(
  row: S1000DRowRef,
  entries: readonly S1000DEntryRef[],
  tgroup: ProseMirrorNode,
  colspecs: ReturnType<typeof resolveColspecs>,
  spanspecs: ReturnType<typeof resolveSpanspecs>['spanspecs'],
  context: RenderContext,
): string {
  const rowEntries = entries
    .filter((entry) => entry.rowIndex === row.rowIndex)
    .sort((left, right) => left.entryIndex - right.entryIndex);
  const children = rowEntries.map((entry) => renderEntry(entry, tgroup, colspecs, spanspecs, nextDepth(context)));
  return renderBlockElement('tr', collectRowAttrs(row.node, context.options), children, context);
}

function renderEntry(
  entry: S1000DEntryRef,
  tgroup: ProseMirrorNode,
  colspecs: ReturnType<typeof resolveColspecs>,
  spanspecs: ReturnType<typeof resolveSpanspecs>['spanspecs'],
  context: RenderContext,
): string {
  const attrs = collectEntryAttrs(entry.node, context.options);
  const namedSpan = resolveNamedSpan(entry.node, colspecs, spanspecs);
  const colSpan = namedSpan ? resolveEntryColSpan(entry.node, tgroup) : 1;
  const rowSpan = resolveEntryRowSpan(entry.node);

  if (colSpan > 1) {
    attrs.colspan = String(colSpan);
  }
  if (rowSpan > 1) {
    attrs.rowspan = String(rowSpan);
  }

  const blocks: string[] = [];
  entry.node.forEach((child) => {
    if (child.type.name === s1000dTableNodeNames.entryBlock) {
      blocks.push(renderEntryBlock(child, nextDepth(context)));
      return;
    }

    if (child.isText) {
      blocks.push(renderInlineParagraph(child.text ?? '', nextDepth(context)));
      return;
    }

    blocks.push(renderInlineParagraph(child.textContent, nextDepth(context)));
  });

  if (blocks.length === 0) {
    blocks.push(renderInlineParagraph('', nextDepth(context)));
  }

  return renderBlockElement('td', attrs, blocks, context);
}

function renderEntryBlock(node: ProseMirrorNode, context: RenderContext): string {
  const xmlName = typeof node.attrs.xmlName === 'string' ? node.attrs.xmlName : 'para';
  const text = node.textContent;

  switch (xmlName) {
    case 'para':
      return renderInlineElement('p', collectEntryBlockAttrs(node, context.options, 'para'), escapeHtmlText(text), context);
    case 'note':
      return renderInlineElement('div', collectEntryBlockAttrs(node, context.options, 'note', 'note'), escapeHtmlText(text), context);
    case 'warning':
      return renderInlineElement('div', collectEntryBlockAttrs(node, context.options, 'warning', 'warning'), escapeHtmlText(text), context);
    case 'caution':
      return renderInlineElement('div', collectEntryBlockAttrs(node, context.options, 'caution', 'caution'), escapeHtmlText(text), context);
    case 'legend':
      return renderInlineElement('div', collectEntryBlockAttrs(node, context.options, 'legend', 'legend'), escapeHtmlText(text), context);
    default:
      return renderInlineElement('div', collectEntryBlockAttrs(node, context.options, xmlName, 's1000d-entry-block'), escapeHtmlText(text), context);
  }
}

function renderCaption(node: ProseMirrorNode, context: RenderContext): string {
  return renderInlineElement('caption', createDataAttrs(context.options, 'title'), escapeHtmlText(node.textContent), context);
}

function renderInlineParagraph(text: string, context: RenderContext): string {
  return renderInlineElement('p', {}, escapeHtmlText(text), context);
}

function collectTableAttrs(node: ProseMirrorNode, options: ResolvedRenderOptions): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (typeof node.attrs.id === 'string' && node.attrs.id) {
    attrs.id = node.attrs.id;
  }
  if (options.includeDataAttributes) {
    attrs['data-s1000d'] = 'table';
  }
  appendApplicabilityAttrs(attrs, node.attrs, options);
  appendSafeOptionalAttrs(attrs, node.attrs, options);
  return attrs;
}

function collectSectionAttrs(
  node: ProseMirrorNode,
  options: ResolvedRenderOptions,
  sectionName: S1000DTableSectionName,
): Record<string, string> {
  const attrs = createDataAttrs(options, sectionName);
  if (typeof node.attrs.valign === 'string' && node.attrs.valign) {
    attrs.valign = node.attrs.valign;
  }
  appendSafeOptionalAttrs(attrs, node.attrs, options);
  return attrs;
}

function collectRowAttrs(node: ProseMirrorNode, options: ResolvedRenderOptions): Record<string, string> {
  const attrs = createDataAttrs(options, 'row');
  if (typeof node.attrs.id === 'string' && node.attrs.id) {
    attrs.id = node.attrs.id;
  }
  appendApplicabilityAttrs(attrs, node.attrs, options);
  appendSafeOptionalAttrs(attrs, node.attrs, options);
  return attrs;
}

function collectEntryAttrs(node: ProseMirrorNode, options: ResolvedRenderOptions): Record<string, string> {
  const attrs = createDataAttrs(options, 'entry');
  if (typeof node.attrs.id === 'string' && node.attrs.id) {
    attrs.id = node.attrs.id;
  }
  if (typeof node.attrs.align === 'string' && node.attrs.align) {
    attrs.align = node.attrs.align;
  }
  if (typeof node.attrs.valign === 'string' && node.attrs.valign) {
    attrs.valign = node.attrs.valign;
  }
  appendApplicabilityAttrs(attrs, node.attrs, options);
  appendSafeOptionalAttrs(attrs, node.attrs, options);
  return attrs;
}

function collectEntryBlockAttrs(
  node: ProseMirrorNode,
  options: ResolvedRenderOptions,
  xmlName: string,
  className?: string,
): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (className) {
    attrs.class = className;
  }
  if (options.includeDataAttributes) {
    attrs['data-s1000d'] = 'entry-block';
    attrs['data-s1000d-entry-block'] = xmlName;
  }
  appendSafeOptionalAttrs(attrs, node.attrs, options);
  return attrs;
}

function appendApplicabilityAttrs(
  attrs: Record<string, string>,
  nodeAttrs: Record<string, unknown>,
  options: ResolvedRenderOptions,
): void {
  if (!options.includeApplicabilityAttrs) return;

  if (typeof nodeAttrs.applicRefId === 'string' && nodeAttrs.applicRefId) {
    attrs['data-applic-ref-id'] = nodeAttrs.applicRefId;
  }
  if (typeof nodeAttrs.warningRefs === 'string' && nodeAttrs.warningRefs) {
    attrs['data-warning-refs'] = nodeAttrs.warningRefs;
  }
  if (typeof nodeAttrs.cautionRefs === 'string' && nodeAttrs.cautionRefs) {
    attrs['data-caution-refs'] = nodeAttrs.cautionRefs;
  }
}

function appendSafeOptionalAttrs(
  attrs: Record<string, string>,
  nodeAttrs: Record<string, unknown>,
  options: ResolvedRenderOptions,
): void {
  if (!options.includeRawAttrs) return;

  for (const groupName of ['rawAttrs', 'changeAttrs', 'authorityAttrs', 'securityAttrs'] as const) {
    const grouped = nodeAttrs[groupName];
    if (!isStringRecord(grouped)) continue;
    for (const [name, value] of Object.entries(grouped)) {
      if (shouldOmitRawAttr(name, value)) continue;
      attrs[name] = value;
    }
  }
}

function shouldOmitRawAttr(name: string, value: string): boolean {
  const lowerName = name.toLowerCase();
  const normalizedValue = value.trim().toLowerCase();
  if (!name || /^on/.test(lowerName)) return true;
  if (lowerName === 'style') return true;
  if (lowerName === 'data-s1000d' || lowerName === 'data-s1000d-entry-block') return true;
  if (/(?:^|[\s])javascript:/.test(normalizedValue)) return true;
  return false;
}

function renderBlockElement(
  tagName: string,
  attrs: Record<string, string>,
  children: readonly string[],
  context: RenderContext,
): string {
  const open = `${indent(context)}<${tagName}${renderHtmlAttrs(attrs)}>`;
  const close = `</${tagName}>`;
  if (children.length === 0) {
    return `${open}${close}`;
  }
  if (!context.options.pretty) {
    return `${open}${children.join('')}${close}`;
  }

  return [
    open,
    ...children,
    `${indent(context)}${close}`,
  ].join('\n');
}

function renderInlineElement(
  tagName: string,
  attrs: Record<string, string>,
  content: string,
  context: RenderContext,
): string {
  const prefix = context.options.pretty ? indent(context) : '';
  return `${prefix}<${tagName}${renderHtmlAttrs(attrs)}>${content}</${tagName}>`;
}

function renderVoidElement(tagName: string, attrs: Record<string, string>, context: RenderContext): string {
  const prefix = context.options.pretty ? indent(context) : '';
  return `${prefix}<${tagName}${renderHtmlAttrs(attrs)} />`;
}

function renderHtmlAttrs(attrs: Record<string, string>): string {
  return Object.entries(attrs)
    .filter((entry): entry is [string, string] => Boolean(entry[0]) && entry[1].length > 0)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => ` ${name}="${escapeHtmlAttr(value)}"`)
    .join('');
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeHtmlAttr(value: string): string {
  return escapeHtmlText(value);
}

function containsGraphicOnlyTable(table: ProseMirrorNode): boolean {
  let hasGraphic = false;
  table.forEach((child) => {
    if (child.type.name === s1000dTableNodeNames.graphic) {
      hasGraphic = true;
    }
  });
  return hasGraphic;
}

function getSectionNodesInOrder(tgroup: ProseMirrorNode): ProseMirrorNode[] {
  const sections: ProseMirrorNode[] = [];
  tgroup.forEach((child) => {
    if (child.type.name === s1000dTableNodeNames.thead
      || child.type.name === s1000dTableNodeNames.tbody
      || child.type.name === s1000dTableNodeNames.tfoot) {
      sections.push(child);
    }
  });
  return sections;
}

function getSectionName(typeName: string): S1000DTableSectionName {
  if (typeName === s1000dTableNodeNames.thead) return 'thead';
  if (typeName === s1000dTableNodeNames.tfoot) return 'tfoot';
  return 'tbody';
}

function createDataAttrs(options: ResolvedRenderOptions, value: string): Record<string, string> {
  return options.includeDataAttributes ? { 'data-s1000d': value } : {};
}

function indent(context: RenderContext): string {
  return context.options.pretty ? '  '.repeat(context.depth) : '';
}

function nextDepth(context: RenderContext): RenderContext {
  return {
    options: context.options,
    depth: context.depth + 1,
  };
}
