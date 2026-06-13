import type { EditorView } from '@tiptap/pm/view';

import { getTableOverlayMount, TableOverlayHost } from './table-interaction/overlay-host.js';

export class HtmlTableOverlayHost extends TableOverlayHost {
  constructor(root: HTMLDivElement) {
    super(root, {
      hostClassName: 'html-table-overlay-host',
      hostDataAttribute: 'data-html-table-overlay-host',
      hostDataValue: 'true',
    });
  }
}

export function getHtmlTableOverlayMount(view: Pick<EditorView, 'dom'>): HTMLElement {
  return getTableOverlayMount(view);
}
