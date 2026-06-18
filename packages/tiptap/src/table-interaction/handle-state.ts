export interface TableAxisSelectionStateLike {
  kind: 'row' | 'column' | null;
  index: number | null;
  tablePos: number | null;
}

export interface TableHoverStateLike {
  tablePos: number;
  rowIndex: number | null;
  columnIndex: number | null;
}

export interface TableResizeStateLike {
  tablePos: number;
}

export interface TableAxisInteractionStateLike<TAxisState extends TableAxisSelectionStateLike = TableAxisSelectionStateLike> {
  hovered: TableHoverStateLike | null;
  selectedAxis: TAxisState;
  selectedAxisExplicit?: boolean | undefined;
  tableSelected?: boolean | undefined;
  contextMenuOpen?: boolean | undefined;
  resizing?: TableResizeStateLike | null | undefined;
}

export interface TableAxisStateMatchOptions<TAxisState extends TableAxisSelectionStateLike = TableAxisSelectionStateLike> {
  matchesSelectedAxis?: ((selectedAxis: TAxisState) => boolean) | undefined;
}

export function isTableAxisHandleSelected<TAxisState extends TableAxisSelectionStateLike>(
  interaction: Pick<TableAxisInteractionStateLike<TAxisState>, 'selectedAxis' | 'selectedAxisExplicit'>,
  axis: 'row' | 'column',
  tablePos: number,
  index: number,
  options: TableAxisStateMatchOptions<TAxisState> = {},
): boolean {
  return Boolean(interaction.selectedAxisExplicit)
    && interaction.selectedAxis.kind === axis
    && interaction.selectedAxis.index === index
    && interaction.selectedAxis.tablePos === tablePos
    && (options.matchesSelectedAxis?.(interaction.selectedAxis) ?? true);
}

export function shouldToggleTableContextMenuFromAxisHandle<TAxisState extends TableAxisSelectionStateLike>(
  interaction: Pick<TableAxisInteractionStateLike<TAxisState>, 'selectedAxis' | 'selectedAxisExplicit'>,
  axis: 'row' | 'column',
  tablePos: number,
  index: number,
  options: TableAxisStateMatchOptions<TAxisState> = {},
): boolean {
  return isTableAxisHandleSelected(interaction, axis, tablePos, index, options);
}

export function shouldToggleTableContextMenuFromTableHandle(
  interaction: {
    tableSelected: boolean;
    activeTable: { tablePos: number } | null;
  },
  tablePos: number,
): boolean {
  return interaction.tableSelected && interaction.activeTable?.tablePos === tablePos;
}

export function isTableAxisHandleHovered(
  interaction: Pick<TableAxisInteractionStateLike, 'hovered'>,
  axis: 'row' | 'column',
  tablePos: number,
  index: number,
): boolean {
  if (interaction.hovered?.tablePos !== tablePos) {
    return false;
  }

  return axis === 'row'
    ? interaction.hovered.rowIndex === index
    : interaction.hovered.columnIndex === index;
}

export function isTableAxisHandleVisible<TAxisState extends TableAxisSelectionStateLike>(
  interaction: Pick<TableAxisInteractionStateLike<TAxisState>, 'contextMenuOpen' | 'hovered' | 'resizing' | 'selectedAxis' | 'selectedAxisExplicit' | 'tableSelected'>,
  axis: 'row' | 'column',
  tablePos: number,
  index: number,
  options: TableAxisStateMatchOptions<TAxisState> = {},
): boolean {
  const selected = isTableAxisHandleSelected(interaction, axis, tablePos, index, options);
  const hovered = isTableAxisHandleHovered(interaction, axis, tablePos, index);
  const hoveredAxisIndex =
    interaction.hovered?.tablePos === tablePos
      ? axis === 'row'
        ? interaction.hovered.rowIndex
        : interaction.hovered.columnIndex
      : null;

  if (interaction.tableSelected || interaction.resizing?.tablePos === tablePos) {
    return false;
  }

  if (interaction.contextMenuOpen && !selected) {
    return false;
  }

  if (hoveredAxisIndex !== null) {
    return hovered;
  }

  return hovered || selected;
}
