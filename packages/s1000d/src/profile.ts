import {
  colspecAttrs,
  entryAttrs,
  rowAttrs,
  sectionAttrs,
  spanspecAttrs,
  tableAttrs,
  tgroupAttrs,
} from './attrs.js';
import type { S1000DEntryBlockName } from './types.js';

export type S1000DTableProfile = 'proced' | 'extended';

const procedTableAttrs = ['frame', 'colsep', 'rowsep', 'applicRefId', 'id'] as const;
const procedTgroupAttrs = ['cols', 'colsep', 'rowsep', 'align', 'charoff', 'char'] as const;
const procedColspecAttrs = ['colname', 'align', 'colwidth'] as const;
const procedEntryAttrs = ['colname', 'namest', 'nameend', 'morerows', 'colsep', 'rowsep', 'rotate', 'valign', 'align'] as const;
const procedEntryBlockNames = new Set<S1000DEntryBlockName>(['para', 'note']);
const extendedEntryBlockNames = new Set<S1000DEntryBlockName>(['para', 'warning', 'caution', 'note', 'legend']);

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

export function getKnownSpanspecAttrs(_profile: S1000DTableProfile | undefined): readonly string[] {
  return spanspecAttrs;
}

export function getKnownSectionAttrs(_profile: S1000DTableProfile | undefined): readonly string[] {
  return sectionAttrs;
}

export function getKnownRowAttrs(profile: S1000DTableProfile | undefined): readonly string[] {
  return rowAttrs;
}

export function getKnownEntryAttrs(profile: S1000DTableProfile | undefined): readonly string[] {
  return normalizeS1000DTableProfile(profile) === 'extended' ? entryAttrs : procedEntryAttrs;
}
