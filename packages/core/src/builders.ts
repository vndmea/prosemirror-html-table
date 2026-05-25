import type { Schema, Node as ProseMirrorNode } from 'prosemirror-model';

import { htmlTableNodeNames } from './names.js';
import type { HtmlTableNodeNames } from './types.js';

export interface CreateHtmlTableOptions {
  names?: Partial<HtmlTableNodeNames>;
  rows?: number;
  cols?: number;
  withHeaderRow?: boolean;
  withCaption?: boolean;
  captionText?: string;
}

export function createHtmlTableNode(schema: Schema, options: CreateHtmlTableOptions = {}): ProseMirrorNode {
  const names: HtmlTableNodeNames = {
    ...htmlTableNodeNames,
    ...options.names,
  };
  const rows = Math.max(1, options.rows ?? 3);
  const cols = Math.max(1, options.cols ?? 3);
  const bodyRows: ProseMirrorNode[] = [];
  const tableChildren: ProseMirrorNode[] = [];

  if (options.withCaption) {
    const captionContent = options.captionText ? schema.text(options.captionText) : undefined;
    tableChildren.push(getNodeType(schema, names.caption).create(null, captionContent));
  }

  for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
    const cells: ProseMirrorNode[] = [];
    const isHeaderRow = options.withHeaderRow === true && rowIndex === 0;

    for (let columnIndex = 0; columnIndex < cols; columnIndex += 1) {
      const cellType = getNodeType(schema, isHeaderRow ? names.headerCell : names.cell);
      const paragraph = schema.nodes.paragraph?.createAndFill();
      const cell = cellType.createAndFill(null, paragraph ? [paragraph] : undefined);

      if (!cell) {
        throw new Error(`Unable to create table cell node: ${cellType.name}`);
      }

      cells.push(cell);
    }

    bodyRows.push(getNodeType(schema, names.row).create(null, cells));
  }

  tableChildren.push(getNodeType(schema, names.body).create(null, bodyRows));

  return getNodeType(schema, names.table).create(null, tableChildren);
}

function getNodeType(schema: Schema, name: string) {
  const nodeType = schema.nodes[name];

  if (!nodeType) {
    throw new Error(`Missing node type in schema: ${name}`);
  }

  return nodeType;
}
