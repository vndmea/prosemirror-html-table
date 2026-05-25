import type { NodeSpec } from 'prosemirror-model';

import type { HtmlTableNodeNames } from './names.js';

export interface HtmlTableSchemaOptions {
  names?: Partial<HtmlTableNodeNames>;
  cellContent?: string;
  captionContent?: string;
  tableGroup?: string;
  cellGroup?: string;
}

export type HtmlTableNodeSpecs = Record<HtmlTableNodeNames[keyof HtmlTableNodeNames], NodeSpec>;

export interface NormalizedHtmlTableSchemaOptions {
  names: HtmlTableNodeNames;
  cellContent: string;
  captionContent: string;
  tableGroup: string;
  cellGroup: string;
}
