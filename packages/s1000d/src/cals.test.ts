import { describe, expect, it } from 'vitest';
import {
  parseS1000DTableXml,
  resolveColspecs,
  resolveEntryColSpan,
  resolveEntryColumn,
  resolveEntryRowSpan,
  resolveSpanspecs,
} from './index.js';
import { extendedSchema } from './tests/test-schema.js';

describe('S1000D CALS resolution', () => {
  it('resolves colspecs, spanspecs, morerows, and entry spans', () => {
    const table = parseS1000DTableXml(
      '<table id="tab-1"><tgroup cols="3"><colspec colname="c1" colnum="1"/><colspec colname="c2" colnum="2"/><colspec colname="c3" colnum="3"/><spanspec spanname="wide" namest="c1" nameend="c3"/><tbody><row id="row-1"><entry spanname="wide" morerows="2">A</entry></row></tbody></tgroup></table>',
      extendedSchema,
      { profile: 'extended' },
    );
    const tgroup = table.child(0);
    const entry = tgroup.lastChild!.firstChild!.firstChild!;

    expect(resolveColspecs(tgroup).map((colspec) => colspec.colname)).toEqual(['c1', 'c2', 'c3']);
    expect(resolveSpanspecs(tgroup).spanspecs[0]).toMatchObject({ spanname: 'wide', from: 0, to: 2 });
    expect(resolveEntryRowSpan(entry)).toBe(3);
    expect(resolveEntryColSpan(entry, tgroup)).toBe(3);
    expect(resolveEntryColumn(entry, tgroup)).toBe(0);
  });

  it('gives direct namest/nameend precedence over spanname', () => {
    const table = parseS1000DTableXml(
      '<table id="tab-1"><tgroup cols="3"><colspec colname="c1" colnum="1"/><colspec colname="c2" colnum="2"/><colspec colname="c3" colnum="3"/><spanspec spanname="wide" namest="c1" nameend="c3"/><tbody><row id="row-1"><entry spanname="wide" namest="c2" nameend="c3">A</entry></row></tbody></tgroup></table>',
      extendedSchema,
      { profile: 'extended' },
    );
    const tgroup = table.child(0);
    const entry = tgroup.lastChild!.firstChild!.firstChild!;

    expect(resolveEntryColSpan(entry, tgroup)).toBe(2);
    expect(resolveEntryColumn(entry, tgroup)).toBe(1);
  });
});
