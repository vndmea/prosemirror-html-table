export const htmlTableNodeNames = {
  table: 'htmlTable',
  caption: 'htmlTableCaption',
  colgroup: 'htmlTableColgroup',
  col: 'htmlTableCol',
  head: 'htmlTableHead',
  body: 'htmlTableBody',
  foot: 'htmlTableFoot',
  row: 'htmlTableRow',
  headerCell: 'htmlTableHeaderCell',
  cell: 'htmlTableCell',
} as const;

export type HtmlTableNodeNameKey = keyof typeof htmlTableNodeNames;
