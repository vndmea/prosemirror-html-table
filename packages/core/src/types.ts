import type { NodeSpec } from 'prosemirror-model';

import type { HtmlTableNodeNameKey } from './names.js';

export type HtmlTableNodeNames = Record<HtmlTableNodeNameKey, string>;

export type HtmlTableRenderedAttributes = Record<string, string | number | boolean>;

export interface HtmlTableCellAttributeSpec {
  default: unknown;
  parseHTML?: (element: HTMLElement) => unknown;
  renderHTML?: (attrs: Record<string, unknown>) => HtmlTableRenderedAttributes | null | undefined;
}

export type HtmlTableCellAttributes = Record<string, HtmlTableCellAttributeSpec>;

export interface HtmlTableSchemaOptions {
  names?: Partial<HtmlTableNodeNames>;
  cellContent?: string;
  captionContent?: string;
  tableGroup?: string;
  cellGroup?: string;
  cellAttributes?: HtmlTableCellAttributes;
}

export type HtmlTableNodeSpecs = Record<string, NodeSpec>;

export interface NormalizedHtmlTableSchemaOptions {
  names: HtmlTableNodeNames;
  cellContent: string;
  captionContent: string;
  tableGroup: string;
  cellGroup: string;
  cellAttributes: HtmlTableCellAttributes;
}
