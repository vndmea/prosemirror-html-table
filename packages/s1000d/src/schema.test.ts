import { Schema } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';
import { createS1000DTableNodeSpecs } from './schema.js';
import { extendedSchema, schema } from './tests/test-schema.js';

describe('S1000D table schema', () => {
  it('allows proced-compatible tgroup tables', () => {
    const title = schema.nodes.s1000dTitle!.create(null, schema.text('Fault table'));
    const entry = schema.nodes.s1000dEntry!.create(null, [
      schema.nodes.paragraph!.create(null, schema.text('A')),
    ]);
    const row = schema.nodes.s1000dRow!.create({ id: 'row-1' }, [entry]);
    const tbody = schema.nodes.s1000dTbody!.create(null, [row]);
    const tgroup = schema.nodes.s1000dTgroup!.create({ cols: '1' }, [tbody]);
    const table = schema.nodes.s1000dTable!.create({ id: 'tab-1' }, [title, tgroup]);

    expect(table.type.name).toBe('s1000dTable');
  });

  it('allows graphic-only tables and tfoot in extended profile', () => {
    const graphicTable = extendedSchema.nodes.s1000dTable!.create({ id: 'tab-1' }, [
      extendedSchema.nodes.s1000dGraphic!.create({ infoEntityIdent: 'ICN-001' }),
    ]);
    const entry = extendedSchema.nodes.s1000dEntry!.create();
    const row = extendedSchema.nodes.s1000dRow!.create({ id: 'row-1' }, [entry]);
    const tfoot = extendedSchema.nodes.s1000dTfoot!.create(null, [row]);
    const tbody = extendedSchema.nodes.s1000dTbody!.create(null, [row]);
    const tgroup = extendedSchema.nodes.s1000dTgroup!.create({ cols: '1' }, [tfoot, tbody]);

    expect(graphicTable.child(0).type.name).toBe('s1000dGraphic');
    expect(tgroup.child(0).type.name).toBe('s1000dTfoot');
    expect(tgroup.child(1).type.name).toBe('s1000dTbody');
  });

  it('rejects graphic-only tables in proced profile content expression', () => {
    const procedSchema = new Schema({
      nodes: {
        doc: { content: 'block+' },
        text: { group: 'inline' },
        paragraph: {
          group: 'block',
          content: 'inline*',
          toDOM: () => ['p', 0],
        },
        ...createS1000DTableNodeSpecs(),
      },
    });

    expect(() => procedSchema.nodes.s1000dTable!.createChecked({ id: 'tab-1' }, [
      procedSchema.nodes.s1000dGraphic!.create({ infoEntityIdent: 'ICN-001' }),
    ])).toThrow();
  });
});
