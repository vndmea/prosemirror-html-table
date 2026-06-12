import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { s1000dTableNodeNames } from './names.js';

export interface S1000DTableAdapter {
  isTable: (node: ProseMirrorNode) => boolean;
  isTgroup: (node: ProseMirrorNode) => boolean;
  isGraphic: (node: ProseMirrorNode) => boolean;
  isRow: (node: ProseMirrorNode) => boolean;
  isEntry: (node: ProseMirrorNode) => boolean;
}

export function createS1000DTableAdapter(): S1000DTableAdapter {
  return {
    isTable: (node) => node.type.name === s1000dTableNodeNames.table,
    isTgroup: (node) => node.type.name === s1000dTableNodeNames.tgroup,
    isGraphic: (node) => node.type.name === s1000dTableNodeNames.graphic,
    isRow: (node) => node.type.name === s1000dTableNodeNames.row,
    isEntry: (node) => node.type.name === s1000dTableNodeNames.entry,
  };
}
