export const procedSampleXml = `
<table id="proced-table">
  <title>Proced Table</title>
  <tgroup cols="2">
    <colspec colname="c1"/>
    <colspec colname="c2"/>
    <thead>
      <row id="head-row">
        <entry>Step</entry>
        <entry>Action</entry>
      </row>
    </thead>
    <tbody>
      <row id="body-row-1">
        <entry>1</entry>
        <entry>Check system status</entry>
      </row>
      <row id="body-row-2">
        <entry>2</entry>
        <entry>Record result</entry>
      </row>
    </tbody>
  </tgroup>
</table>
`.trim();

export const extendedSampleXml = `
<table id="extended-table">
  <title>Extended Table</title>
  <tgroup cols="3">
    <colspec colname="c1"/>
    <colspec colname="c2"/>
    <colspec colname="c3"/>
    <spanspec spanname="wide" namest="c2" nameend="c3"/>
    <thead>
      <row id="head-row">
        <entry>Item</entry>
        <entry namest="c2" nameend="c3">Description</entry>
      </row>
    </thead>
    <tfoot>
      <row id="foot-row">
        <entry namest="c1" nameend="c3">Footer</entry>
      </row>
    </tfoot>
    <tbody>
      <row id="body-row-1">
        <entry morerows="1">A</entry>
        <entry spanname="wide">
          <para>Merged description</para>
          <warning>Use care</warning>
        </entry>
      </row>
      <row id="body-row-2">
        <entry colname="c2"><note>Detail note</note></entry>
        <entry colname="c3"><caution>More detail</caution></entry>
      </row>
    </tbody>
  </tgroup>
</table>
`.trim();

export const unsafeRawAttrsSampleXml = `
<table id="unsafe-table" onclick="alert(1)" data-safe="table" href="javascript:alert(1)">
  <title>Unsafe Attrs</title>
  <tgroup cols="1">
    <tbody>
      <row id="row-1">
        <entry style="color:red" onclick="alert(2)" data-safe="entry" href="javascript:alert(2)">A</entry>
      </row>
    </tbody>
  </tgroup>
</table>
`.trim();

export const sampleTsv = 'Alpha\tBeta';
