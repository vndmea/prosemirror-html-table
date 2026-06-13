import {
  colspecAttrs,
  entryAttrs,
  rowAttrs,
  spanspecAttrs,
  tableAttrs,
  tgroupAttrs,
} from './attrs.js';
import type { S1000DEntryBlockName } from './types.js';

export type S1000DTableProfile = 'proced' | 'extended';

const procedTableAttrs = ['frame', 'colsep', 'rowsep', 'applicRefId', 'id'] as const;
const procedTgroupAttrs = ['cols', 'colsep', 'rowsep', 'align', 'charoff', 'char'] as const;
const procedColspecAttrs = ['colname', 'align', 'colwidth'] as const;
const procedSectionAttrs = ['valign'] as const;
const procedRowAttrs = ['applicRefId', 'rowsep', 'id'] as const;
const procedEntryAttrs = ['colname', 'namest', 'nameend', 'morerows', 'colsep', 'rowsep', 'rotate', 'valign', 'align'] as const;
const procedEntryBlockNames = new Set<S1000DEntryBlockName>(['para', 'note']);
const extendedEntryBlockNames = new Set<S1000DEntryBlockName>(['para', 'warning', 'caution', 'note', 'legend']);
const procedDisallowedTableAttrs = new Set(['tabstyle', 'tocentry', 'orient', 'pgwide']);
const procedDisallowedTgroupAttrs = new Set(['tgstyle']);
const procedDisallowedColspecAttrs = new Set(['colnum', 'charoff', 'char', 'colsep', 'rowsep']);
const procedDisallowedRowAttrs = new Set(['changeType', 'changeMark', 'reasonForUpdateRefIds', 'reasonForUpdateRefs', 'authorityName', 'authorityDocument', 'securityClassification', 'commercialClassification', 'caveat']);
const procedDisallowedEntryAttrs = new Set(['spanname', 'applicRefId', 'charoff', 'char', 'id', 'warningRefs', 'cautionRefs']);

export function normalizeS1000DTableProfile(profile: S1000DTableProfile | undefined): S1000DTableProfile {
  return profile ?? 'proced';
}

export function allowsGraphicOnlyTable(profile: S1000DTableProfile | undefined): boolean {
  return normalizeS1000DTableProfile(profile) === 'extended';
}

export function allowsSpanspec(profile: S1000DTableProfile | undefined): boolean {
  return normalizeS1000DTableProfile(profile) === 'extended';
}

export function allowsTfoot(profile: S1000DTableProfile | undefined): boolean {
  return normalizeS1000DTableProfile(profile) === 'extended';
}

export function supportsGroupedTableAttrs(profile: S1000DTableProfile | undefined): boolean {
  return normalizeS1000DTableProfile(profile) === 'extended';
}

export function supportsGroupedRowAttrs(profile: S1000DTableProfile | undefined): boolean {
  return normalizeS1000DTableProfile(profile) === 'extended';
}

export function supportsEntryBlockName(
  profile: S1000DTableProfile | undefined,
  xmlName: string,
): xmlName is S1000DEntryBlockName {
  const names = normalizeS1000DTableProfile(profile) === 'extended'
    ? extendedEntryBlockNames
    : procedEntryBlockNames;
  return names.has(xmlName as S1000DEntryBlockName);
}

export function getKnownTableAttrs(profile: S1000DTableProfile | undefined): readonly string[] {
  return normalizeS1000DTableProfile(profile) === 'extended' ? tableAttrs : procedTableAttrs;
}

export function getKnownTgroupAttrs(profile: S1000DTableProfile | undefined): readonly string[] {
  return normalizeS1000DTableProfile(profile) === 'extended' ? tgroupAttrs : procedTgroupAttrs;
}

export function getKnownColspecAttrs(profile: S1000DTableProfile | undefined): readonly string[] {
  return normalizeS1000DTableProfile(profile) === 'extended' ? colspecAttrs : procedColspecAttrs;
}

export function getKnownSpanspecAttrs(_profile?: S1000DTableProfile | undefined): readonly string[] {
  void _profile;
  return spanspecAttrs;
}

export function getKnownSectionAttrs(_profile?: S1000DTableProfile | undefined): readonly string[] {
  void _profile;
  return procedSectionAttrs;
}

export function getKnownRowAttrs(profile: S1000DTableProfile | undefined): readonly string[] {
  return normalizeS1000DTableProfile(profile) === 'extended' ? rowAttrs : procedRowAttrs;
}

export function getKnownEntryAttrs(profile: S1000DTableProfile | undefined): readonly string[] {
  return normalizeS1000DTableProfile(profile) === 'extended' ? entryAttrs : procedEntryAttrs;
}

export function isKnownButDisallowedAttr(
  profile: S1000DTableProfile | undefined,
  elementName: string,
  attrName: string,
): boolean {
  if (normalizeS1000DTableProfile(profile) === 'extended') {
    return false;
  }

  if (elementName === 'table') return procedDisallowedTableAttrs.has(attrName);
  if (elementName === 'tgroup') return procedDisallowedTgroupAttrs.has(attrName);
  if (elementName === 'colspec') return procedDisallowedColspecAttrs.has(attrName);
  if (elementName === 'row') return procedDisallowedRowAttrs.has(attrName);
  if (elementName === 'entry') return procedDisallowedEntryAttrs.has(attrName);
  return false;
}
