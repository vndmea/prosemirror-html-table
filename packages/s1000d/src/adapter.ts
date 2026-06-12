import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Selection } from 'prosemirror-state';

import { createS1000DTgroupGrid, type S1000DTgroupGrid } from './grid.js';
import { s1000dTableNodeNames } from './names.js';
import { createS1000DTableMap, S1000DTableMap } from './table-map.js';

export interface S1000DTableAdapter {
  isTable: (node: ProseMirrorNode) => boolean;
  isTgroup: (node: ProseMirrorNode) => boolean;
  isGraphic: (node: ProseMirrorNode) => boolean;
  isRow: (node: ProseMirrorNode) => boolean;
  isEntry: (node: ProseMirrorNode) => boolean;
  getTgroups: (table: ProseMirrorNode) => ProseMirrorNode[];
  getActiveTgroup: (table: ProseMirrorNode, selection?: Selection | null) => ProseMirrorNode | null;
  isGraphicOnlyTable: (table: ProseMirrorNode) => boolean;
  createGrid: (tgroup: ProseMirrorNode, tgroupIndex?: number) => S1000DTgroupGrid;
  createMap: (table: ProseMirrorNode, tgroupIndex?: number) => S1000DTableMap;
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

function getActiveTgroup(table: ProseMirrorNode, selection?: Selection | null): ProseMirrorNode | null {
  const tgroups = getTgroups(table);
  if (tgroups.length === 0) return null;
  if (!selection) return tgroups[0] ?? null;

  let matched: ProseMirrorNode | null = null;
  table.forEach((child, offset) => {
    if (matched || child.type.name !== s1000dTableNodeNames.tgroup) return;
    const childStart = offset + 1;
    const childEnd = childStart + child.nodeSize - 1;
    if (selection.from >= childStart && selection.to <= childEnd) {
      matched = child;
    }
  });

  return matched ?? tgroups[0] ?? null;
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
