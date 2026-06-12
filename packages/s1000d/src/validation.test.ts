import { describe, expect, it } from 'vitest';
import { parseS1000DTableXml, validateS1000DTable } from './index.js';
import { schema } from './tests/test-schema.js';

describe('S1000D table validation', () => {
  it('reports invalid CALS references without mutating the document', () => {
    const table = parseS1000DTableXml(
      '<table><tgroup cols="2"><colspec colname="c1" colnum="1"/><spanspec spanname="bad" namest="c1" nameend="missing"/><tbody><row><entry colname="missing" spanname="bad" warningRefs="1bad">A</entry></row></tbody></tgroup></table>',
      schema,
    );
    const before = table.toJSON();
    const result = validateS1000DTable(table);

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.message)).toEqual(expect.arrayContaining([
      'spanspec "bad" references unknown colspec',
      'entry references unknown colname "missing"',
      'entry references unknown spanname "bad"',
      'warningRefs must be valid IDREFS',
    ]));
    expect(table.toJSON()).toEqual(before);
  });
});
