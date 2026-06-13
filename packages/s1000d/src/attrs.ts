import type { AttributeSpec } from 'prosemirror-model';
import type { XmlElement } from './xml/dom.js';

const changeAttrNames = new Set([
  'changeType',
  'changeMark',
  'reasonForUpdateRefIds',
  'reasonForUpdateRefs',
]);
const authorityAttrNames = new Set(['authorityName', 'authorityDocument']);
const securityAttrNames = new Set(['securityClassification', 'commercialClassification', 'caveat']);

export function createAttrs(names: readonly string[]): Record<string, AttributeSpec> {
  const attrs: Record<string, AttributeSpec> = {};

  for (const name of names) {
    attrs[name] = { default: null };
  }

  attrs.rawAttrs = { default: {} };
  return attrs;
}

export function createGroupedAttrs(names: readonly string[]): Record<string, AttributeSpec> {
  return {
    ...createAttrs(names),
    changeAttrs: { default: {} },
    authorityAttrs: { default: {} },
    securityAttrs: { default: {} },
  };
}

export function collectElementAttrs(element: XmlElement, knownAttrs: readonly string[]): Record<string, unknown> {
  const known = new Set(knownAttrs);
  const attrs: Record<string, unknown> = {};
  const rawAttrs: Record<string, string> = {};
  const changeAttrs: Record<string, string> = {};
  const authorityAttrs: Record<string, string> = {};
  const securityAttrs: Record<string, string> = {};

  for (const name of knownAttrs) {
    attrs[name] = element.getAttribute(name);
  }

  for (const attr of element.attributes) {
    if (known.has(attr.name)) continue;
    if (changeAttrNames.has(attr.name)) {
      changeAttrs[attr.name] = attr.value;
    } else if (authorityAttrNames.has(attr.name)) {
      authorityAttrs[attr.name] = attr.value;
    } else if (securityAttrNames.has(attr.name)) {
      securityAttrs[attr.name] = attr.value;
    } else {
      rawAttrs[attr.name] = attr.value;
    }
  }

  attrs.rawAttrs = rawAttrs;
  if (Object.keys(changeAttrs).length > 0) attrs.changeAttrs = changeAttrs;
  if (Object.keys(authorityAttrs).length > 0) attrs.authorityAttrs = authorityAttrs;
  if (Object.keys(securityAttrs).length > 0) attrs.securityAttrs = securityAttrs;
  return attrs;
}

export function renderXmlAttrs(attrs: Record<string, unknown>, knownAttrs: readonly string[]): string {
  const renderedAttrs: Record<string, string> = {};

  for (const groupName of ['rawAttrs', 'changeAttrs', 'authorityAttrs', 'securityAttrs']) {
    const groupedAttrs = attrs[groupName];
    if (isStringRecord(groupedAttrs)) {
      Object.assign(renderedAttrs, groupedAttrs);
    }
  }

  for (const name of knownAttrs) {
    const value = attrs[name];
    if (value == null || value === '') continue;
    renderedAttrs[name] = String(value);
  }

  return Object.entries(renderedAttrs)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => ` ${name}="${escapeXmlAttr(value)}"`)
    .join('');
}

export function isStringRecord(value: unknown): value is Record<string, string> {
  return !!value
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.values(value).every((item) => typeof item === 'string');
}

export function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeXmlAttr(value: string): string {
  return escapeXmlText(value).replace(/"/g, '&quot;');
}

export const tableAttrs = ['tabstyle', 'tocentry', 'frame', 'colsep', 'rowsep', 'orient', 'pgwide', 'applicRefId', 'id'] as const;
export const tgroupAttrs = ['applicRefId', 'cols', 'tgstyle', 'colsep', 'rowsep', 'align', 'charoff', 'char'] as const;
export const colspecAttrs = ['colname', 'colnum', 'colwidth', 'colsep', 'rowsep', 'align', 'char', 'charoff'] as const;
export const spanspecAttrs = ['spanname', 'namest', 'nameend', 'colsep', 'rowsep', 'align', 'char', 'charoff'] as const;
export const sectionAttrs = ['valign'] as const;
export const rowAttrs = ['applicRefId', 'rowsep', 'id'] as const;
export const entryAttrs = ['applicRefId', 'colname', 'namest', 'nameend', 'spanname', 'morerows', 'colsep', 'rowsep', 'rotate', 'valign', 'align', 'charoff', 'char', 'id', 'warningRefs', 'cautionRefs'] as const;
export const entryBlockAttrs = ['xmlName', 'rawXml', 'rawText'] as const;
export const graphicAttrs = ['infoEntityIdent'] as const;
