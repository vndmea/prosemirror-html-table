import { Plugin, PluginKey } from 'prosemirror-state';

import {
  S1000DTableOverlayView,
  type S1000DTableOverlayPluginOptions,
} from './s1000d-overlay-view.js';
export type { TableGeometry, TableOverlayPositionState } from 'tiptap-html-table/table-interaction';

export const s1000dTableOverlayPluginKey = new PluginKey('s1000d-table-overlay');

export type { S1000DTableOverlayPluginOptions } from './s1000d-overlay-view.js';

export { applyS1000DColumnWidthsToTgroup } from './column-widths.js';

export function createS1000DTableOverlayPlugin(
  options: S1000DTableOverlayPluginOptions = {},
): Plugin {
  return new Plugin({
    key: s1000dTableOverlayPluginKey,
    view(view) {
      return new S1000DTableOverlayView(view, options);
    },
  });
}
