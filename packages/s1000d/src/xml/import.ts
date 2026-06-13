import type { Node as ProseMirrorNode, Schema } from 'prosemirror-model';
import {
  collectElementAttrs,
  entryBlockAttrs,
} from '../attrs.js';
import { resolveS1000DTableNodeNames, type S1000DTableNodeNames } from '../names.js';
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
  isKnownButDisallowedAttr,
  normalizeS1000DTableProfile,
  supportsEntryBlockName,
  type S1000DTableProfile,
} from '../profile.js';
import type { ParseS1000DTableXmlOptions } from '../types.js';
import { childElements, firstChildElement, getDirectText, parseXmlDocument, serializeXmlChildren, type XmlElement } from './dom.js';

export function parseS1000DTableXml(
  xml: string,
  schema: Schema,
  options: ParseS1000DTableXmlOptions = {},
): ProseMirrorNode {
  const table = parseXmlDocument(xml);
  if (table.localName !== 'table') {
    throw new Error('Expected S1000D <table> root element');
  }

  const profile = normalizeS1000DTableProfile(options.profile);
  return parseTableElement(table, schema, resolveS1000DTableNodeNames(options.names), profile);
}

function parseTableElement(
  element: XmlElement,
  schema: Schema,
  names: S1000DTableNodeNames,
  profile: S1000DTableProfile,
): ProseMirrorNode {
  assertNoDisallowedAttrs(element, profile);
  const children: ProseMirrorNode[] = [];
  const title = firstChildElement(element, 'title');
  const tgroups = childElements(element, 'tgroup');
  const graphics = childElements(element, 'graphic');

  if (title) children.push(createTextContainer(schema, names.title, getDirectText(title)));

  if (tgroups.length > 0) {
    children.push(...tgroups.map((tgroup) => parseTgroupElement(tgroup, schema, names, profile)));
  } else {
    if (!allowsGraphicOnlyTable(profile) && graphics.length > 0) {
      throw new Error('S1000D table XML import does not allow graphic-only tables in proced profile.');
    }
    children.push(...graphics.map((graphic) => createLeaf(schema, names.graphic, collectElementAttrs(graphic, ['infoEntityIdent']))));
  }

  return createNode(schema, names.table, collectElementAttrs(element, getKnownTableAttrs(profile)), children);
}

function parseTgroupElement(
  element: XmlElement,
  schema: Schema,
  names: S1000DTableNodeNames,
  profile: S1000DTableProfile,
): ProseMirrorNode {
  assertNoDisallowedAttrs(element, profile);
  const children: ProseMirrorNode[] = [];

  for (const child of childElements(element)) {
    switch (child.localName) {
      case 'colspec':
        assertNoDisallowedAttrs(child, profile);
        children.push(createLeaf(schema, names.colspec, collectElementAttrs(child, getKnownColspecAttrs(profile))));
        break;
      case 'spanspec':
        if (!allowsSpanspec(profile)) {
          throw new Error('S1000D table XML import does not allow <spanspec> in proced profile.');
        }
        assertNoDisallowedAttrs(child, profile);
        children.push(createLeaf(schema, names.spanspec, collectElementAttrs(child, getKnownSpanspecAttrs(profile))));
        break;
      case 'thead':
        children.push(parseSectionElement(child, schema, names, names.thead, profile));
        break;
      case 'tfoot':
        if (!allowsTfoot(profile)) {
          throw new Error('S1000D table XML import does not allow <tfoot> in proced profile.');
        }
        children.push(parseSectionElement(child, schema, names, names.tfoot, profile));
        break;
      case 'tbody':
        children.push(parseSectionElement(child, schema, names, names.tbody, profile));
        break;
      default:
        break;
    }
  }

  return createNode(schema, names.tgroup, collectElementAttrs(element, getKnownTgroupAttrs(profile)), children);
}

function parseSectionElement(
  element: XmlElement,
  schema: Schema,
  names: S1000DTableNodeNames,
  nodeName: string,
  profile: S1000DTableProfile,
): ProseMirrorNode {
  assertNoDisallowedAttrs(element, profile);
  const children = childElements(element).flatMap((child) => {
    if (child.localName === 'colspec') {
      return [createLeaf(schema, names.colspec, collectElementAttrs(child, getKnownColspecAttrs(profile)))];
    }
    if (child.localName === 'row') {
      return [parseRowElement(child, schema, names, profile)];
    }
    return [];
  });

  return createNode(schema, nodeName, collectElementAttrs(element, getKnownSectionAttrs(profile)), children);
}

function parseRowElement(
  element: XmlElement,
  schema: Schema,
  names: S1000DTableNodeNames,
  profile: S1000DTableProfile,
): ProseMirrorNode {
  assertNoDisallowedAttrs(element, profile);
  const children = childElements(element, 'entry').map((entry) => parseEntryElement(entry, schema, names, profile));
  return createNode(schema, names.row, collectElementAttrs(element, getKnownRowAttrs(profile)), children);
}

function parseEntryElement(
  element: XmlElement,
  schema: Schema,
  names: S1000DTableNodeNames,
  profile: S1000DTableProfile,
): ProseMirrorNode {
  assertNoDisallowedAttrs(element, profile);
  const children: ProseMirrorNode[] = [];

  for (const child of childElements(element)) {
    children.push(createEntryBlock(schema, names, child, profile));
  }

  const directText = getDirectText(element);
  if (directText) children.unshift(createEntryBlockFromText(schema, names, 'para', directText));

  return createNode(schema, names.entry, collectElementAttrs(element, getKnownEntryAttrs(profile)), children);
}

function createTextContainer(schema: Schema, nodeName: string, text: string): ProseMirrorNode {
  const content = text ? schema.text(text) : undefined;
  return createNode(schema, nodeName, {}, content ? [content] : []);
}

function createEntryBlock(
  schema: Schema,
  names: S1000DTableNodeNames,
  element: XmlElement,
  profile: S1000DTableProfile,
): ProseMirrorNode {
  if (!supportsEntryBlockName(profile, element.localName)) {
    throw new Error(`S1000D table XML import does not allow <${element.localName}> in ${profile} profile.`);
  }

  return createEntryBlockFromText(
    schema,
    names,
    element.localName,
    element.textContent.trim(),
    {
      ...collectElementAttrs(element, entryBlockAttrs),
      rawXml: serializeXmlChildren(element) || null,
      rawText: element.textContent.trim() || null,
    },
  );
}

function createEntryBlockFromText(
  schema: Schema,
  names: S1000DTableNodeNames,
  xmlName: string,
  text: string,
  attrs: Record<string, unknown> = {},
): ProseMirrorNode {
  const nodeType = schema.nodes[names.entryBlock] ?? schema.nodes.paragraph;
  if (!nodeType) {
    throw new Error('S1000D table XML import requires s1000dEntryBlock or paragraph node for entry content.');
  }

  if (nodeType.name === names.entryBlock) {
    return nodeType.create(
      { ...attrs, xmlName },
      text ? schema.text(text) : undefined,
    );
  }

  return nodeType.create(null, text ? schema.text(text) : undefined);
}

function assertNoDisallowedAttrs(
  element: XmlElement,
  profile: S1000DTableProfile,
): void {
  for (const attr of element.attributes) {
    if (isKnownButDisallowedAttr(profile, element.localName, attr.name)) {
      throw new Error(`S1000D table XML import does not allow ${element.localName}@${attr.name} in ${profile} profile.`);
    }
  }
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

