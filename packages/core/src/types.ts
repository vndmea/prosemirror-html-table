import type { NodeSpec } from 'prosemirror-model';

import type { HtmlTableNodeNameKey } from './names.js';

export type HtmlTableNodeNames = Record<HtmlTableNodeNameKey, string>;

export interface HtmlTableSchemaOptions {
  names?: Partial<HtmlTableNodeNames>;
  cellContent?: string;
  captionContent?: string;
  tableGroup?: string;
  cellGroup?: string;
}

export type HtmlTableNodeSpecs = Record<string, NodeSpec>;

export interface NormalizedHtmlTableSchemaOptions {
  names: HtmlTableNodeNames;
  cellContent: string;
  captionContent: string;
  tableGroup: string;
  cellGroup: string;
}
