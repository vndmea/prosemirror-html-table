import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { parseS1000DTableXml } from './index.js';
import { renderS1000DTableToHtml } from './renderer.js';
import { extendedSchema, schema } from './tests/test-schema.js';

function canonicalHtml(html: string): string {
  return html.replace(/>\s+</g, '><').trim();
}

describe('S1000D HTML renderer', () => {
  it('renders a basic proced table as standard HTML', () => {
    const table = parseS1000DTableXml(
      '<table id="tab-1"><title>Fault isolation</title><tgroup cols="2"><tbody><row id="row-1"><entry>A</entry><entry>B</entry></row></tbody></tgroup></table>',
      schema,
    );

    const html = renderS1000DTableToHtml(table);

    expect(canonicalHtml(html)).toBe(
      '<table id="tab-1"><caption>Fault isolation</caption><colgroup><col /><col /></colgroup><tbody><tr id="row-1"><td><p>A</p></td><td><p>B</p></td></tr></tbody></table>',
    );
  });

  it('renders colspecs as a colgroup without nested tbody wrappers', () => {
    const table = parseS1000DTableXml(
      '<table id="tab-1"><tgroup cols="2"><colspec colname="c1" colwidth="1*"/><colspec colname="c2" colwidth="2*"/><tbody><row id="row-1"><entry>A</entry><entry>B</entry></row></tbody></tgroup></table>',
      schema,
    );

    const html = renderS1000DTableToHtml(table);

    expect(canonicalHtml(html)).toContain('<colgroup><col style="width: 1*;" /><col style="width: 2*;" /></colgroup>');
    expect(canonicalHtml(html)).not.toContain('<tbody><tbody>');
    expect(canonicalHtml(html)).not.toContain('<tbody><col');
  });

  it('renders namest/nameend, spanspec, and morerows as colspan/rowspan', () => {
    const table = parseS1000DTableXml(
      '<table id="tab-1"><tgroup cols="3"><colspec colname="c1"/><colspec colname="c2"/><colspec colname="c3"/><spanspec spanname="wide" namest="c2" nameend="c3"/><tbody><row id="row-1"><entry namest="c1" nameend="c2" morerows="1">A</entry><entry spanname="wide">B</entry></row><row id="row-2"><entry colname="c3">C</entry></row></tbody></tgroup></table>',
      extendedSchema,
      { profile: 'extended' },
    );

    const html = renderS1000DTableToHtml(table, { profile: 'extended' });

    expect(canonicalHtml(html)).toContain('<td colspan="2" rowspan="2"><p>A</p></td>');
    expect(canonicalHtml(html)).toContain('<td colspan="2"><p>B</p></td>');
    expect(canonicalHtml(html)).not.toContain('colspan="1"');
    expect(canonicalHtml(html)).not.toContain('rowspan="1"');
  });

  it('renders thead, tbody, and tfoot in extended profile', () => {
    const table = parseS1000DTableXml(
      '<table id="tab-1"><tgroup cols="1"><thead><row id="head-row"><entry>H</entry></row></thead><tfoot><row id="foot-row"><entry>F</entry></row></tfoot><tbody><row id="body-row"><entry>B</entry></row></tbody></tgroup></table>',
      extendedSchema,
      { profile: 'extended' },
    );

    const html = renderS1000DTableToHtml(table, { profile: 'extended' });
    const normalized = canonicalHtml(html);

    expect(normalized).toContain('<thead><tr id="head-row"><td><p>H</p></td></tr></thead>');
    expect(normalized).toContain('<tbody><tr id="body-row"><td><p>B</p></td></tr></tbody>');
    expect(normalized).toContain('<tfoot><tr id="foot-row"><td><p>F</p></td></tr></tfoot>');
  });

  it('renders entry blocks conservatively and escapes text content', () => {
    const entryBlockType = extendedSchema.nodes.s1000dEntryBlock!;
    const entryType = extendedSchema.nodes.s1000dEntry!;
    const rowType = extendedSchema.nodes.s1000dRow!;
    const tbodyType = extendedSchema.nodes.s1000dTbody!;
    const tgroupType = extendedSchema.nodes.s1000dTgroup!;
    const tableType = extendedSchema.nodes.s1000dTable!;

    const entry = entryType.create(null, [
      entryBlockType.create({ xmlName: 'para', rawText: 'A & B' }, extendedSchema.text('A & B')),
      entryBlockType.create({ xmlName: 'note', rawText: '<warn>' }, extendedSchema.text('<warn>')),
      entryBlockType.create({ xmlName: 'warning', rawText: 'Danger' }, extendedSchema.text('Danger')),
      entryBlockType.create({ xmlName: 'customBlock', rawText: 'Raw' }, extendedSchema.text('Raw')),
    ]);
    const row = rowType.create({ id: 'row-1' }, [entry]);
    const tbody = tbodyType.create(null, [row]);
    const tgroup = tgroupType.create({ cols: '1' }, [tbody]);
    const table = tableType.create({ id: 'tab-1' }, [tgroup]);

    const html = renderS1000DTableToHtml(table, { profile: 'extended' });
    const normalized = canonicalHtml(html);

    expect(normalized).toContain('<p>A &amp; B</p>');
    expect(normalized).toContain('<div class="note">&lt;warn&gt;</div>');
    expect(normalized).toContain('<div class="warning">Danger</div>');
    expect(normalized).toContain('<div class="s1000d-entry-block">Raw</div>');
  });

  it('omits raw attrs by default and filters unsafe raw attrs when enabled', () => {
    const table = parseS1000DTableXml(
      '<table id="tab-1" data-keep="yes" onclick="alert(1)"><tgroup cols="1"><tbody><row id="row-1"><entry style="color:red" data-safe="ok">A</entry></row></tbody></tgroup></table>',
      schema,
    );

    const defaultHtml = renderS1000DTableToHtml(table);
    const rawHtml = renderS1000DTableToHtml(table, { includeRawAttrs: true });

    expect(defaultHtml).not.toContain('data-keep');
    expect(defaultHtml).not.toContain('data-safe');
    expect(rawHtml).toContain('data-keep="yes"');
    expect(rawHtml).toContain('data-safe="ok"');
    expect(rawHtml).not.toContain('onclick=');
    expect(rawHtml).not.toContain('style=');
  });

  it('throws in strict mode for invalid tables and rejects non-table input', () => {
    const invalid = parseS1000DTableXml(
      '<table id="tab-1"><tgroup cols="1"><tbody><row><entry>A</entry></row></tbody></tgroup></table>',
      schema,
    );

    expect(() => renderS1000DTableToHtml(invalid, { strict: true })).toThrow(/invalid S1000D table/i);
    expect(() => renderS1000DTableToHtml(invalid.child(0)!)).toThrow(/expects a s1000dTable node/i);
  });

  it('rejects graphic-only tables in the renderer MVP', () => {
    const table = parseS1000DTableXml(
      '<table id="tab-2"><graphic infoEntityIdent="ICN-001"/></table>',
      extendedSchema,
      { profile: 'extended' },
    );

    expect(() => renderS1000DTableToHtml(table, { profile: 'extended' })).toThrow(/Graphic-only S1000D tables are not supported/i);
  });

  it('keeps renderer free of tiptap and prosemirror-view imports', () => {
    const rendererSource = readFileSync(new URL('./renderer.ts', import.meta.url), 'utf8');

    expect(rendererSource).not.toContain('@tiptap/core');
    expect(rendererSource).not.toContain('prosemirror-view');
  });
});
