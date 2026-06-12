import { describe, expect, it } from 'vitest';
import { schema } from './tests/test-schema.js';

describe('S1000D table schema', () => {
  it('allows tgroup tables and graphic-only tables', () => {
    const title = schema.nodes.s1000dTitle!.create(null, schema.text('Fault table'));
    const entry = schema.nodes.s1000dEntry!.create(null, [
      schema.nodes.paragraph!.create(null, schema.text('A')),
    ]);
    const row = schema.nodes.s1000dRow!.create(null, [entry]);
    const tbody = schema.nodes.s1000dTbody!.create(null, [row]);
    const tgroup = schema.nodes.s1000dTgroup!.create({ cols: '1' }, [tbody]);
    const table = schema.nodes.s1000dTable!.create(null, [title, tgroup]);
    const graphicTable = schema.nodes.s1000dTable!.create(null, [
      schema.nodes.s1000dGraphic!.create({ infoEntityIdent: 'ICN-001' }),
    ]);

    expect(table.type.name).toBe('s1000dTable');
    expect(graphicTable.child(0).type.name).toBe('s1000dGraphic');
  });

  it('keeps tfoot before tbody in the document model', () => {
    const entry = schema.nodes.s1000dEntry!.create();
    const row = schema.nodes.s1000dRow!.create(null, [entry]);
    const tfoot = schema.nodes.s1000dTfoot!.create(null, [row]);
    const tbody = schema.nodes.s1000dTbody!.create(null, [row]);
    const tgroup = schema.nodes.s1000dTgroup!.create({ cols: '1' }, [tfoot, tbody]);

    expect(tgroup.child(0).type.name).toBe('s1000dTfoot');
    expect(tgroup.child(1).type.name).toBe('s1000dTbody');
  });
});
