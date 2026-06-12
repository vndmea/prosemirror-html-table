import { describe, expect, it } from 'vitest';
import { parseS1000DTableXml, serializeS1000DTableXml } from './index.js';
import { canonicalXml, schema } from './tests/test-schema.js';

describe('S1000D table XML import/export', () => {
  it('round-trips table, title, tgroup, sections, attrs, and unknown attrs', () => {
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
            <row><entry colname="c1">Foot</entry></row>
          </tfoot>
          <tbody valign="middle">
            <row rowsep="1"><entry spanname="s12" morerows="1" warningRefs="warn1 warn2">Body</entry></row>
          </tbody>
        </tgroup>
      </table>`;

    const node = parseS1000DTableXml(xml, schema);
    const output = serializeS1000DTableXml(node);

    expect(canonicalXml(output)).toBe(canonicalXml(
      '<table customTableAttr="keep" id="tab-1" tabstyle="fault"><title>Fault isolation</title><tgroup cols="3" customTgroupAttr="keep" tgstyle="main"><colspec colname="c1" colnum="1" colwidth="1*"/><colspec colname="c2" colnum="2" colwidth="2*"/><colspec colname="c3" colnum="3" colwidth="3*"/><spanspec nameend="c2" namest="c1" spanname="s12"/><thead valign="bottom"><row id="head-row"><entry nameend="c2" namest="c1"><para>Head</para></entry></row></thead><tfoot valign="top"><row><entry colname="c1"><para>Foot</para></entry></row></tfoot><tbody valign="middle"><row rowsep="1"><entry morerows="1" spanname="s12" warningRefs="warn1 warn2"><para>Body</para></entry></row></tbody></tgroup></table>',
    ));
  });

  it('round-trips multiple tgroups and graphic-only tables', () => {
    const multiTgroup = parseS1000DTableXml(
      '<table><tgroup cols="1"><tbody><row><entry>A</entry></row></tbody></tgroup><tgroup cols="1"><tbody><row><entry>B</entry></row></tbody></tgroup></table>',
      schema,
    );
    const graphicOnly = parseS1000DTableXml(
      '<table><graphic infoEntityIdent="ICN-001" xlink:href="urn:test"/></table>',
      schema,
    );

    expect(canonicalXml(serializeS1000DTableXml(multiTgroup))).toBe(
      '<table><tgroup cols="1"><tbody><row><entry><para>A</para></entry></row></tbody></tgroup><tgroup cols="1"><tbody><row><entry><para>B</para></entry></row></tbody></tgroup></table>',
    );
    expect(canonicalXml(serializeS1000DTableXml(graphicOnly))).toBe(
      '<table><graphic infoEntityIdent="ICN-001" xlink:href="urn:test"/></table>',
    );
  });
});
