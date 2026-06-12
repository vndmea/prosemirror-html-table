import type { Node as ProseMirrorNode, Schema } from 'prosemirror-model';
import {
  collectElementAttrs,
  colspecAttrs,
  entryAttrs,
  graphicAttrs,
  rowAttrs,
  sectionAttrs,
  spanspecAttrs,
  tableAttrs,
  tgroupAttrs,
} from '../attrs.js';
import { resolveS1000DTableNodeNames, type S1000DTableNodeNames } from '../names.js';
import type { ParseS1000DTableXmlOptions } from '../types.js';
import { childElements, firstChildElement, getDirectText, parseXmlDocument, type XmlElement } from './dom.js';

export function parseS1000DTableXml(
  xml: string,
  schema: Schema,
  options: ParseS1000DTableXmlOptions = {},
): ProseMirrorNode {
  const table = parseXmlDocument(xml);
  if (table.localName !== 'table') {
    throw new Error('Expected S1000D <table> root element');
  }

  return parseTableElement(table, schema, resolveS1000DTableNodeNames(options.names));
}

function parseTableElement(
  element: XmlElement,
  schema: Schema,
  names: S1000DTableNodeNames,
): ProseMirrorNode {
  const children: ProseMirrorNode[] = [];
  const title = firstChildElement(element, 'title');
  const tgroups = childElements(element, 'tgroup');
  const graphics = childElements(element, 'graphic');

  if (title) children.push(createTextContainer(schema, names.title, getDirectText(title)));

  if (tgroups.length > 0) {
    children.push(...tgroups.map((tgroup) => parseTgroupElement(tgroup, schema, names)));
  } else {
    children.push(...graphics.map((graphic) => createLeaf(schema, names.graphic, collectElementAttrs(graphic, graphicAttrs))));
  }

  return createNode(schema, names.table, collectElementAttrs(element, tableAttrs), children);
}

function parseTgroupElement(
  element: XmlElement,
  schema: Schema,
  names: S1000DTableNodeNames,
): ProseMirrorNode {
  const children: ProseMirrorNode[] = [];

  for (const child of childElements(element)) {
    switch (child.localName) {
      case 'colspec':
        children.push(createLeaf(schema, names.colspec, collectElementAttrs(child, colspecAttrs)));
        break;
      case 'spanspec':
        children.push(createLeaf(schema, names.spanspec, collectElementAttrs(child, spanspecAttrs)));
        break;
      case 'thead':
        children.push(parseSectionElement(child, schema, names, names.thead));
        break;
      case 'tfoot':
        children.push(parseSectionElement(child, schema, names, names.tfoot));
        break;
      case 'tbody':
        children.push(parseSectionElement(child, schema, names, names.tbody));
        break;
      default:
        break;
    }
  }

  return createNode(schema, names.tgroup, collectElementAttrs(element, tgroupAttrs), children);
}

function parseSectionElement(
  element: XmlElement,
  schema: Schema,
  names: S1000DTableNodeNames,
  nodeName: string,
): ProseMirrorNode {
  const children = childElements(element).flatMap((child) => {
    if (child.localName === 'colspec') {
      return [createLeaf(schema, names.colspec, collectElementAttrs(child, colspecAttrs))];
    }
    if (child.localName === 'row') {
      return [parseRowElement(child, schema, names)];
    }
    return [];
  });

  return createNode(schema, nodeName, collectElementAttrs(element, sectionAttrs), children);
}

function parseRowElement(
  element: XmlElement,
  schema: Schema,
  names: S1000DTableNodeNames,
): ProseMirrorNode {
  const children = childElements(element, 'entry').map((entry) => parseEntryElement(entry, schema, names));
  return createNode(schema, names.row, collectElementAttrs(element, rowAttrs), children);
}

function parseEntryElement(
  element: XmlElement,
  schema: Schema,
  names: S1000DTableNodeNames,
): ProseMirrorNode {
  const children: ProseMirrorNode[] = [];

  for (const child of childElements(element)) {
    const text = child.textContent?.trim() ?? '';
    if (text) children.push(createFallbackBlock(schema, text));
  }

  const directText = getDirectText(element);
  if (directText) children.unshift(createFallbackBlock(schema, directText));

  return createNode(schema, names.entry, collectElementAttrs(element, entryAttrs), children);
}

function createTextContainer(schema: Schema, nodeName: string, text: string): ProseMirrorNode {
  const content = text ? schema.text(text) : undefined;
  return createNode(schema, nodeName, {}, content ? [content] : []);
}

function createFallbackBlock(schema: Schema, text: string): ProseMirrorNode {
  const paragraphType = schema.nodes.paragraph;
  if (!paragraphType) {
    throw new Error('S1000D table XML import requires a paragraph node for fallback entry content.');
  }

  return paragraphType.create(null, text ? schema.text(text) : undefined);
}

function createLeaf(schema: Schema, nodeName: string, attrs: Record<string, unknown>): ProseMirrorNode {
  return createNode(schema, nodeName, attrs, []);
}

function createNode(
  schema: Schema,
  nodeName: string,
  attrs: Record<string, unknown>,
  children: ProseMirrorNode[],
): ProseMirrorNode {
  const nodeType = schema.nodes[nodeName];
  if (!nodeType) throw new Error(`Missing S1000D node type: ${nodeName}`);

  return nodeType.create(attrs, children.length > 0 ? children : undefined);
}
