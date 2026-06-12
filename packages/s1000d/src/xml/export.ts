import type { Node as ProseMirrorNode } from 'prosemirror-model';
import {
  colspecAttrs,
  entryAttrs,
  escapeXmlText,
  graphicAttrs,
  renderXmlAttrs,
  rowAttrs,
  sectionAttrs,
  spanspecAttrs,
  tableAttrs,
  tgroupAttrs,
} from '../attrs.js';
import { resolveS1000DTableNodeNames, type S1000DTableNodeNames } from '../names.js';
import type { SerializeS1000DTableXmlOptions } from '../types.js';

export function serializeS1000DTableXml(
  node: ProseMirrorNode,
  options: SerializeS1000DTableXmlOptions = {},
): string {
  return serializeNode(node, resolveS1000DTableNodeNames(options.names));
}

function serializeNode(node: ProseMirrorNode, names: S1000DTableNodeNames): string {
  switch (node.type.name) {
    case names.table:
      return serializeContainer('table', node, names, tableAttrs);
    case names.title:
      return serializeTextContainer('title', node);
    case names.tgroup:
      return serializeContainer('tgroup', node, names, tgroupAttrs);
    case names.colspec:
      return serializeLeaf('colspec', node, colspecAttrs);
    case names.spanspec:
      return serializeLeaf('spanspec', node, spanspecAttrs);
    case names.thead:
      return serializeContainer('thead', node, names, sectionAttrs);
    case names.tfoot:
      return serializeContainer('tfoot', node, names, sectionAttrs);
    case names.tbody:
      return serializeContainer('tbody', node, names, sectionAttrs);
    case names.row:
      return serializeContainer('row', node, names, rowAttrs);
    case names.entry:
      return serializeEntry(node);
    case names.graphic:
      return serializeLeaf('graphic', node, graphicAttrs);
    default:
      return escapeXmlText(node.textContent);
  }
}

function serializeContainer(
  xmlName: string,
  node: ProseMirrorNode,
  names: S1000DTableNodeNames,
  knownAttrs: readonly string[],
): string {
  return `<${xmlName}${renderXmlAttrs(node.attrs, knownAttrs)}>${serializeChildren(node, names)}</${xmlName}>`;
}

function serializeTextContainer(xmlName: string, node: ProseMirrorNode): string {
  return `<${xmlName}>${escapeXmlText(node.textContent)}</${xmlName}>`;
}

function serializeEntry(node: ProseMirrorNode): string {
  const content = node.childCount === 0
    ? ''
    : Array.from({ length: node.childCount }, (_value, index) => {
      const child = node.child(index);
      return `<para>${escapeXmlText(child.textContent)}</para>`;
    }).join('');

  return `<entry${renderXmlAttrs(node.attrs, entryAttrs)}>${content}</entry>`;
}

function serializeLeaf(xmlName: string, node: ProseMirrorNode, knownAttrs: readonly string[]): string {
  return `<${xmlName}${renderXmlAttrs(node.attrs, knownAttrs)}/>`;
}

function serializeChildren(node: ProseMirrorNode, names: S1000DTableNodeNames): string {
  const children: string[] = [];

  node.forEach((child) => {
    children.push(serializeNode(child, names));
  });

  return children.join('');
}
