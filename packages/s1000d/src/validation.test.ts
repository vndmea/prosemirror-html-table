import { describe, expect, it } from 'vitest';
import { parseS1000DTableXml, validateS1000DTable } from './index.js';
import { extendedSchema, schema } from './tests/test-schema.js';

describe('S1000D table validation', () => {
  it('reports proced-required ids and column overflow without mutating the document', () => {
    const table = parseS1000DTableXml(
      '<table><tgroup cols="2"><colspec colname="c1"/><colspec colname="c2"/><tbody><row><entry namest="c1" nameend="c3">A</entry></row></tbody></tgroup></table>',
      schema,
    );
    const before = table.toJSON();
    const result = validateS1000DTable(table);

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.message)).toEqual(expect.arrayContaining([
      'table@id is required',
      'row@id is required',
      'entry namest/nameend must reference existing colspecs',
    ]));
    expect(table.toJSON()).toEqual(before);
  });

  it('reports entries that exceed tgroup@cols when references are otherwise valid', () => {
    const table = parseS1000DTableXml(
      '<table id="tab-1"><tgroup cols="2"><colspec colname="c1"/><colspec colname="c2"/><tbody><row id="row-1"><entry namest="c1" nameend="c2">A</entry><entry colname="c2">B</entry></row></tbody></tgroup></table>',
      schema,
    );

    const result = validateS1000DTable(table);

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.message)).toContain('entry exceeds tgroup@cols');
  });

  it('reports invalid CALS references and profile-specific issues in extended documents', () => {
    const table = parseS1000DTableXml(
      '<table id="tab-1"><tgroup cols="2"><colspec colname="c1" colnum="1"/><spanspec spanname="bad" namest="c1" nameend="missing"/><tbody><row id="row-1"><entry colname="missing" spanname="bad" warningRefs="1bad">A</entry></row></tbody></tgroup></table>',
      extendedSchema,
      { profile: 'extended' },
    );
    const before = table.toJSON();
    const result = validateS1000DTable(table, { profile: 'extended' });

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.message)).toEqual(expect.arrayContaining([
      'spanspec "bad" references unknown colspec',
      'entry references unknown colname "missing"',
      'entry references unknown spanname "bad"',
      'warningRefs must be valid IDREFS',
    ]));
    expect(table.toJSON()).toEqual(before);
  });

  it('flags proced-disallowed nodes when validating an extended document under proced profile', () => {
    const table = parseS1000DTableXml(
      '<table id="tab-1" tabstyle="fault"><tgroup cols="2" tgstyle="main"><colspec colname="c1" colnum="1"/><colspec colname="c2" colnum="2"/><spanspec spanname="wide" namest="c1" nameend="c2"/><tfoot><row id="foot-row"><entry>F</entry></row></tfoot><tbody><row id="body-row"><entry spanname="wide"><warning>Warn</warning></entry></row></tbody></tgroup></table>',
      extendedSchema,
      { profile: 'extended' },
    );

    const result = validateS1000DTable(table);

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.message)).toEqual(expect.arrayContaining([
      'table@tabstyle is not allowed in proced profile',
      'tgroup@tgstyle is not allowed in proced profile',
      'colspec@colnum is not allowed in proced profile',
      'spanspec is not allowed in proced profile',
      'tfoot is not allowed in proced profile',
      'entry@spanname is not allowed in proced profile',
      '<warning> is not allowed in proced profile',
    ]));
  });
});
