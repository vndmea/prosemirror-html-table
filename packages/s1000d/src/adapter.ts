import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Selection } from 'prosemirror-state';

import { createS1000DTgroupGrid, type S1000DTgroupGrid } from './grid.js';
import { s1000dTableNodeNames } from './names.js';
import { createEmptyS1000DEntry, normalizeS1000DTable } from './normalize.js';
import { createS1000DTableMap, S1000DTableMap } from './table-map.js';

export interface S1000DTableAdapter {
  isTable: (node: ProseMirrorNode) => boolean;
  isTgroup: (node: ProseMirrorNode) => boolean;
  isGraphic: (node: ProseMirrorNode) => boolean;
  isRow: (node: ProseMirrorNode) => boolean;
  isEntry: (node: ProseMirrorNode) => boolean;
  getTgroups: (table: ProseMirrorNode) => ProseMirrorNode[];
  getActiveTgroup: (
    table: ProseMirrorNode,
    tablePosOrSelection?: number | Selection | null,
    selection?: Selection | null,
  ) => ProseMirrorNode | null;
  isGraphicOnlyTable: (table: ProseMirrorNode) => boolean;
  createGrid: (tgroup: ProseMirrorNode, tgroupIndex?: number) => S1000DTgroupGrid;
  createMap: (table: ProseMirrorNode, tgroupIndex?: number) => S1000DTableMap;
  createEmptyEntry: (table: ProseMirrorNode) => ProseMirrorNode;
  copyEntryWithSpan: (
    entry: ProseMirrorNode,
    attrs?: Partial<Record<'namest' | 'nameend' | 'spanname' | 'morerows', string | null>>,
  ) => ProseMirrorNode;
  normalizeTable: (table: ProseMirrorNode) => ProseMirrorNode;
}

export function createS1000DTableAdapter(): S1000DTableAdapter {
  return {
    isTable: (node) => node.type.name === s1000dTableNodeNames.table,
    isTgroup: (node) => node.type.name === s1000dTableNodeNames.tgroup,
    isGraphic: (node) => node.type.name === s1000dTableNodeNames.graphic,
    isRow: (node) => node.type.name === s1000dTableNodeNames.row,
    isEntry: (node) => node.type.name === s1000dTableNodeNames.entry,
    getTgroups,
    getActiveTgroup,
    isGraphicOnlyTable,
    createGrid: (tgroup, tgroupIndex = 0) => createS1000DTgroupGrid(tgroup, tgroupIndex),
    createMap: (table, tgroupIndex = 0) => createS1000DTableMap(table, tgroupIndex),
    createEmptyEntry: (table) => createEmptyS1000DEntry(table.type.schema),
    copyEntryWithSpan,
    normalizeTable: (table) => normalizeS1000DTable(table),
  };
}

function getTgroups(table: ProseMirrorNode): ProseMirrorNode[] {
  const tgroups: ProseMirrorNode[] = [];
  table.forEach((child) => {
    if (child.type.name === s1000dTableNodeNames.tgroup) {
      tgroups.push(child);
    }
  });
  return tgroups;
}

function getActiveTgroup(
  table: ProseMirrorNode,
  tablePosOrSelection?: number | Selection | null,
  maybeSelection?: Selection | null,
): ProseMirrorNode | null {
  const tgroups = getTgroups(table);
  if (tgroups.length === 0) return null;
  const selection = typeof tablePosOrSelection === 'number'
    ? (maybeSelection ?? null)
    : (tablePosOrSelection ?? maybeSelection ?? null);
  if (!selection) return tgroups[0] ?? null;
  const tablePos = typeof tablePosOrSelection === 'number'
    ? tablePosOrSelection
    : findTablePosFromSelection(table, selection);
  if (typeof tablePos !== 'number') return tgroups[0] ?? null;

  let matched: ProseMirrorNode | null = null;
  table.forEach((child, offset) => {
    if (matched || child.type.name !== s1000dTableNodeNames.tgroup) return;
    const childStart = tablePos + offset + 1;
    const childEnd = childStart + child.nodeSize;
    if (selection.from >= childStart && selection.to <= childEnd) {
      matched = child;
    }
  });

  return matched ?? tgroups[0] ?? null;
}

function findTablePosFromSelection(table: ProseMirrorNode, selection: Selection): number | undefined {
  for (let depth = selection.$from.depth; depth > 0; depth -= 1) {
    if (selection.$from.node(depth) === table) {
      return selection.$from.before(depth);
    }
  }

  return undefined;
}

function isGraphicOnlyTable(table: ProseMirrorNode): boolean {
  const tgroups = getTgroups(table);
  if (tgroups.length > 0) return false;

  let hasGraphic = false;
  table.forEach((child) => {
    if (child.type.name === s1000dTableNodeNames.graphic) {
      hasGraphic = true;
    }
  });

  return hasGraphic;
}

function copyEntryWithSpan(
  entry: ProseMirrorNode,
  attrs: Partial<Record<'namest' | 'nameend' | 'spanname' | 'morerows', string | null>> = {},
): ProseMirrorNode {
  return entry.type.create(
    {
      ...entry.attrs,
      ...attrs,
    },
    entry.content,
    entry.marks,
  );
}
