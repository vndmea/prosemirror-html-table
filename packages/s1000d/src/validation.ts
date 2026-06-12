import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { allowsGraphicOnlyTable, allowsSpanspec, allowsTfoot, normalizeS1000DTableProfile, type S1000DTableProfile } from './profile.js';
import { s1000dTableNodeNames } from './names.js';
import { findColspecIndex, resolveColspecs } from './cals/colspec.js';
import { findSpanspec, resolveSpanspecs } from './cals/spanspec.js';
import { resolveEntryColSpan, resolveEntryColumn, resolveEntryRowSpan, resolveTgroupColumnCount } from './cals/grid.js';

export interface S1000DTableValidationIssue {
  path: string;
  message: string;
}

export interface S1000DTableValidationResult {
  valid: boolean;
  issues: S1000DTableValidationIssue[];
}

export interface S1000DTableValidationOptions {
  profile?: S1000DTableProfile;
}

export function validateS1000DTable(
  node: ProseMirrorNode,
  options: S1000DTableValidationOptions = {},
): S1000DTableValidationResult {
  const issues: S1000DTableValidationIssue[] = [];
  const profile = normalizeS1000DTableProfile(options.profile);

  if (node.type.name === s1000dTableNodeNames.table) {
    validateTableNode(node, 'table', issues, profile);
  }

  node.descendants((child, _pos, parent, index) => {
    if (child.type.name === s1000dTableNodeNames.table) {
      validateTableNode(child, `table[${index}]`, issues, profile);
      return true;
    }
    if (child.type.name !== s1000dTableNodeNames.tgroup) return true;
    validateTgroup(child, `tgroup[${index}]`, issues, profile);
    return false;
  });

  return {
    valid: issues.length === 0,
    issues,
  };
}

function validateTableNode(
  table: ProseMirrorNode,
  path: string,
  issues: S1000DTableValidationIssue[],
  profile: S1000DTableProfile,
): void {
  if (typeof table.attrs.id !== 'string' || table.attrs.id.length === 0) {
    issues.push({ path, message: 'table@id is required' });
  }

  table.forEach((child, index) => {
    if (child.type.name === s1000dTableNodeNames.graphic && !allowsGraphicOnlyTable(profile)) {
      issues.push({ path: `${path}/graphic[${index}]`, message: 'graphic-only table is not allowed in proced profile' });
    }
  });
}

function validateTgroup(
  tgroup: ProseMirrorNode,
  path: string,
  issues: S1000DTableValidationIssue[],
  profile: S1000DTableProfile,
): void {
  const cols = resolveTgroupColumnCount(tgroup);
  if (cols < 1) issues.push({ path, message: 'tgroup@cols must be a positive integer' });

  const colspecs = resolveColspecs(tgroup);
  const colnames = new Set<string>();
  for (const colspec of colspecs) {
    if (colnames.has(colspec.colname)) {
      issues.push({ path, message: `duplicate colspec "${colspec.colname}"` });
    }
    colnames.add(colspec.colname);
  }

  const { spanspecs, errors } = resolveSpanspecs(tgroup);
  for (const error of errors) issues.push({ path, message: error });
  const spannames = new Set<string>();
  for (const spanspec of spanspecs) {
    if (!allowsSpanspec(profile)) {
      issues.push({ path, message: 'spanspec is not allowed in proced profile' });
    }
    if (spannames.has(spanspec.spanname)) {
      issues.push({ path, message: `duplicate spanspec "${spanspec.spanname}"` });
    }
    if (cols > 0 && spanspec.to >= cols) {
      issues.push({ path, message: `spanspec "${spanspec.spanname}" exceeds tgroup@cols` });
    }
    spannames.add(spanspec.spanname);
  }

  tgroup.forEach((child, index) => {
    if (child.type.name === s1000dTableNodeNames.tfoot && !allowsTfoot(profile)) {
      issues.push({ path: `${path}/tfoot[${index}]`, message: 'tfoot is not allowed in proced profile' });
    }
  });

  validateEntries(tgroup, path, issues, cols);
}

function validateEntries(
  tgroup: ProseMirrorNode,
  path: string,
  issues: S1000DTableValidationIssue[],
  cols: number,
): void {
  const colspecs = resolveColspecs(tgroup);
  const { spanspecs } = resolveSpanspecs(tgroup);

  tgroup.descendants((node, _pos, parent, index) => {
    if (node.type.name === s1000dTableNodeNames.row) {
      if (typeof node.attrs.id !== 'string' || node.attrs.id.length === 0) {
        issues.push({ path: `${path}/row[${index}]`, message: 'row@id is required' });
      }
      validateRowEntries(node, tgroup, `${path}/row[${index}]`, issues, cols);
      return true;
    }
    if (node.type.name !== s1000dTableNodeNames.entry) return true;

    if (node.attrs.colname && findColspecIndex(colspecs, node.attrs.colname) === undefined) {
      issues.push({ path: `${path}/entry[${index}]`, message: `entry references unknown colname "${node.attrs.colname}"` });
    }
    if ((node.attrs.namest || node.attrs.nameend)
      && (findColspecIndex(colspecs, node.attrs.namest) === undefined || findColspecIndex(colspecs, node.attrs.nameend) === undefined)) {
      issues.push({ path: `${path}/entry[${index}]`, message: 'entry namest/nameend must reference existing colspecs' });
    }
    if (node.attrs.spanname && !findSpanspec(spanspecs, node.attrs.spanname)) {
      issues.push({ path: `${path}/entry[${index}]`, message: `entry references unknown spanname "${node.attrs.spanname}"` });
    }
    if (resolveEntryRowSpan(node) < 1) {
      issues.push({ path: `${path}/entry[${index}]`, message: 'entry morerows must resolve to a positive row span' });
    }
    if (cols > 0) {
      const start = resolveEntryColumn(node, tgroup);
      const span = resolveEntryColSpan(node, tgroup);
      if (start + span > cols) {
        issues.push({ path: `${path}/entry[${index}]`, message: 'entry exceeds tgroup@cols' });
      }
    }
    if (typeof node.attrs.warningRefs === 'string' && !isIdrefs(node.attrs.warningRefs)) {
      issues.push({ path: `${path}/entry[${index}]`, message: 'warningRefs must be valid IDREFS' });
    }
    if (typeof node.attrs.cautionRefs === 'string' && !isIdrefs(node.attrs.cautionRefs)) {
      issues.push({ path: `${path}/entry[${index}]`, message: 'cautionRefs must be valid IDREFS' });
    }

    return false;
  });
}

function validateRowEntries(
  row: ProseMirrorNode,
  tgroup: ProseMirrorNode,
  path: string,
  issues: S1000DTableValidationIssue[],
  cols: number,
): void {
  if (cols < 1) return;

  let nextAvailableColumn = 0;
  row.forEach((entry, index) => {
    if (entry.type.name !== s1000dTableNodeNames.entry) return;

    const start = resolveEntryColumn(entry, tgroup, nextAvailableColumn);
    const span = resolveEntryColSpan(entry, tgroup);
    const end = start + span;

    if (start < nextAvailableColumn || end > cols) {
      issues.push({ path: `${path}/entry[${index}]`, message: 'entry exceeds tgroup@cols' });
    }

    nextAvailableColumn = Math.max(nextAvailableColumn, start) + span;
  });
}

function isIdrefs(value: string): boolean {
  return value.trim().split(/\s+/).every((item) => /^[A-Za-z_][\w.-]*$/.test(item));
}
