import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { s1000dTableNodeNames } from './names.js';
import { findColspecIndex, resolveColspecs } from './cals/colspec.js';
import { findSpanspec, resolveSpanspecs } from './cals/spanspec.js';
import { resolveEntryRowSpan, resolveTgroupColumnCount } from './cals/grid.js';

export interface S1000DTableValidationIssue {
  path: string;
  message: string;
}

export interface S1000DTableValidationResult {
  valid: boolean;
  issues: S1000DTableValidationIssue[];
}

export function validateS1000DTable(node: ProseMirrorNode): S1000DTableValidationResult {
  const issues: S1000DTableValidationIssue[] = [];

  node.descendants((child, _pos, parent, index) => {
    if (child.type.name !== s1000dTableNodeNames.tgroup) return true;
    validateTgroup(child, `tgroup[${index}]`, issues);
    return false;
  });

  return {
    valid: issues.length === 0,
    issues,
  };
}

function validateTgroup(
  tgroup: ProseMirrorNode,
  path: string,
  issues: S1000DTableValidationIssue[],
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
    if (spannames.has(spanspec.spanname)) {
      issues.push({ path, message: `duplicate spanspec "${spanspec.spanname}"` });
    }
    spannames.add(spanspec.spanname);
  }

  validateEntries(tgroup, path, issues);
}

function validateEntries(
  tgroup: ProseMirrorNode,
  path: string,
  issues: S1000DTableValidationIssue[],
): void {
  const colspecs = resolveColspecs(tgroup);
  const { spanspecs } = resolveSpanspecs(tgroup);

  tgroup.descendants((node, _pos, parent, index) => {
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
    if (typeof node.attrs.warningRefs === 'string' && !isIdrefs(node.attrs.warningRefs)) {
      issues.push({ path: `${path}/entry[${index}]`, message: 'warningRefs must be valid IDREFS' });
    }
    if (typeof node.attrs.cautionRefs === 'string' && !isIdrefs(node.attrs.cautionRefs)) {
      issues.push({ path: `${path}/entry[${index}]`, message: 'cautionRefs must be valid IDREFS' });
    }

    return false;
  });
}

function isIdrefs(value: string): boolean {
  return value.trim().split(/\s+/).every((item) => /^[A-Za-z_][\w.-]*$/.test(item));
}
