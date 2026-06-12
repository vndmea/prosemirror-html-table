import { describe, expect, it } from 'vitest';
import { parseS1000DTableXml, serializeS1000DTableXml } from './index.js';
import { canonicalXml, extendedSchema, schema } from './tests/test-schema.js';

describe('S1000D table XML import/export', () => {
  it('round-trips proced-compatible table XML by default', () => {
    const xml = `
      <table id="tab-1" frame="all" customTableAttr="keep">
        <title>Fault isolation</title>
        <tgroup cols="2" customTgroupAttr="keep">
          <colspec colname="c1" colwidth="1*"/>
          <colspec colname="c2" colwidth="2*"/>
          <thead valign="bottom">
            <row id="head-row"><entry namest="c1" nameend="c2">Head</entry></row>
          </thead>
          <tbody valign="middle">
            <row id="body-row" rowsep="1"><entry morerows="1">Body</entry></row>
          </tbody>
        </tgroup>
      </table>`;

    const node = parseS1000DTableXml(xml, schema);
    const output = serializeS1000DTableXml(node);

    expect(canonicalXml(output)).toBe(canonicalXml(
      '<table customTableAttr="keep" frame="all" id="tab-1"><title>Fault isolation</title><tgroup cols="2" customTgroupAttr="keep"><colspec colname="c1" colwidth="1*"/><colspec colname="c2" colwidth="2*"/><thead valign="bottom"><row id="head-row"><entry nameend="c2" namest="c1"><para>Head</para></entry></row></thead><tbody valign="middle"><row id="body-row" rowsep="1"><entry morerows="1"><para>Body</para></entry></row></tbody></tgroup></table>',
    ));
  });

  it('round-trips extended spanspec, tfoot, graphic-only, and mixed entry blocks', () => {
    const xml = `
      <table id="tab-1" tabstyle="fault" customTableAttr="keep">
        <title>Fault isolation</title>
        <tgroup cols="3" tgstyle="main" customTgroupAttr="keep">
          <colspec colname="c1" colnum="1" colwidth="1*"/>
          <colspec colname="c2" colnum="2" colwidth="2*"/>
          <colspec colname="c3" colnum="3" colwidth="3*"/>
          <spanspec spanname="s12" namest="c1" nameend="c2"/>
          <thead valign="bottom">
            <row id="head-row"><entry namest="c1" nameend="c2">Head</entry></row>
          </thead>
          <tfoot valign="top">
            <row id="foot-row"><entry colname="c1">Foot</entry></row>
          </tfoot>
          <tbody valign="middle">
            <row id="body-row" rowsep="1"><entry spanname="s12" morerows="1" warningRefs="warn1 warn2"><para id="p1">Body</para><warning id="w1">Warn</warning><note id="n1">Note</note></entry></row>
          </tbody>
        </tgroup>
      </table>`;

    const node = parseS1000DTableXml(xml, extendedSchema, { profile: 'extended' });
    const output = serializeS1000DTableXml(node, { profile: 'extended' });
    const graphicOnly = parseS1000DTableXml(
      '<table id="tab-2"><graphic infoEntityIdent="ICN-001" xlink:href="urn:test"/></table>',
      extendedSchema,
      { profile: 'extended' },
    );

    expect(canonicalXml(output)).toBe(canonicalXml(
      '<table customTableAttr="keep" id="tab-1" tabstyle="fault"><title>Fault isolation</title><tgroup cols="3" customTgroupAttr="keep" tgstyle="main"><colspec colname="c1" colnum="1" colwidth="1*"/><colspec colname="c2" colnum="2" colwidth="2*"/><colspec colname="c3" colnum="3" colwidth="3*"/><spanspec nameend="c2" namest="c1" spanname="s12"/><thead valign="bottom"><row id="head-row"><entry nameend="c2" namest="c1"><para>Head</para></entry></row></thead><tfoot valign="top"><row id="foot-row"><entry colname="c1"><para>Foot</para></entry></row></tfoot><tbody valign="middle"><row id="body-row" rowsep="1"><entry morerows="1" spanname="s12" warningRefs="warn1 warn2"><para id="p1">Body</para><warning id="w1">Warn</warning><note id="n1">Note</note></entry></row></tbody></tgroup></table>',
    ));
    expect(canonicalXml(serializeS1000DTableXml(graphicOnly, { profile: 'extended' }))).toBe(
      '<table id="tab-2"><graphic infoEntityIdent="ICN-001" xlink:href="urn:test"/></table>',
    );
  });

  it('rejects extended-only XML in proced profile', () => {
    expect(() => parseS1000DTableXml(
      '<table id="tab-1"><graphic infoEntityIdent="ICN-001"/></table>',
      schema,
    )).toThrow(/graphic-only table/);

    expect(() => parseS1000DTableXml(
      '<table id="tab-1"><tgroup cols="2"><spanspec spanname="wide" namest="c1" nameend="c2"/><tbody><row id="row-1"><entry>A</entry></row></tbody></tgroup></table>',
      schema,
    )).toThrow(/spanspec/);

    expect(() => parseS1000DTableXml(
      '<table id="tab-1"><tgroup cols="1"><tbody><row id="row-1"><entry><warning>Warn</warning></entry></row></tbody></tgroup></table>',
      schema,
    )).toThrow(/warning/);
  });
});
