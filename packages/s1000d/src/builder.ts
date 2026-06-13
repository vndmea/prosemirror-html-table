import { Fragment, type Node as ProseMirrorNode, type Schema } from 'prosemirror-model';

import { createEmptyS1000DEntry } from './normalize.js';
import { s1000dTableNodeNames } from './names.js';

export interface CreateS1000DTableOptions {
  rows?: number;
  cols?: number;
  withTitle?: boolean;
  titleText?: string;
}

export function createS1000DTableNode(
  schema: Schema,
  options: CreateS1000DTableOptions = {},
): ProseMirrorNode {
  const rows = Math.max(1, options.rows ?? 3);
  const cols = Math.max(1, options.cols ?? 3);
  const tableType = getNodeType(schema, s1000dTableNodeNames.table);
  const titleType = schema.nodes[s1000dTableNodeNames.title];
  const tgroupType = getNodeType(schema, s1000dTableNodeNames.tgroup);
  const tbodyType = getNodeType(schema, s1000dTableNodeNames.tbody);
  const rowType = getNodeType(schema, s1000dTableNodeNames.row);
  const children: ProseMirrorNode[] = [];

  if (options.withTitle && titleType) {
    children.push(titleType.create(null, options.titleText ? schema.text(options.titleText) : undefined));
  }

  const bodyRows = Array.from({ length: rows }, () =>
    rowType.create(
      null,
      Fragment.fromArray(Array.from({ length: cols }, () => createEmptyS1000DEntry(schema))),
    ));
  const tbody = tbodyType.create(null, Fragment.fromArray(bodyRows));
  const tgroup = tgroupType.create({ cols: String(cols) }, Fragment.fromArray([tbody]));
  children.push(tgroup);

  return tableType.create(null, Fragment.fromArray(children));
}

function getNodeType(schema: Schema, name: string) {
  const nodeType = schema.nodes[name];
  if (!nodeType) {
    throw new Error(`Missing node type in schema: ${name}`);
  }
  return nodeType;
}
