import type { Node as ProseMirrorNode, ResolvedPos } from 'prosemirror-model';
import type { Command } from 'prosemirror-state';

import {
  setCellAttribute,
  toggleHeaderCell,
  toggleHeaderColumn,
  toggleHeaderRow,
  type HtmlTableCommandOptions,
} from './commands.js';

export interface FindNodeResult {
  node: ProseMirrorNode;
  pos: number;
  start: number;
  depth: number;
}

export type ToggleHeaderType = 'column' | 'row' | 'cell';

export interface ToggleHeaderOptions extends HtmlTableCommandOptions {
  useDeprecatedLogic?: boolean;
}

export function findTable($pos: ResolvedPos): FindNodeResult | null {
  for (let depth = $pos.depth; depth >= 0; depth -= 1) {
    const node = $pos.node(depth);
    if (node.type.spec.tableRole !== 'table') continue;

    return {
      node,
      pos: depth === 0 ? 0 : $pos.before(depth),
      start: $pos.start(depth),
      depth,
    };
  }

  return null;
}

export function findCellPos(doc: ProseMirrorNode, pos: number): ResolvedPos | undefined {
  const $pos = doc.resolve(pos);
  return cellAround($pos) ?? cellNear($pos);
}

export function setCellAttr(
  name: string,
  value: unknown,
  options: HtmlTableCommandOptions = {},
): Command {
  return setCellAttribute(name, value, options);
}

export function toggleHeader(
  type: ToggleHeaderType,
  options: ToggleHeaderOptions = {},
): Command {
  const { useDeprecatedLogic: _useDeprecatedLogic, ...commandOptions } = options;

  switch (type) {
    case 'row':
      return toggleHeaderRow(commandOptions);
    case 'column':
      return toggleHeaderColumn(commandOptions);
    case 'cell':
      return toggleHeaderCell(commandOptions);
    default:
      return () => false;
  }
}

function cellAround($pos: ResolvedPos): ResolvedPos | null {
  for (let depth = $pos.depth - 1; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.spec.tableRole === 'row') {
      return $pos.node(0).resolve($pos.before(depth + 1));
    }
  }

  return null;
}

function cellNear($pos: ResolvedPos): ResolvedPos | undefined {
  for (let after = $pos.nodeAfter, pos = $pos.pos; after; after = after.firstChild, pos += 1) {
    const role = after.type.spec.tableRole;
    if (role === 'cell' || role === 'header_cell') {
      return $pos.doc.resolve(pos);
    }
  }

  for (let before = $pos.nodeBefore, pos = $pos.pos; before; before = before.lastChild, pos -= 1) {
    const role = before.type.spec.tableRole;
    if (role === 'cell' || role === 'header_cell') {
      return $pos.doc.resolve(pos - before.nodeSize);
    }
  }

  return undefined;
}
