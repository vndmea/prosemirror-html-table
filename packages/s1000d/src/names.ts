export const s1000dTableNodeNames = {
  table: 's1000dTable',
  title: 's1000dTitle',
  tgroup: 's1000dTgroup',
  colspec: 's1000dColspec',
  spanspec: 's1000dSpanspec',
  thead: 's1000dThead',
  tfoot: 's1000dTfoot',
  tbody: 's1000dTbody',
  row: 's1000dRow',
  entry: 's1000dEntry',
  entryBlock: 's1000dEntryBlock',
  graphic: 's1000dGraphic',
} as const;

export type S1000DTableNodeNameKey = keyof typeof s1000dTableNodeNames;
export type S1000DTableNodeNames = Record<S1000DTableNodeNameKey, string>;

export function resolveS1000DTableNodeNames(
  names: Partial<S1000DTableNodeNames> = {},
): S1000DTableNodeNames {
  return {
    ...s1000dTableNodeNames,
    ...names,
  };
}
