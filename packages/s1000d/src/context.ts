import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { NodeSelection, type EditorState, type Selection } from 'prosemirror-state';

import { createS1000DTableAdapter } from './adapter.js';
import { s1000dTableNodeNames } from './names.js';

export interface S1000DTableLookupOptions {
  tablePos?: number;
}

export interface LocatedS1000DTable {
  table: ProseMirrorNode;
  tablePos: number;
}

export interface S1000DTablePositionContext extends LocatedS1000DTable {
  activeTgroupIndex: number;
}

export interface S1000DMaybeActiveTableContext extends S1000DTablePositionContext {
  activeTgroup: ProseMirrorNode | null;
}

export interface S1000DActiveTableContext extends S1000DTablePositionContext {
  activeTgroup: ProseMirrorNode;
}

export interface S1000DResolvedTableContext extends LocatedS1000DTable {
  activeTgroup: ProseMirrorNode | null;
  activeTgroupIndex: number;
}

export function resolveS1000DTableContext(
  state: EditorState,
  options: S1000DTableLookupOptions = {},
): S1000DResolvedTableContext | null {
  const found = typeof options.tablePos === 'number'
    ? findS1000DTableByResolvedPos(state.doc, options.tablePos)
    : findS1000DTableAroundSelection(state.selection);
  if (!found) return null;

  return resolveActiveS1000DTableContext(found, state.selection);
}

export function resolveRequiredS1000DTableContext(
  state: EditorState,
  options: S1000DTableLookupOptions = {},
): S1000DActiveTableContext | null {
  const context = resolveS1000DTableContext(state, options);
  return hasActiveS1000DTgroup(context) ? context : null;
}

export function resolveActiveS1000DTableContext(
  located: LocatedS1000DTable,
  selection?: Selection | null,
): S1000DResolvedTableContext {
  const adapter = createS1000DTableAdapter();
  const activeTgroup = adapter.getActiveTgroup(located.table, located.tablePos, selection);
  const tgroups = adapter.getTgroups(located.table);
  const activeTgroupIndex = activeTgroup ? tgroups.findIndex((item) => item === activeTgroup) : -1;

  return {
    table: located.table,
    tablePos: located.tablePos,
    activeTgroup,
    activeTgroupIndex,
  };
}

export function hasActiveS1000DTgroup(
  context: S1000DMaybeActiveTableContext | S1000DResolvedTableContext | null | undefined,
): context is S1000DActiveTableContext {
  return Boolean(context?.activeTgroup && context.activeTgroupIndex >= 0);
}

export function findS1000DTableAroundSelection(selection: Selection): LocatedS1000DTable | null {
  if (selection instanceof NodeSelection && selection.node.type.name === s1000dTableNodeNames.table) {
    return { table: selection.node, tablePos: selection.from };
  }

  for (let depth = selection.$from.depth; depth >= 0; depth -= 1) {
    const node = selection.$from.node(depth);
    if (node.type.name !== s1000dTableNodeNames.table) continue;
    return {
      table: node,
      tablePos: depth > 0 ? selection.$from.before(depth) : 0,
    };
  }

  return null;
}

export function findS1000DTableByResolvedPos(doc: ProseMirrorNode, pos: number): LocatedS1000DTable | null {
  const clampedPos = Math.max(0, Math.min(pos, doc.content.size));
  const directNode = doc.nodeAt(clampedPos);
  if (directNode?.type.name === s1000dTableNodeNames.table) {
    return {
      table: directNode,
      tablePos: clampedPos,
    };
  }

  const resolved = doc.resolve(clampedPos);

  for (let depth = resolved.depth; depth >= 0; depth -= 1) {
    const node = resolved.node(depth);
    if (node.type.name !== s1000dTableNodeNames.table) continue;
    return {
      table: node,
      tablePos: depth > 0 ? resolved.before(depth) : 0,
    };
  }

  return null;
}

export function findS1000DAncestorNode(selection: Selection, typeName: string): ProseMirrorNode | undefined {
  for (let depth = selection.$from.depth; depth >= 0; depth -= 1) {
    const node = selection.$from.node(depth);
    if (node.type.name === typeName) {
      return node;
    }
  }

  return undefined;
}
