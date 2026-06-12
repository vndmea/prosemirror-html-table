import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { s1000dTableNodeNames } from '../names.js';
import { findColspecIndex, resolveColspecs, type ResolvedColspec } from './colspec.js';

export interface ResolvedSpanspec {
  spanname: string;
  from: number;
  to: number;
  node: ProseMirrorNode;
}

export interface ResolveSpanspecsResult {
  spanspecs: ResolvedSpanspec[];
  errors: string[];
}

export function resolveSpanspecs(tgroup: ProseMirrorNode): ResolveSpanspecsResult {
  const colspecs = resolveColspecs(tgroup);
  const spanspecs: ResolvedSpanspec[] = [];
  const errors: string[] = [];

  tgroup.forEach((child) => {
    if (child.type.name !== s1000dTableNodeNames.spanspec) return;

    const spanname = child.attrs.spanname;
    const from = findColspecIndex(colspecs, child.attrs.namest);
    const to = findColspecIndex(colspecs, child.attrs.nameend);

    if (typeof spanname !== 'string' || !spanname) {
      errors.push('spanspec is missing required spanname');
      return;
    }
    if (from === undefined || to === undefined) {
      errors.push(`spanspec "${spanname}" references unknown colspec`);
      return;
    }

    spanspecs.push({
      spanname,
      from: Math.min(from, to),
      to: Math.max(from, to),
      node: child,
    });
  });

  return { spanspecs, errors };
}

export function findSpanspec(
  spanspecs: readonly ResolvedSpanspec[],
  spanname: unknown,
): ResolvedSpanspec | undefined {
  if (typeof spanname !== 'string') return undefined;
  return spanspecs.find((spanspec) => spanspec.spanname === spanname);
}

export function resolveNamedSpan(
  entry: ProseMirrorNode,
  colspecs: readonly ResolvedColspec[],
  spanspecs: readonly ResolvedSpanspec[],
): { from: number; to: number } | undefined {
  const directFrom = findColspecIndex(colspecs, entry.attrs.namest);
  const directTo = findColspecIndex(colspecs, entry.attrs.nameend);
  if (directFrom !== undefined && directTo !== undefined) {
    return {
      from: Math.min(directFrom, directTo),
      to: Math.max(directFrom, directTo),
    };
  }

  const spanspec = findSpanspec(spanspecs, entry.attrs.spanname);
  return spanspec ? { from: spanspec.from, to: spanspec.to } : undefined;
}
