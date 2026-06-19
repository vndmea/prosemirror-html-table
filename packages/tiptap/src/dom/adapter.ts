import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

import type { TableDOMContext, TableDomAdapter } from '../table-interaction/dom-adapter.js';

const HTML_TABLE_NODE_NAME = 'htmlTable';
const HTML_TABLE_SELECTOR = '[data-html-table], table';
const HTML_TABLE_WRAPPER_SELECTOR = '[data-html-table-wrapper], .html-table-node__wrapper';

export type HtmlTableDOMContext = TableDOMContext<ProseMirrorNode>;

export const htmlTableDomAdapter: TableDomAdapter<ProseMirrorNode> = {
  nodeName: HTML_TABLE_NODE_NAME,
  tableSelector: HTML_TABLE_SELECTOR,
  wrapperSelector: HTML_TABLE_WRAPPER_SELECTOR,
  createContext(context) {
    return context;
  },
};
