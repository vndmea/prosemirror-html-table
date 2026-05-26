import { Fragment, type Node as ProseMirrorNode } from 'prosemirror-model';

import { htmlTableNodeNames } from './names.js';
import type { HtmlTableNodeNames } from './types.js';

export interface NormalizeHtmlTableOptions {
  names?: Partial<HtmlTableNodeNames>;
}

interface SectionCellModel {
  columnIndex: number;
  colSpan: number;
  rowSpan: number;
  node: ProseMirrorNode;
}

interface SectionModel {
  rows: SectionCellModel[][];
  coverage: Array<Array<'anchor' | 'span' | null>>;
  width: number;
}

export function normalizeHtmlTable(
  table: ProseMirrorNode,
  options: NormalizeHtmlTableOptions = {},
): ProseMirrorNode {
  const names: HtmlTableNodeNames = {
    ...htmlTableNodeNames,
    ...options.names,
  };
  const schema = table.type.schema;
  const caption = findFirstChild(table, names.caption);
  const colgroup = findFirstChild(table, names.colgroup);
  const head = mergeSections(table, names, 'head');
  const bodies = collectSections(table, names.body);
  const foot = mergeSections(table, names, 'foot');

  const safeBodies = bodies.length > 0 ? bodies : [getNodeType(schema, names.body).create(null, [createEmptyRow(schema, names, 'body')])];
  const headModel = head ? analyzeSection(head) : undefined;
  const bodyModels = safeBodies.map((section) => analyzeSection(section));
  const footModel = foot ? analyzeSection(foot) : undefined;
  const targetWidth = Math.max(
    1,
    getColgroupWidth(colgroup),
    headModel?.width ?? 0,
    footModel?.width ?? 0,
    ...bodyModels.map((model) => model.width),
  );
  const tableChildren: ProseMirrorNode[] = [];

  if (caption) {
    tableChildren.push(caption);
  }

  if (colgroup) {
    tableChildren.push(normalizeColgroup(colgroup, targetWidth, names));
  }

  if (head) {
    tableChildren.push(rebuildSection(head, 'head', targetWidth, headModel ?? analyzeSection(head), names));
  }

  for (let index = 0; index < safeBodies.length; index += 1) {
    tableChildren.push(rebuildSection(safeBodies[index]!, 'body', targetWidth, bodyModels[index]!, names));
  }

  if (foot) {
    tableChildren.push(rebuildSection(foot, 'foot', targetWidth, footModel ?? analyzeSection(foot), names));
  }

  return table.type.create(table.attrs, tableChildren, table.marks);
}

function analyzeSection(section: ProseMirrorNode): SectionModel {
  const rows: SectionCellModel[][] = [];
  const coverage: Array<Array<'anchor' | 'span' | null>> = [];
  let activeRowSpans: number[] = [];
  let width = 0;

  section.forEach((row) => {
    const rowCells: SectionCellModel[] = [];
    const rowCoverage: Array<'anchor' | 'span' | null> = [];

    for (let columnIndex = 0; columnIndex < activeRowSpans.length; columnIndex += 1) {
      if ((activeRowSpans[columnIndex] ?? 0) > 0) {
        rowCoverage[columnIndex] = 'span';
      }
    }

    let columnIndex = firstFreeColumn(rowCoverage);

    row.forEach((cellNode) => {
      while (rowCoverage[columnIndex]) {
        columnIndex += 1;
      }

      const colSpan = getPositiveIntegerAttr(cellNode, 'colspan', 1);
      const rowSpan = getPositiveIntegerAttr(cellNode, 'rowspan', 1);
      rowCells.push({
        columnIndex,
        colSpan,
        rowSpan,
        node: cellNode,
      });

      for (let spanOffset = 0; spanOffset < colSpan; spanOffset += 1) {
        rowCoverage[columnIndex + spanOffset] = 'anchor';
      }

      columnIndex += colSpan;
    });

    width = Math.max(width, rowCoverage.length, columnIndex);
    rows.push(rowCells);
    coverage.push(rowCoverage);

    const nextSpans = activeRowSpans.map((count) => (count > 0 ? count - 1 : 0));

    for (const cell of rowCells) {
      const nextRowSpan = Math.max(0, Math.min(cell.rowSpan, section.childCount - rows.length + 1) - 1);
      for (let spanOffset = 0; spanOffset < cell.colSpan; spanOffset += 1) {
        nextSpans[cell.columnIndex + spanOffset] = Math.max(nextSpans[cell.columnIndex + spanOffset] ?? 0, nextRowSpan);
      }
    }

    activeRowSpans = nextSpans;
  });

  return {
    rows,
    coverage,
    width,
  };
}

function rebuildSection(
  section: ProseMirrorNode,
  sectionName: 'head' | 'body' | 'foot',
  targetWidth: number,
  model: SectionModel,
  names: HtmlTableNodeNames,
): ProseMirrorNode {
  const schema = section.type.schema;
  const rows: ProseMirrorNode[] = [];

  for (let rowIndex = 0; rowIndex < Math.max(1, section.childCount); rowIndex += 1) {
    const sourceRow = section.child(rowIndex) ?? getNodeType(schema, names.row).create();
    const rowCells = model.rows[rowIndex] ?? [];
    const rowCoverage = model.coverage[rowIndex] ?? [];
    const rowChildren: ProseMirrorNode[] = [];
    let columnIndex = 0;

    for (const cell of rowCells) {
      while (columnIndex < cell.columnIndex) {
        if ((rowCoverage[columnIndex] ?? null) === null) {
          rowChildren.push(createEmptyCell(schema, names, sectionName === 'head' ? 'header' : 'body'));
        }

        columnIndex += 1;
      }

      const clampedColSpan = Math.max(1, Math.min(cell.colSpan, targetWidth - cell.columnIndex));
      const clampedRowSpan = Math.max(1, Math.min(cell.rowSpan, section.childCount - rowIndex));
      rowChildren.push(
        copyCellWithAttrs(cell.node, {
          colspan: clampedColSpan,
          rowspan: clampedRowSpan,
          colwidth: normalizeColwidth(cell.node.attrs.colwidth, clampedColSpan),
        }),
      );
      columnIndex = cell.columnIndex + clampedColSpan;
    }

    while (columnIndex < targetWidth) {
      if ((rowCoverage[columnIndex] ?? null) === null) {
        rowChildren.push(createEmptyCell(schema, names, sectionName === 'head' ? 'header' : 'body'));
      }

      columnIndex += 1;
    }

    if (rowChildren.length === 0) {
      rowChildren.push(createEmptyCell(schema, names, sectionName === 'head' ? 'header' : 'body'));
    }

    rows.push(sourceRow.type.create(sourceRow.attrs, rowChildren, sourceRow.marks));
  }

  return section.type.create(section.attrs, rows, section.marks);
}

function normalizeColgroup(
  colgroup: ProseMirrorNode,
  targetWidth: number,
  names: HtmlTableNodeNames,
): ProseMirrorNode {
  const schema = colgroup.type.schema;
  const logicalColumns: ProseMirrorNode[] = [];

  colgroup.forEach((col) => {
    const span = getPositiveIntegerAttr(col, 'span', 1);

    for (let index = 0; index < span; index += 1) {
      logicalColumns.push(
        getNodeType(schema, names.col).create({
          span: null,
          width: col.attrs.width ?? null,
        }),
      );
    }
  });

  while (logicalColumns.length < targetWidth) {
    logicalColumns.push(getNodeType(schema, names.col).create());
  }

  return colgroup.type.create(colgroup.attrs, logicalColumns.slice(0, targetWidth), colgroup.marks);
}

function collectSections(table: ProseMirrorNode, sectionNodeName: string): ProseMirrorNode[] {
  const sections: ProseMirrorNode[] = [];

  table.forEach((child) => {
    if (child.type.name === sectionNodeName) {
      sections.push(child);
    }
  });

  return sections;
}

function mergeSections(
  table: ProseMirrorNode,
  names: HtmlTableNodeNames,
  sectionName: 'head' | 'foot',
): ProseMirrorNode | undefined {
  const nodeName = sectionName === 'head' ? names.head : names.foot;
  const sections = collectSections(table, nodeName);
  if (sections.length === 0) return undefined;
  if (sections.length === 1) return sections[0];

  const mergedRows: ProseMirrorNode[] = [];
  for (const section of sections) {
    section.forEach((row) => mergedRows.push(row));
  }

  return sections[0]!.type.create(sections[0]!.attrs, mergedRows, sections[0]!.marks);
}

function findFirstChild(table: ProseMirrorNode, nodeName: string): ProseMirrorNode | undefined {
  for (let index = 0; index < table.childCount; index += 1) {
    const child = table.child(index);
    if (child.type.name === nodeName) return child;
  }

  return undefined;
}

function getColgroupWidth(colgroup: ProseMirrorNode | undefined): number {
  if (!colgroup) return 0;

  let width = 0;
  colgroup.forEach((col) => {
    width += getPositiveIntegerAttr(col, 'span', 1);
  });

  return width;
}

function getPositiveIntegerAttr(node: ProseMirrorNode, name: string, fallback: number): number {
  const value = Number(node.attrs[name] ?? fallback);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function firstFreeColumn(rowCoverage: Array<'anchor' | 'span' | null>): number {
  let columnIndex = 0;

  while (rowCoverage[columnIndex]) {
    columnIndex += 1;
  }

  return columnIndex;
}

function normalizeColwidth(value: unknown, colSpan: number): number[] | null {
  if (!Array.isArray(value)) return null;

  const widths = value
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item > 0)
    .slice(0, colSpan);

  return widths.length > 0 ? widths : null;
}

function createEmptyRow(
  schema: ProseMirrorNode['type']['schema'],
  names: HtmlTableNodeNames,
  sectionName: 'head' | 'body' | 'foot',
): ProseMirrorNode {
  return getNodeType(schema, names.row).create(
    null,
    [createEmptyCell(schema, names, sectionName === 'head' ? 'header' : 'body')],
  );
}

function createEmptyCell(
  schema: ProseMirrorNode['type']['schema'],
  names: HtmlTableNodeNames,
  kind: 'header' | 'body',
): ProseMirrorNode {
  const cellType = getNodeType(schema, kind === 'header' ? names.headerCell : names.cell);
  const paragraph = schema.nodes.paragraph?.createAndFill();
  const cell = cellType.createAndFill(null, paragraph ? [paragraph] : undefined);

  if (!cell) {
    throw new Error(`Unable to create table cell node: ${cellType.name}`);
  }

  return cell;
}

function getNodeType(schema: ProseMirrorNode['type']['schema'], name: string) {
  const nodeType = schema.nodes[name];

  if (!nodeType) {
    throw new Error(`Missing node type in schema: ${name}`);
  }

  return nodeType;
}

function copyCellWithAttrs(cell: ProseMirrorNode, attrs: Record<string, unknown>): ProseMirrorNode {
  return cell.type.create(
    {
      ...cell.attrs,
      ...attrs,
    },
    cell.content.size > 0 ? cell.content : Fragment.empty,
    cell.marks,
  );
}
