import type { Node as ProseMirrorNode } from 'prosemirror-model';
import {
  escapeXmlText,
  renderXmlAttrs,
} from '../attrs.js';
import { resolveS1000DTableNodeNames, type S1000DTableNodeNames } from '../names.js';
import {
  getKnownColspecAttrs,
  getKnownEntryAttrs,
  getKnownRowAttrs,
  getKnownSectionAttrs,
  getKnownSpanspecAttrs,
  getKnownTableAttrs,
  getKnownTgroupAttrs,
  normalizeS1000DTableProfile,
} from '../profile.js';
import type { SerializeS1000DTableXmlOptions } from '../types.js';

export function serializeS1000DTableXml(
  node: ProseMirrorNode,
  options: SerializeS1000DTableXmlOptions = {},
): string {
  return serializeNode(
    node,
    resolveS1000DTableNodeNames(options.names),
    normalizeS1000DTableProfile(options.profile),
  );
}

function serializeNode(node: ProseMirrorNode, names: S1000DTableNodeNames, profile: SerializeS1000DTableXmlOptions['profile']): string {
  switch (node.type.name) {
    case names.table:
      return serializeContainer('table', node, names, profile, getKnownTableAttrs(profile));
    case names.title:
      return serializeTextContainer('title', node);
    case names.tgroup:
      return serializeContainer('tgroup', node, names, profile, getKnownTgroupAttrs(profile));
    case names.colspec:
      return serializeLeaf('colspec', node, getKnownColspecAttrs(profile));
    case names.spanspec:
      return serializeLeaf('spanspec', node, getKnownSpanspecAttrs(profile));
    case names.thead:
      return serializeContainer('thead', node, names, profile, getKnownSectionAttrs(profile));
    case names.tfoot:
      return serializeContainer('tfoot', node, names, profile, getKnownSectionAttrs(profile));
    case names.tbody:
      return serializeContainer('tbody', node, names, profile, getKnownSectionAttrs(profile));
    case names.row:
      return serializeContainer('row', node, names, profile, getKnownRowAttrs(profile));
    case names.entry:
      return serializeEntry(node, names, getKnownEntryAttrs(profile));
    case names.graphic:
      return serializeLeaf('graphic', node, ['infoEntityIdent']);
    default:
      return escapeXmlText(node.textContent);
  }
}

function serializeContainer(
  xmlName: string,
  node: ProseMirrorNode,
  names: S1000DTableNodeNames,
  profile: SerializeS1000DTableXmlOptions['profile'],
  knownAttrs: readonly string[],
): string {
  return `<${xmlName}${renderXmlAttrs(node.attrs, knownAttrs)}>${serializeChildren(node, names, profile)}</${xmlName}>`;
}

function serializeTextContainer(xmlName: string, node: ProseMirrorNode): string {
  return `<${xmlName}>${escapeXmlText(node.textContent)}</${xmlName}>`;
}

function serializeEntry(node: ProseMirrorNode, names: S1000DTableNodeNames, knownAttrs: readonly string[]): string {
  const content = node.childCount === 0
    ? ''
    : Array.from({ length: node.childCount }, (_value, index) => {
      const child = node.child(index);
      if (child.type.name === names.entryBlock) {
        return serializeEntryBlock(child);
      }

      return `<para>${escapeXmlText(child.textContent)}</para>`;
    }).join('');

  return `<entry${renderXmlAttrs(node.attrs, knownAttrs)}>${content}</entry>`;
}

function serializeEntryBlock(node: ProseMirrorNode): string {
  const xmlName = typeof node.attrs.xmlName === 'string' ? node.attrs.xmlName : 'para';
  const rawXml = typeof node.attrs.rawXml === 'string' ? node.attrs.rawXml : null;
  const rawText = typeof node.attrs.rawText === 'string' ? node.attrs.rawText : null;

  if (rawXml !== null && rawText === node.textContent) {
    return `<${xmlName}${renderXmlAttrs(node.attrs, [])}>${rawXml}</${xmlName}>`;
  }

  return `<${xmlName}${renderXmlAttrs(node.attrs, [])}>${escapeXmlText(node.textContent)}</${xmlName}>`;
}

function serializeLeaf(xmlName: string, node: ProseMirrorNode, knownAttrs: readonly string[]): string {
  return `<${xmlName}${renderXmlAttrs(node.attrs, knownAttrs)}/>`;
}

function serializeChildren(
  node: ProseMirrorNode,
  names: S1000DTableNodeNames,
  profile: SerializeS1000DTableXmlOptions['profile'],
): string {
  const children: string[] = [];

  node.forEach((child) => {
    children.push(serializeNode(child, names, profile));
  });

  return children.join('');
}
