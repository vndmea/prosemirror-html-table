import { Fragment, type Node as ProseMirrorNode, type Schema } from 'prosemirror-model';

import { createS1000DTgroupGrid } from './grid.js';
import { s1000dTableNodeNames } from './names.js';

export function normalizeS1000DTable(table: ProseMirrorNode): ProseMirrorNode {
  const tableChildren: ProseMirrorNode[] = [];
  let hasTgroup = false;

  table.forEach((child) => {
    if (child.type.name === s1000dTableNodeNames.tgroup) {
      hasTgroup = true;
      tableChildren.push(normalizeS1000DTgroup(child));
      return;
    }

    tableChildren.push(child);
  });

  if (!hasTgroup) {
    return table;
  }

  return table.type.create(table.attrs, Fragment.fromArray(tableChildren), table.marks);
}

export function normalizeS1000DTgroup(tgroup: ProseMirrorNode): ProseMirrorNode {
  const schema = tgroup.type.schema;
  const grid = createS1000DTgroupGrid(tgroup);
  const targetWidth = Math.max(1, grid.width);
  const children: ProseMirrorNode[] = [];
  let rowIndex = 0;

  tgroup.forEach((child) => {
    if (child.type.name === s1000dTableNodeNames.thead
      || child.type.name === s1000dTableNodeNames.tbody
      || child.type.name === s1000dTableNodeNames.tfoot) {
      const normalizedSection = normalizeSection(child, schema, targetWidth, grid, rowIndex);
      rowIndex += child.childCount;
      children.push(normalizedSection);
      return;
    }

    children.push(child);
  });

  return tgroup.type.create(
    {
      ...tgroup.attrs,
      cols: String(targetWidth),
    },
    Fragment.fromArray(children),
    tgroup.marks,
  );
}

export function createEmptyS1000DEntry(
  schema: Schema,
  attrs: Record<string, unknown> = {},
): ProseMirrorNode {
  const entryType = schema.nodes[s1000dTableNodeNames.entry];
  if (!entryType) {
    throw new Error(`Missing node type in schema: ${s1000dTableNodeNames.entry}`);
  }

  const block = createEmptyS1000DEntryContent(schema);
  const entry = entryType.createAndFill(attrs, block ? [block] : undefined);
  if (!entry) {
    throw new Error(`Unable to create S1000D entry node: ${entryType.name}`);
  }

  return entry;
}

export function createEmptyS1000DEntryContent(schema: Schema): ProseMirrorNode | null {
  const entryBlockType = schema.nodes[s1000dTableNodeNames.entryBlock];
  if (entryBlockType) {
    const block = entryBlockType.createAndFill({ xmlName: 'para' });
    if (block) return block;
  }

  return schema.nodes.paragraph?.createAndFill() ?? null;
}

function normalizeSection(
  section: ProseMirrorNode,
  schema: Schema,
  targetWidth: number,
  grid: ReturnType<typeof createS1000DTgroupGrid>,
  startRowIndex: number,
): ProseMirrorNode {
  const rows: ProseMirrorNode[] = [];
  let generatedRowIndex = 0;
  let rowIndex = startRowIndex;

  section.forEach((row) => {
    const rowChildren: ProseMirrorNode[] = [];
    row.forEach((entry) => {
      rowChildren.push(entry);
    });

    let occupiedWidth = getOccupiedWidth(grid, rowIndex);
    while (occupiedWidth < targetWidth) {
      rowChildren.push(createEmptyS1000DEntry(schema));
      occupiedWidth += 1;
    }

    rows.push(row.type.create(row.attrs, Fragment.fromArray(rowChildren), row.marks));
    rowIndex += 1;
  });

  if (rows.length === 0) {
    const rowType = schema.nodes[s1000dTableNodeNames.row];
    if (!rowType) {
      throw new Error(`Missing node type in schema: ${s1000dTableNodeNames.row}`);
    }
    rows.push(rowType.create(
      { id: `row-generated-${generatedRowIndex}` },
      Array.from({ length: targetWidth }, () => createEmptyS1000DEntry(schema)),
    ));
    generatedRowIndex += 1;
  }

  return section.type.create(section.attrs, Fragment.fromArray(rows), section.marks);
}

function getOccupiedWidth(
  grid: ReturnType<typeof createS1000DTgroupGrid>,
  rowIndex: number,
): number {
  const row = grid.slots[rowIndex];
  if (!row) return 0;

  for (let index = row.length - 1; index >= 0; index -= 1) {
    if (row[index]) {
      return index + 1;
    }
  }

  return 0;
}
