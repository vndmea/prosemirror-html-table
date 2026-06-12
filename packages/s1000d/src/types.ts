import type { NodeSpec } from 'prosemirror-model';
import type { S1000DTableNodeNames } from './names.js';

export type S1000DRawAttrs = Record<string, string>;

export interface S1000DTableAttrs {
  tabstyle: string | null;
  tocentry: string | null;
  frame: string | null;
  colsep: string | null;
  rowsep: string | null;
  orient: string | null;
  pgwide: string | null;
  applicRefId: string | null;
  id: string | null;
  changeAttrs: S1000DRawAttrs;
  authorityAttrs: S1000DRawAttrs;
  securityAttrs: S1000DRawAttrs;
  rawAttrs: S1000DRawAttrs;
}

export interface S1000DTgroupAttrs {
  applicRefId: string | null;
  cols: string | null;
  tgstyle: string | null;
  colsep: string | null;
  rowsep: string | null;
  align: string | null;
  charoff: string | null;
  char: string | null;
  rawAttrs: S1000DRawAttrs;
}

export interface S1000DColspecAttrs {
  colname: string | null;
  colnum: string | null;
  colwidth: string | null;
  colsep: string | null;
  rowsep: string | null;
  align: string | null;
  char: string | null;
  charoff: string | null;
  rawAttrs: S1000DRawAttrs;
}

export interface S1000DSpanspecAttrs {
  spanname: string | null;
  namest: string | null;
  nameend: string | null;
  colsep: string | null;
  rowsep: string | null;
  align: string | null;
  char: string | null;
  charoff: string | null;
  rawAttrs: S1000DRawAttrs;
}

export interface S1000DSectionAttrs {
  valign: string | null;
  rawAttrs: S1000DRawAttrs;
}

export interface S1000DRowAttrs {
  applicRefId: string | null;
  rowsep: string | null;
  id: string | null;
  changeAttrs: S1000DRawAttrs;
  securityAttrs: S1000DRawAttrs;
  authorityAttrs: S1000DRawAttrs;
  rawAttrs: S1000DRawAttrs;
}

export interface S1000DEntryAttrs {
  applicRefId: string | null;
  colname: string | null;
  namest: string | null;
  nameend: string | null;
  spanname: string | null;
  morerows: string | null;
  colsep: string | null;
  rowsep: string | null;
  rotate: string | null;
  valign: string | null;
  align: string | null;
  charoff: string | null;
  char: string | null;
  id: string | null;
  warningRefs: string | null;
  cautionRefs: string | null;
  rawAttrs: S1000DRawAttrs;
}

export interface S1000DGraphicAttrs {
  infoEntityIdent: string | null;
  rawAttrs: S1000DRawAttrs;
}

export interface S1000DTableSchemaOptions {
  names?: Partial<S1000DTableNodeNames>;
  tableGroup?: string;
  titleContent?: string;
  entryContent?: string;
}

export interface NormalizedS1000DTableSchemaOptions {
  names: S1000DTableNodeNames;
  tableGroup: string;
  titleContent: string;
  entryContent: string;
}

export type S1000DTableNodeSpecs = Record<string, NodeSpec>;

export interface ParseS1000DTableXmlOptions {
  names?: Partial<S1000DTableNodeNames>;
}

export interface SerializeS1000DTableXmlOptions {
  names?: Partial<S1000DTableNodeNames>;
}
