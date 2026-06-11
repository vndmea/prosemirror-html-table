import type { Node as ProseMirrorNode } from 'prosemirror-model';

import type { HtmlTableNodeNames } from './types.js';

export const htmlTableNodeNames = {
  table: 'htmlTable',
  caption: 'htmlTableCaption',
  colgroup: 'htmlTableColgroup',
  col: 'htmlTableCol',
  head: 'htmlTableHead',
  body: 'htmlTableBody',
  foot: 'htmlTableFoot',
  row: 'htmlTableRow',
  headerCell: 'htmlTableHeaderCell',
  cell: 'htmlTableCell',
} as const;

export type HtmlTableNodeNameKey = keyof typeof htmlTableNodeNames;

const tableRoleToNameKey = {
  table: 'table',
  caption: 'caption',
  colgroup: 'colgroup',
  col: 'col',
  head: 'head',
  body: 'body',
  foot: 'foot',
  row: 'row',
  header_cell: 'headerCell',
  cell: 'cell',
} as const;

type HtmlTableRole = keyof typeof tableRoleToNameKey;

export function resolveHtmlTableNodeNames(names?: Partial<HtmlTableNodeNames>): HtmlTableNodeNames {
  return {
    ...htmlTableNodeNames,
    ...names,
  };
}

export function inferHtmlTableNodeNames(
  node: ProseMirrorNode,
  names?: Partial<HtmlTableNodeNames>,
): HtmlTableNodeNames {
  const resolved = resolveHtmlTableNodeNames(names);
  applyNodeRoleName(resolved, node);

  node.descendants((child) => {
    applyNodeRoleName(resolved, child);
    return true;
  });

  return resolved;
}

function applyNodeRoleName(names: HtmlTableNodeNames, node: ProseMirrorNode): void {
  const role = node.type.spec.tableRole;
  if (!isHtmlTableRole(role)) return;

  names[tableRoleToNameKey[role]] = node.type.name;
}

function isHtmlTableRole(value: unknown): value is HtmlTableRole {
  return typeof value === 'string' && value in tableRoleToNameKey;
}
