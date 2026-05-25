import type { Schema, Node as ProseMirrorNode } from 'prosemirror-model';

import { htmlTableNodeNames, type HtmlTableNodeNames } from './names.js';

export interface CreateHtmlTableOptions {
  names?: Partial<HtmlTableNodeNames>;
  rows?: number;
  cols?: number;
  withHeaderRow?: boolean;
  withCaption?: boolean;
  captionText?: string;
}

export function createHtmlTableNode(schema: Schema, options: CreateHtmlTableOptions = {}): ProseMirrorNode {
  const names = {
    ...htmlTableNodeNames,
    ...options.names,
  };
  const rows = Math.max(1, options.rows ?? 3);
  const cols = Math.max(1, options.cols ?? 3);
  const bodyRows: ProseMirrorNode[] = [];
  const tableChildren: ProseMirrorNode[] = [];

  if (options.withCaption) {
    const captionContent = options.captionText ? schema.text(options.captionText) : undefined;
    tableChildren.push(schema.nodes[names.caption]!.create(null, captionContent));
  }

  for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
    const cells: ProseMirrorNode[] = [];
    const isHeaderRow = options.withHeaderRow === true && rowIndex === 0;

    for (let columnIndex = 0; columnIndex < cols; columnIndex += 1) {
      const cellType = isHeaderRow ? schema.nodes[names.headerCell]! : schema.nodes[names.cell]!;
      const paragraph = schema.nodes.paragraph?.createAndFill();
      cells.push(cellType.createAndFill(null, paragraph ? [paragraph] : undefined)!);
    }

    bodyRows.push(schema.nodes[names.row]!.create(null, cells));
  }

  tableChildren.push(schema.nodes[names.body]!.create(null, bodyRows));

  return schema.nodes[names.table]!.create(null, tableChildren);
}
