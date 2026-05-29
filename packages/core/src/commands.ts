import { Fragment, type Node as ProseMirrorNode, type Schema } from 'prosemirror-model';
import { NodeSelection, TextSelection, type Command, type EditorState, type Selection } from 'prosemirror-state';

import { createHtmlTableNode, type CreateHtmlTableOptions } from './builders.js';
import { createHtmlTableGrid, type HtmlTableCellRef, type HtmlTableGrid, type HtmlTableSectionName } from './grid.js';
import { htmlTableNodeNames } from './names.js';
import { normalizeHtmlTable } from './normalize.js';
import { CellSelection } from './selection.js';
import type { HtmlTableNodeNames } from './types.js';

export interface HtmlTableCommandOptions {
  names?: Partial<HtmlTableNodeNames>;
}

export interface HtmlTableCellNavigationOptions extends HtmlTableCommandOptions {
  cycle?: boolean;
}

export interface InsertHtmlTableCommandOptions extends CreateHtmlTableOptions {
  selectInsertedTable?: boolean;
}

interface TableContext {
  names: HtmlTableNodeNames;
  table: ProseMirrorNode;
  tablePos: number;
}

interface RowContext extends TableContext {
  row: ProseMirrorNode;
  section: ProseMirrorNode;
  sectionName: HtmlTableSectionName;
  sectionChildIndex: number;
  rowIndexInSection: number;
}

interface CellContext extends RowContext {
  cell: HtmlTableCellRef;
}

interface CellSelectionInfo {
  context: TableContext;
  grid: HtmlTableGrid;
  anchorCell: HtmlTableCellRef;
  headCell: HtmlTableCellRef;
  cells: HtmlTableCellRef[];
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export function insertHtmlTable(options: InsertHtmlTableCommandOptions = {}): Command {
  return (state, dispatch) => {
    const table = createHtmlTableNode(state.schema, options);

    if (dispatch) {
      const transaction = state.tr.replaceSelectionWith(table);

      if (options.selectInsertedTable) {
        const tablePos = transaction.selection.from - table.nodeSize;
        transaction.setSelection(NodeSelection.create(transaction.doc, tablePos));
      }

      dispatch(transaction.scrollIntoView());
    }

    return true;
  };
}

export function addRowBefore(options: HtmlTableCommandOptions = {}): Command {
  return addRow('before', options);
}

export function addRowAfter(options: HtmlTableCommandOptions = {}): Command {
  return addRow('after', options);
}

export function deleteRow(options: HtmlTableCommandOptions = {}): Command {
  return (state, dispatch) => {
    const context = findRowContext(state, options);
    if (!context) return false;

    const tableChildren = getChildren(context.table);
    const sectionChildren = getChildren(context.section);

    if (context.sectionName === 'body' && countSections(context.table, context.names.body) === 1 && sectionChildren.length === 1) {
      return false;
    }

    if (sectionChildren.length === 1) {
      tableChildren.splice(context.sectionChildIndex, 1);
    } else {
      sectionChildren.splice(context.rowIndexInSection, 1);
      tableChildren[context.sectionChildIndex] = context.section.copy(Fragment.fromArray(sectionChildren));
    }

    return replaceTable(
      state,
      dispatch,
      context,
      normalizeHtmlTable(context.table.copy(Fragment.fromArray(tableChildren)), getNormalizeOptions(options)),
    );
  };
}

export function addColumnBefore(options: HtmlTableCommandOptions = {}): Command {
  return addColumn('before', options);
}

export function addColumnAfter(options: HtmlTableCommandOptions = {}): Command {
  return addColumn('after', options);
}

export function deleteColumn(options: HtmlTableCommandOptions = {}): Command {
  return (state, dispatch) => {
    const context = findCellContext(state, options);
    if (!context) return false;

    const grid = createHtmlTableGrid(context.table, { names: context.names });
    if (grid.width <= 1) return false;

    const targetColumn = context.cell.columnIndex;
    const tableChildren = getChildren(context.table);

    forEachSection(context.table, context.names, (section, _sectionName, sectionChildIndex) => {
      const rows = getChildren(section).map((row) => {
        const globalRowIndex = findGlobalRowIndexByNode(grid, row);
        const rowChildren = getChildren(row);
        const nextRowChildren: ProseMirrorNode[] = [];

        rowChildren.forEach((cellNode, cellIndex) => {
          const cell = grid.cells.find(
            (item) => item.rowIndex === globalRowIndex && item.cellIndex === cellIndex && item.node === cellNode,
          );

          if (!cell) {
            nextRowChildren.push(cellNode);
            return;
          }

          const coversTargetColumn =
            cell.columnIndex <= targetColumn && cell.columnIndex + cell.colSpan > targetColumn;

          if (!coversTargetColumn) {
            nextRowChildren.push(cellNode);
            return;
          }

          if (cell.colSpan > 1) {
            nextRowChildren.push(
              copyCellWithAttrs(cellNode, {
                colspan: cell.colSpan - 1,
                colwidth: normalizeColwidth(cellNode.attrs.colwidth, cell.colSpan - 1),
              }),
            );
            return;
          }

          if (cell.columnIndex !== targetColumn) {
            nextRowChildren.push(cellNode);
          }
        });

        return row.copy(Fragment.fromArray(nextRowChildren));
      });

      tableChildren[sectionChildIndex] = section.copy(Fragment.fromArray(rows));
    });

    return replaceTable(
      state,
      dispatch,
      context,
      normalizeHtmlTable(context.table.copy(Fragment.fromArray(tableChildren)), getNormalizeOptions(options)),
    );
  };
}

export function deleteTable(options: HtmlTableCommandOptions = {}): Command {
  return (state, dispatch) => {
    const context = findTableContext(state, options);
    if (!context) return false;

    if (dispatch) {
      dispatch(state.tr.delete(context.tablePos, context.tablePos + context.table.nodeSize).scrollIntoView());
    }

    return true;
  };
}

export function setCaption(text: string, options: HtmlTableCommandOptions = {}): Command {
  return (state, dispatch) => {
    const context = findTableContext(state, options);
    if (!context) return false;

    const tableChildren = getChildren(context.table);
    const captionIndex = findChildIndex(context.table, context.names.caption);
    const captionType = getNodeType(state.schema, context.names.caption);
    const captionContent = text.length > 0 ? state.schema.text(text) : undefined;
    const caption = captionType.create(null, captionContent);

    if (captionIndex >= 0) {
      tableChildren[captionIndex] = caption;
    } else {
      tableChildren.splice(0, 0, caption);
    }

    return replaceTable(state, dispatch, context, context.table.copy(Fragment.fromArray(tableChildren)));
  };
}

export function removeCaption(options: HtmlTableCommandOptions = {}): Command {
  return (state, dispatch) => {
    const context = findTableContext(state, options);
    if (!context) return false;

    const tableChildren = getChildren(context.table);
    const captionIndex = findChildIndex(context.table, context.names.caption);
    if (captionIndex < 0) return false;

    tableChildren.splice(captionIndex, 1);
    return replaceTable(state, dispatch, context, context.table.copy(Fragment.fromArray(tableChildren)));
  };
}

export function setColgroup(widths?: Array<number | null>, options: HtmlTableCommandOptions = {}): Command {
  return (state, dispatch) => {
    const context = findTableContext(state, options);
    if (!context) return false;

    const tableChildren = getChildren(context.table);
    const colgroupIndex = findChildIndex(context.table, context.names.colgroup);
    const nextColgroup = createColgroup(
      state.schema,
      context.names,
      Math.max(1, createHtmlTableGrid(context.table, { names: context.names }).width),
      widths,
      colgroupIndex >= 0 ? context.table.child(colgroupIndex) : undefined,
    );

    if (colgroupIndex >= 0) {
      tableChildren[colgroupIndex] = nextColgroup;
    } else {
      tableChildren.splice(findColgroupInsertIndex(tableChildren, context.names), 0, nextColgroup);
    }

    return replaceTable(state, dispatch, context, context.table.copy(Fragment.fromArray(tableChildren)));
  };
}

export function removeColgroup(options: HtmlTableCommandOptions = {}): Command {
  return (state, dispatch) => {
    const context = findTableContext(state, options);
    if (!context) return false;

    const tableChildren = getChildren(context.table);
    const colgroupIndex = findChildIndex(context.table, context.names.colgroup);
    if (colgroupIndex < 0) return false;

    tableChildren.splice(colgroupIndex, 1);
    return replaceTable(state, dispatch, context, context.table.copy(Fragment.fromArray(tableChildren)));
  };
}

export function moveRowToHead(options: HtmlTableCommandOptions = {}): Command {
  return moveRowToSection('head', options);
}

export function moveRowToBody(options: HtmlTableCommandOptions = {}): Command {
  return moveRowToSection('body', options);
}

export function moveRowToFoot(options: HtmlTableCommandOptions = {}): Command {
  return moveRowToSection('foot', options);
}

export function addHeadSection(options: HtmlTableCommandOptions = {}): Command {
  return addSection('head', options);
}

export function removeHeadSection(options: HtmlTableCommandOptions = {}): Command {
  return removeSection('head', options);
}

export function addFootSection(options: HtmlTableCommandOptions = {}): Command {
  return addSection('foot', options);
}

export function removeFootSection(options: HtmlTableCommandOptions = {}): Command {
  return removeSection('foot', options);
}

export function addRowToHead(options: HtmlTableCommandOptions = {}): Command {
  return addRowToSection('head', options);
}

export function addRowToBody(options: HtmlTableCommandOptions = {}): Command {
  return addRowToSection('body', options);
}

export function addRowToFoot(options: HtmlTableCommandOptions = {}): Command {
  return addRowToSection('foot', options);
}

export function setCellAttribute(
  name: string,
  value: unknown,
  options: HtmlTableCommandOptions = {},
): Command {
  return (state, dispatch) => {
    const context = findCellContext(state, options);
    if (!context) return false;

    const table = updateCellAt(context, context.cell, (cell) => copyCellWithAttrs(cell, { [name]: value }));
    return replaceTable(state, dispatch, context, table);
  };
}

export function toggleHeaderCell(options: HtmlTableCommandOptions = {}): Command {
  return (state, dispatch) => {
    const context = findCellContext(state, options);
    if (!context) return false;

    const table = updateCellAt(context, context.cell, (cell) =>
      convertCellType(state.schema, context.names, cell, isHeaderCell(context.names, cell) ? 'body' : 'header'),
    );

    return replaceTable(state, dispatch, context, table);
  };
}

export function toggleHeaderRow(options: HtmlTableCommandOptions = {}): Command {
  return (state, dispatch) => {
    const context = findRowContext(state, options);
    if (!context) return false;

    const rowChildren = getChildren(context.row);
    const shouldConvertToHeader = rowChildren.some((cell) => !isHeaderCell(context.names, cell));
    const nextRow = context.row.copy(
      Fragment.fromArray(
        rowChildren.map((cell) =>
          convertCellType(state.schema, context.names, cell, shouldConvertToHeader ? 'header' : 'body'),
        ),
      ),
    );
    const table = updateRowAt(context, nextRow);

    return replaceTable(state, dispatch, context, table);
  };
}

export function toggleHeaderColumn(options: HtmlTableCommandOptions = {}): Command {
  return (state, dispatch) => {
    const context = findCellContext(state, options);
    if (!context) return false;

    const grid = createHtmlTableGrid(context.table, { names: context.names });
    const targetColumn = context.cell.columnIndex;
    const targetCells = grid.cells.filter(
      (cell) => cell.columnIndex <= targetColumn && cell.columnIndex + cell.colSpan > targetColumn,
    );
    if (targetCells.length === 0) return false;

    const shouldConvertToHeader = targetCells.some((cell) => !isHeaderCell(context.names, cell.node));
    const targetCellSet = new Set(targetCells.map((cell) => cell.node));
    const tableChildren = getChildren(context.table);

    forEachSection(context.table, context.names, (section, _sectionName, sectionChildIndex) => {
      const rows = getChildren(section).map((row) => {
        const rowChildren = getChildren(row).map((cell) => {
          if (!targetCellSet.has(cell)) return cell;
          return convertCellType(state.schema, context.names, cell, shouldConvertToHeader ? 'header' : 'body');
        });

        return row.copy(Fragment.fromArray(rowChildren));
      });

      tableChildren[sectionChildIndex] = section.copy(Fragment.fromArray(rows));
    });

    return replaceTable(state, dispatch, context, context.table.copy(Fragment.fromArray(tableChildren)));
  };
}

export function goToNextCell(options: HtmlTableCellNavigationOptions = {}): Command {
  return goToRelativeCell(1, options);
}

export function goToPreviousCell(options: HtmlTableCellNavigationOptions = {}): Command {
  return goToRelativeCell(-1, options);
}

export function selectCell(options: HtmlTableCommandOptions = {}): Command {
  return (state, dispatch) => {
    const context = findCellContext(state, options);
    if (!context) return false;

    return setCellSelection(state, dispatch, context, context.cell, context.cell);
  };
}

export function selectRow(options: HtmlTableCommandOptions = {}): Command {
  return (state, dispatch) => {
    const context = findCellContext(state, options);
    if (!context) return false;

    const grid = createHtmlTableGrid(context.table, { names: context.names });
    const rowCells = grid.cells
      .filter((cell) => cell.rowIndex === context.cell.rowIndex)
      .sort((a, b) => a.columnIndex - b.columnIndex);

    return setCellBlockSelection(state, dispatch, context, rowCells);
  };
}

export function selectColumn(options: HtmlTableCommandOptions = {}): Command {
  return (state, dispatch) => {
    const context = findCellContext(state, options);
    if (!context) return false;

    const grid = createHtmlTableGrid(context.table, { names: context.names });
    const columnCells = grid.cells
      .filter(
        (cell) =>
          cell.columnIndex <= context.cell.columnIndex &&
          cell.columnIndex + cell.colSpan > context.cell.columnIndex,
      )
      .sort((a, b) => a.rowIndex - b.rowIndex);

    return setCellBlockSelection(state, dispatch, context, columnCells);
  };
}

export function selectTable(options: HtmlTableCommandOptions = {}): Command {
  return (state, dispatch) => {
    const context = findTableContext(state, options);
    if (!context) return false;

    if (dispatch) {
      dispatch(state.tr.setSelection(NodeSelection.create(state.doc, context.tablePos)).scrollIntoView());
    }

    return true;
  };
}

export function mergeCells(options: HtmlTableCommandOptions = {}): Command {
  return (state, dispatch) => {
    const selectionInfo = getCellSelectionInfo(state, options);
    if (!selectionInfo || selectionInfo.cells.length < 2) return false;

    if (!isRectangularSelection(selectionInfo)) return false;

    const anchorContext = findCellContextByCell(selectionInfo.context, selectionInfo.anchorCell);
    if (!anchorContext) return false;

    const rowGroups = new Map<number, HtmlTableCellRef[]>();
    for (const cell of selectionInfo.cells) {
      const rowCells = rowGroups.get(cell.rowIndexInSection) ?? [];
      rowCells.push(cell);
      rowGroups.set(cell.rowIndexInSection, rowCells);
    }

    const tableChildren = getChildren(anchorContext.table);
    const sectionChildren = getChildren(anchorContext.section);
    const mergedCell = copyCellNode(
      anchorContext.cell.node,
      {
        colspan: selectionInfo.right - selectionInfo.left + 1,
        rowspan: selectionInfo.bottom - selectionInfo.top + 1,
        colwidth: normalizeColwidth(
          anchorContext.cell.node.attrs.colwidth,
          selectionInfo.right - selectionInfo.left + 1,
        ),
      },
      mergeCellContent(selectionInfo.cells),
    );

    for (const [rowIndexInSection, cells] of rowGroups.entries()) {
      const row = sectionChildren[rowIndexInSection];
      if (!row) continue;

      const rowChildren = getChildren(row);
      const sortedCells = [...cells].sort((a, b) => b.cellIndex - a.cellIndex);

      for (const cell of sortedCells) {
        if (cell === selectionInfo.anchorCell) {
          rowChildren[cell.cellIndex] = mergedCell;
        } else {
          rowChildren.splice(cell.cellIndex, 1);
        }
      }

      sectionChildren[rowIndexInSection] = row.copy(Fragment.fromArray(rowChildren));
    }

    tableChildren[anchorContext.sectionChildIndex] = anchorContext.section.copy(Fragment.fromArray(sectionChildren));
    return replaceTable(
      state,
      dispatch,
      anchorContext,
      normalizeHtmlTable(anchorContext.table.copy(Fragment.fromArray(tableChildren)), getNormalizeOptions(options)),
    );
  };
}

export function splitCell(options: HtmlTableCommandOptions = {}): Command {
  return (state, dispatch) => {
    const context = findCellContext(state, options);
    if (!context) return false;
    if (context.cell.colSpan === 1 && context.cell.rowSpan === 1) return false;

    const grid = createHtmlTableGrid(context.table, { names: context.names });
    const tableChildren = getChildren(context.table);
    const sectionChildren = getChildren(context.section);
    const isHeader = isHeaderCell(context.names, context.cell.node);

    for (let rowOffset = 0; rowOffset < context.cell.rowSpan; rowOffset += 1) {
      const rowIndexInSection = context.cell.rowIndexInSection + rowOffset;
      const row = sectionChildren[rowIndexInSection];
      if (!row) continue;

      const rowChildren = getChildren(row);
      const insertIndex = countAnchorsBeforeColumn(
        grid,
        context.cell.rowIndex + rowOffset,
        context.cell.columnIndex,
      );
      const newCells = Array.from({ length: context.cell.colSpan }, (_value, columnOffset) => {
        if (rowOffset === 0 && columnOffset === 0) {
          return copyCellWithAttrs(context.cell.node, {
            colspan: 1,
            rowspan: 1,
            colwidth: normalizeColwidth(context.cell.node.attrs.colwidth, 1),
          });
        }

        return createEmptyCell(state.schema, context.names, isHeader ? 'header' : 'body');
      });

      if (rowOffset === 0) {
        rowChildren.splice(context.cell.cellIndex, 1, ...newCells);
      } else {
        rowChildren.splice(insertIndex, 0, ...newCells);
      }

      sectionChildren[rowIndexInSection] = row.copy(Fragment.fromArray(rowChildren));
    }

    tableChildren[context.sectionChildIndex] = context.section.copy(Fragment.fromArray(sectionChildren));
    return replaceTable(
      state,
      dispatch,
      context,
      normalizeHtmlTable(context.table.copy(Fragment.fromArray(tableChildren)), getNormalizeOptions(options)),
    );
  };
}

export function mergeOrSplit(options: HtmlTableCommandOptions = {}): Command {
  return (state, dispatch) => {
    const merged = mergeCells(options)(state, dispatch);
    if (merged) return true;

    return splitCell(options)(state, dispatch);
  };
}

export function fixTables(options: HtmlTableCommandOptions = {}): Command {
  return (state, dispatch) => {
    const names: HtmlTableNodeNames = {
      ...htmlTableNodeNames,
      ...options.names,
    };
    const replacements: Array<{ pos: number; node: ProseMirrorNode; normalized: ProseMirrorNode }> = [];

    state.doc.descendants((node, pos) => {
      if (node.type.name !== names.table) return true;

      const normalized = normalizeHtmlTable(node, getNormalizeOptions(options));
      if (!node.eq(normalized)) {
        replacements.push({ pos, node, normalized });
      }

      return false;
    });

    if (replacements.length === 0) return false;

    if (dispatch) {
      let transaction = state.tr;

      for (const replacement of [...replacements].sort((a, b) => b.pos - a.pos)) {
        transaction = transaction.replaceWith(
          replacement.pos,
          replacement.pos + replacement.node.nodeSize,
          replacement.normalized,
        );
      }

      dispatch(transaction.scrollIntoView());
    }

    return true;
  };
}

function goToRelativeCell(direction: 1 | -1, options: HtmlTableCellNavigationOptions): Command {
  return (state, dispatch) => {
    const context = findCellContext(state, options);
    if (!context) return false;

    const grid = createHtmlTableGrid(context.table, { names: context.names });
    const currentIndex = grid.cells.findIndex((cell) => cell.node === context.cell.node);
    if (currentIndex < 0) return false;

    let targetIndex = currentIndex + direction;

    if (targetIndex < 0 || targetIndex >= grid.cells.length) {
      if (!options.cycle) return false;
      targetIndex = direction > 0 ? 0 : grid.cells.length - 1;
    }

    const targetCell = grid.cells[targetIndex];
    if (!targetCell) return false;

    return setSelectionInsideCell(state, dispatch, context, targetCell);
  };
}

function addRow(direction: 'before' | 'after', options: HtmlTableCommandOptions): Command {
  return (state, dispatch) => {
    const context = findRowContext(state, options);
    if (!context) return false;

    const grid = createHtmlTableGrid(context.table, { names: context.names });
    const width = Math.max(1, grid.width || context.row.childCount || 1);
    const row = createEmptyRow(state.schema, context.names, context.sectionName, width);
    const tableChildren = getChildren(context.table);
    const sectionChildren = getChildren(context.section);
    const insertIndex = context.rowIndexInSection + (direction === 'after' ? 1 : 0);

    sectionChildren.splice(insertIndex, 0, row);
    tableChildren[context.sectionChildIndex] = context.section.copy(Fragment.fromArray(sectionChildren));

    return replaceTable(
      state,
      dispatch,
      context,
      normalizeHtmlTable(context.table.copy(Fragment.fromArray(tableChildren)), getNormalizeOptions(options)),
    );
  };
}

function addColumn(direction: 'before' | 'after', options: HtmlTableCommandOptions): Command {
  return (state, dispatch) => {
    const context = findCellContext(state, options);
    if (!context) return false;

    const grid = createHtmlTableGrid(context.table, { names: context.names });
    const insertColumn = context.cell.columnIndex + (direction === 'after' ? context.cell.colSpan : 0);
    const tableChildren = getChildren(context.table);

    forEachSection(context.table, context.names, (section, sectionName, sectionChildIndex) => {
      const rows = getChildren(section).map((row) => {
        const globalRowIndex = findGlobalRowIndexByNode(grid, row);
        const rowChildren = getChildren(row);
        const coveringCell = getCellAtColumn(grid, globalRowIndex, insertColumn);

        if (coveringCell && coveringCell.rowIndex === globalRowIndex && coveringCell.columnIndex < insertColumn) {
          rowChildren[coveringCell.cellIndex] = copyCellWithAttrs(rowChildren[coveringCell.cellIndex]!, {
            colspan: coveringCell.colSpan + 1,
            colwidth: normalizeColwidth(rowChildren[coveringCell.cellIndex]!.attrs.colwidth, coveringCell.colSpan + 1),
          });
          return row.copy(Fragment.fromArray(rowChildren));
        }

        if (coveringCell && coveringCell.rowIndex < globalRowIndex) {
          return row;
        }

        const insertCellIndex = countAnchorsBeforeColumn(grid, globalRowIndex, insertColumn);
        const cell = createEmptyCell(state.schema, context.names, sectionName === 'head' ? 'header' : 'body');
        rowChildren.splice(insertCellIndex, 0, cell);
        return row.copy(Fragment.fromArray(rowChildren));
      });

      tableChildren[sectionChildIndex] = section.copy(Fragment.fromArray(rows));
    });

    return replaceTable(
      state,
      dispatch,
      context,
      normalizeHtmlTable(context.table.copy(Fragment.fromArray(tableChildren)), getNormalizeOptions(options)),
    );
  };
}

function moveRowToSection(targetSectionName: HtmlTableSectionName, options: HtmlTableCommandOptions): Command {
  return (state, dispatch) => {
    const context = findRowContext(state, options);
    if (!context || context.sectionName === targetSectionName) return false;

    const tableChildren = getChildren(context.table);
    const sourceSectionChildren = getChildren(context.section);
    const movedRow = convertRowForSection(state.schema, context.names, context.row, targetSectionName);

    sourceSectionChildren.splice(context.rowIndexInSection, 1);

    if (sourceSectionChildren.length === 0) {
      tableChildren.splice(context.sectionChildIndex, 1);
    } else {
      tableChildren[context.sectionChildIndex] = context.section.copy(Fragment.fromArray(sourceSectionChildren));
    }

    const targetLocation = findTargetSectionLocation(tableChildren, context.names, targetSectionName);
    let targetRowIndexInSection = 0;
    let targetSectionIndex = 0;

    if (targetLocation.sectionChildIndex >= 0) {
      const targetSection = tableChildren[targetLocation.sectionChildIndex]!;
      const targetRows = getChildren(targetSection);
      targetRowIndexInSection = targetRows.length;
      targetSectionIndex = countPreviousSections(context.table.copy(Fragment.fromArray(tableChildren)), context.names, targetSectionName, targetLocation.sectionChildIndex);
      targetRows.push(movedRow);
      tableChildren[targetLocation.sectionChildIndex] = targetSection.copy(Fragment.fromArray(targetRows));
    } else {
      const sectionType = getNodeType(state.schema, getSectionNodeName(context.names, targetSectionName));
      tableChildren.splice(targetLocation.insertIndex, 0, sectionType.create(null, [movedRow]));
      targetSectionIndex = countPreviousSections(
        context.table.copy(Fragment.fromArray(tableChildren)),
        context.names,
        targetSectionName,
        targetLocation.insertIndex,
      );
    }

    const nextTable = normalizeHtmlTable(
      context.table.copy(Fragment.fromArray(tableChildren)),
      getNormalizeOptions(options),
    );

    return replaceTableAndSelectRow(state, dispatch, context, nextTable, targetSectionName, targetSectionIndex, targetRowIndexInSection);
  };
}

function addSection(sectionName: Extract<HtmlTableSectionName, 'head' | 'foot'>, options: HtmlTableCommandOptions): Command {
  return (state, dispatch) => {
    const context = findTableContext(state, options);
    if (!context) return false;

    const tableChildren = getChildren(context.table);
    const sectionNodeName = getSectionNodeName(context.names, sectionName);
    if (tableChildren.some((child) => child.type.name === sectionNodeName)) {
      return false;
    }

    const grid = createHtmlTableGrid(context.table, { names: context.names });
    const sectionType = getNodeType(state.schema, sectionNodeName);
    const row = createEmptyRow(state.schema, context.names, sectionName, Math.max(1, grid.width));
    const insertIndex = sectionName === 'head'
      ? findHeadInsertIndex(tableChildren, context.names)
      : tableChildren.length;

    tableChildren.splice(insertIndex, 0, sectionType.create(null, [row]));

    return replaceTable(
      state,
      dispatch,
      context,
      normalizeHtmlTable(context.table.copy(Fragment.fromArray(tableChildren)), getNormalizeOptions(options)),
    );
  };
}

function removeSection(sectionName: Extract<HtmlTableSectionName, 'head' | 'foot'>, options: HtmlTableCommandOptions): Command {
  return (state, dispatch) => {
    const context = findTableContext(state, options);
    if (!context) return false;

    const tableChildren = getChildren(context.table);
    const sectionNodeName = getSectionNodeName(context.names, sectionName);
    const sectionChildIndex = tableChildren.findIndex((child) => child.type.name === sectionNodeName);
    if (sectionChildIndex < 0) return false;

    const section = tableChildren[sectionChildIndex]!;
    const movedRows = getChildren(section).map((row) => convertRowForSection(state.schema, context.names, row, 'body'));
    tableChildren.splice(sectionChildIndex, 1);

    const bodyNodeName = context.names.body;
    const bodyChildIndex = tableChildren.findIndex((child) => child.type.name === bodyNodeName);
    if (bodyChildIndex >= 0) {
      const body = tableChildren[bodyChildIndex]!;
      const bodyRows = getChildren(body);
      if (sectionName === 'head') {
        bodyRows.unshift(...movedRows);
      } else {
        bodyRows.push(...movedRows);
      }
      tableChildren[bodyChildIndex] = body.copy(Fragment.fromArray(bodyRows));
    } else {
      const bodyType = getNodeType(state.schema, bodyNodeName);
      const insertIndex = findBodyInsertIndex(tableChildren, context.names);
      tableChildren.splice(insertIndex, 0, bodyType.create(null, movedRows));
    }

    return replaceTable(
      state,
      dispatch,
      context,
      normalizeHtmlTable(context.table.copy(Fragment.fromArray(tableChildren)), getNormalizeOptions(options)),
    );
  };
}

function addRowToSection(targetSectionName: HtmlTableSectionName, options: HtmlTableCommandOptions): Command {
  return (state, dispatch) => {
    const context = findTableContext(state, options);
    if (!context) return false;

    const tableChildren = getChildren(context.table);
    const grid = createHtmlTableGrid(context.table, { names: context.names });
    const row = createEmptyRow(state.schema, context.names, targetSectionName, Math.max(1, grid.width));
    const targetLocation = findTargetSectionLocation(tableChildren, context.names, targetSectionName);

    if (targetLocation.sectionChildIndex >= 0) {
      const section = tableChildren[targetLocation.sectionChildIndex]!;
      const rows = getChildren(section);
      rows.push(row);
      tableChildren[targetLocation.sectionChildIndex] = section.copy(Fragment.fromArray(rows));
    } else {
      const sectionType = getNodeType(state.schema, getSectionNodeName(context.names, targetSectionName));
      tableChildren.splice(targetLocation.insertIndex, 0, sectionType.create(null, [row]));
    }

    return replaceTable(
      state,
      dispatch,
      context,
      normalizeHtmlTable(context.table.copy(Fragment.fromArray(tableChildren)), getNormalizeOptions(options)),
    );
  };
}

function findTableContext(state: EditorState, options: HtmlTableCommandOptions): TableContext | undefined {
  const names: HtmlTableNodeNames = {
    ...htmlTableNodeNames,
    ...options.names,
  };
  const $from = getSelectionStart(state.selection);

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);

    if (node.type.name === names.table) {
      return {
        names,
        table: node,
        tablePos: $from.before(depth),
      };
    }
  }

  return undefined;
}

function findRowContext(state: EditorState, options: HtmlTableCommandOptions): RowContext | undefined {
  const tableContext = findTableContext(state, options);
  if (!tableContext) return undefined;

  const selectionStart = getSelectionStart(state.selection);
  let selectedRow: ProseMirrorNode | undefined;

  for (let depth = selectionStart.depth; depth > 0; depth -= 1) {
    const node = selectionStart.node(depth);

    if (node.type.name === tableContext.names.row) {
      selectedRow = node;
      break;
    }
  }

  return findRowContextByNode(tableContext, selectedRow);
}

function findCellContext(state: EditorState, options: HtmlTableCommandOptions): CellContext | undefined {
  const rowContext = findRowContext(state, options);
  if (!rowContext) return undefined;

  const grid = createHtmlTableGrid(rowContext.table, { names: rowContext.names });

  if (state.selection instanceof CellSelection) {
    const selectionCell = findCellByPosition(rowContext, grid, state.selection.headCellPos)
      ?? findCellByPosition(rowContext, grid, state.selection.anchorCellPos);

    if (selectionCell) {
      return {
        ...rowContext,
        cell: selectionCell,
      };
    }
  }

  const selectionStart = getSelectionStart(state.selection);
  let selectedCellNode: ProseMirrorNode | undefined;

  for (let depth = selectionStart.depth; depth > 0; depth -= 1) {
    const node = selectionStart.node(depth);

    if (node.type.name === rowContext.names.cell || node.type.name === rowContext.names.headerCell) {
      selectedCellNode = node;
      break;
    }
  }

  const cell = grid.cells.find((item) => item.node === selectedCellNode) ?? grid.cells[0];
  if (!cell) return undefined;

  return {
    ...rowContext,
    cell,
  };
}

function findCellContextByCell(context: TableContext, cell: HtmlTableCellRef): CellContext | undefined {
  let result: CellContext | undefined;

  forEachSection(context.table, context.names, (section, sectionName, sectionChildIndex) => {
    if (result || sectionName !== cell.section) return;
    if (countPreviousSections(context.table, context.names, sectionName, sectionChildIndex) !== cell.sectionIndex) return;

    const row = section.child(cell.rowIndexInSection);
    if (!row) return;

    result = {
      ...context,
      section,
      sectionName,
      sectionChildIndex,
      row,
      rowIndexInSection: cell.rowIndexInSection,
      cell,
    };
  });

  return result;
}

function findRowContextByNode(tableContext: TableContext, selectedRow: ProseMirrorNode | undefined): RowContext | undefined {
  let fallback: RowContext | undefined;
  let result: RowContext | undefined;

  forEachSection(tableContext.table, tableContext.names, (section, sectionName, sectionChildIndex) => {
    section.forEach((row, _offset, rowIndexInSection) => {
      const rowContext: RowContext = {
        ...tableContext,
        row,
        section,
        sectionName,
        sectionChildIndex,
        rowIndexInSection,
      };

      fallback ??= rowContext;

      if (selectedRow && row === selectedRow) {
        result = rowContext;
      }
    });
  });

  return result ?? fallback;
}

function getCellSelectionInfo(state: EditorState, options: HtmlTableCommandOptions): CellSelectionInfo | undefined {
  const context = findTableContext(state, options);
  if (!context) return undefined;

  const grid = createHtmlTableGrid(context.table, { names: context.names });
  if (grid.cells.length === 0) return undefined;

  let anchorCell = findCellContext(state, options)?.cell;
  let headCell = anchorCell;

  if (state.selection instanceof CellSelection) {
    anchorCell = findCellByPosition(context, grid, state.selection.anchorCellPos) ?? anchorCell;
    headCell = findCellByPosition(context, grid, state.selection.headCellPos) ?? anchorCell;
  }

  if (!anchorCell || !headCell) return undefined;
  if (anchorCell.section !== headCell.section || anchorCell.sectionIndex !== headCell.sectionIndex) return undefined;

  const top = Math.min(anchorCell.rowIndex, headCell.rowIndex);
  const bottom = Math.max(anchorCell.rowIndex + anchorCell.rowSpan - 1, headCell.rowIndex + headCell.rowSpan - 1);
  const left = Math.min(anchorCell.columnIndex, headCell.columnIndex);
  const right = Math.max(anchorCell.columnIndex + anchorCell.colSpan - 1, headCell.columnIndex + headCell.colSpan - 1);
  const cells = uniqueCellsInRect(grid, top, bottom, left, right);

  return {
    context,
    grid,
    anchorCell,
    headCell,
    cells,
    top,
    bottom,
    left,
    right,
  };
}

function isRectangularSelection(selectionInfo: CellSelectionInfo): boolean {
  const selectedCells = new Set(selectionInfo.cells);

  for (const cell of selectionInfo.cells) {
    if (cell.section !== selectionInfo.anchorCell.section || cell.sectionIndex !== selectionInfo.anchorCell.sectionIndex) {
      return false;
    }

    if (
      cell.rowIndex < selectionInfo.top ||
      cell.rowIndex + cell.rowSpan - 1 > selectionInfo.bottom ||
      cell.columnIndex < selectionInfo.left ||
      cell.columnIndex + cell.colSpan - 1 > selectionInfo.right
    ) {
      return false;
    }
  }

  for (let rowIndex = selectionInfo.top; rowIndex <= selectionInfo.bottom; rowIndex += 1) {
    for (let columnIndex = selectionInfo.left; columnIndex <= selectionInfo.right; columnIndex += 1) {
      const cell = selectionInfo.grid.slots[rowIndex]?.[columnIndex]?.cell;
      if (!cell || !selectedCells.has(cell)) return false;
    }
  }

  return true;
}

function uniqueCellsInRect(
  grid: HtmlTableGrid,
  top: number,
  bottom: number,
  left: number,
  right: number,
): HtmlTableCellRef[] {
  const cells: HtmlTableCellRef[] = [];
  const seen = new Set<HtmlTableCellRef>();

  for (let rowIndex = top; rowIndex <= bottom; rowIndex += 1) {
    for (let columnIndex = left; columnIndex <= right; columnIndex += 1) {
      const cell = grid.slots[rowIndex]?.[columnIndex]?.cell;
      if (cell && !seen.has(cell)) {
        seen.add(cell);
        cells.push(cell);
      }
    }
  }

  return cells.sort((a, b) => (a.rowIndex - b.rowIndex) || (a.columnIndex - b.columnIndex));
}

function forEachSection(
  table: ProseMirrorNode,
  names: HtmlTableNodeNames,
  callback: (
    section: ProseMirrorNode,
    sectionName: HtmlTableSectionName,
    sectionChildIndex: number,
  ) => void,
): void {
  table.forEach((section, _offset, sectionChildIndex) => {
    if (section.type.name === names.head) {
      callback(section, 'head', sectionChildIndex);
      return;
    }

    if (section.type.name === names.body) {
      callback(section, 'body', sectionChildIndex);
      return;
    }

    if (section.type.name === names.foot) {
      callback(section, 'foot', sectionChildIndex);
    }
  });
}

function replaceTable(
  state: EditorState,
  dispatch: Parameters<Command>[1],
  context: TableContext,
  table: ProseMirrorNode,
): boolean {
  if (dispatch) {
    dispatch(state.tr.replaceWith(context.tablePos, context.tablePos + context.table.nodeSize, table).scrollIntoView());
  }

  return true;
}

function createEmptyRow(
  schema: Schema,
  names: HtmlTableNodeNames,
  sectionName: HtmlTableSectionName,
  columnCount: number,
): ProseMirrorNode {
  const rowType = getNodeType(schema, names.row);
  const cells = Array.from({ length: columnCount }, () =>
    createEmptyCell(schema, names, sectionName === 'head' ? 'header' : 'body'),
  );

  return rowType.create(null, cells);
}

function createEmptyCell(
  schema: Schema,
  names: HtmlTableNodeNames,
  kind: 'header' | 'body',
): ProseMirrorNode {
  const cellType = getNodeType(schema, kind === 'header' ? names.headerCell : names.cell);
  const paragraph = schema.nodes.paragraph?.createAndFill();
  const cell = cellType.createAndFill(null, paragraph ? [paragraph] : undefined);

  if (!cell) {
    throw new Error(`Unable to create table cell node: ${cellType.name}`);
  }

  return cell;
}

function updateCellAt(
  context: CellContext,
  cell: HtmlTableCellRef,
  updater: (cell: ProseMirrorNode) => ProseMirrorNode,
): ProseMirrorNode {
  const tableChildren = getChildren(context.table);
  const sectionChildren = getChildren(context.section);
  const row = sectionChildren[cell.rowIndexInSection];

  if (!row) return context.table;

  const rowChildren = getChildren(row);
  rowChildren[cell.cellIndex] = updater(rowChildren[cell.cellIndex]!);
  sectionChildren[cell.rowIndexInSection] = row.copy(Fragment.fromArray(rowChildren));
  tableChildren[context.sectionChildIndex] = context.section.copy(Fragment.fromArray(sectionChildren));

  return context.table.copy(Fragment.fromArray(tableChildren));
}

function updateRowAt(context: RowContext, row: ProseMirrorNode): ProseMirrorNode {
  const tableChildren = getChildren(context.table);
  const sectionChildren = getChildren(context.section);

  sectionChildren[context.rowIndexInSection] = row;
  tableChildren[context.sectionChildIndex] = context.section.copy(Fragment.fromArray(sectionChildren));

  return context.table.copy(Fragment.fromArray(tableChildren));
}

function setSelectionInsideCell(
  state: EditorState,
  dispatch: Parameters<Command>[1],
  context: TableContext,
  cell: HtmlTableCellRef,
): boolean {
  const cellPos = findCellPosition(context, cell);
  if (cellPos === undefined) return false;

  if (dispatch) {
    const $cellStart = state.doc.resolve(cellPos + 1);
    dispatch(state.tr.setSelection(TextSelection.near($cellStart, 1)).scrollIntoView());
  }

  return true;
}

function setCellSelection(
  state: EditorState,
  dispatch: Parameters<Command>[1],
  context: TableContext,
  anchorCell: HtmlTableCellRef,
  headCell: HtmlTableCellRef,
): boolean {
  const anchorCellPos = findCellPosition(context, anchorCell);
  const headCellPos = findCellPosition(context, headCell);
  if (anchorCellPos === undefined || headCellPos === undefined) return false;

  if (dispatch) {
    dispatch(state.tr.setSelection(CellSelection.create(state.doc, anchorCellPos, headCellPos)).scrollIntoView());
  }

  return true;
}

function setCellBlockSelection(
  state: EditorState,
  dispatch: Parameters<Command>[1],
  context: TableContext,
  cells: HtmlTableCellRef[],
): boolean {
  if (cells.length === 0) return false;

  const anchorCell = cells[0]!;
  const headCell = cells[cells.length - 1]!;
  return setCellSelection(state, dispatch, context, anchorCell, headCell);
}

function findCellPosition(context: TableContext, cell: HtmlTableCellRef): number | undefined {
  let result: number | undefined;
  const sectionCounters: Record<HtmlTableSectionName, number> = {
    head: 0,
    body: 0,
    foot: 0,
  };

  context.table.forEach((section, sectionOffset) => {
    if (result !== undefined) return;

    const sectionName = getSectionName(section, context.names);
    if (!sectionName) return;

    const sectionIndex = sectionCounters[sectionName];
    sectionCounters[sectionName] += 1;

    if (sectionName !== cell.section || sectionIndex !== cell.sectionIndex) return;

    section.forEach((row, rowOffset, rowIndexInSection) => {
      if (result !== undefined || rowIndexInSection !== cell.rowIndexInSection) return;

      row.forEach((cellNode, cellOffset, cellIndex) => {
        if (result !== undefined) return;

        if (cellIndex === cell.cellIndex && cellNode === cell.node) {
          result = context.tablePos + 1 + sectionOffset + 1 + rowOffset + 1 + cellOffset;
        }
      });
    });
  });

  return result;
}

function findCellByPosition(
  context: TableContext | RowContext,
  grid: HtmlTableGrid,
  cellPos: number,
): HtmlTableCellRef | undefined {
  return grid.cells.find((cell) => findCellPosition(context, cell) === cellPos);
}

function getSelectionStart(selection: Selection) {
  if (selection instanceof CellSelection) {
    return selection.$head;
  }

  return selection.$from;
}

function getSectionName(node: ProseMirrorNode, names: HtmlTableNodeNames): HtmlTableSectionName | undefined {
  if (node.type.name === names.head) return 'head';
  if (node.type.name === names.body) return 'body';
  if (node.type.name === names.foot) return 'foot';
  return undefined;
}

function getChildren(node: ProseMirrorNode): ProseMirrorNode[] {
  const children: ProseMirrorNode[] = [];
  node.forEach((child) => children.push(child));
  return children;
}

function findChildIndex(node: ProseMirrorNode, typeName: string): number {
  for (let index = 0; index < node.childCount; index += 1) {
    if (node.child(index).type.name === typeName) {
      return index;
    }
  }

  return -1;
}

function findColgroupInsertIndex(children: ProseMirrorNode[], names: HtmlTableNodeNames): number {
  const captionIndex = children.findIndex((child) => child.type.name === names.caption);
  if (captionIndex >= 0) {
    return captionIndex + 1;
  }

  const sectionIndex = children.findIndex(
    (child) => child.type.name === names.head || child.type.name === names.body || child.type.name === names.foot,
  );
  return sectionIndex >= 0 ? sectionIndex : children.length;
}

function findTargetSectionLocation(
  children: ProseMirrorNode[],
  names: HtmlTableNodeNames,
  targetSectionName: HtmlTableSectionName,
): { sectionChildIndex: number; insertIndex: number } {
  const sectionNodeName = getSectionNodeName(names, targetSectionName);
  const sectionChildIndex = children.findIndex((child) => child.type.name === sectionNodeName);

  if (sectionChildIndex >= 0) {
    return {
      sectionChildIndex,
      insertIndex: sectionChildIndex,
    };
  }

  if (targetSectionName === 'head') {
    return {
      sectionChildIndex: -1,
      insertIndex: findHeadInsertIndex(children, names),
    };
  }

  if (targetSectionName === 'body') {
    return {
      sectionChildIndex: -1,
      insertIndex: findBodyInsertIndex(children, names),
    };
  }

  return {
    sectionChildIndex: -1,
    insertIndex: children.length,
  };
}

function findHeadInsertIndex(children: ProseMirrorNode[], names: HtmlTableNodeNames): number {
  const colgroupIndex = children.findIndex((child) => child.type.name === names.colgroup);
  if (colgroupIndex >= 0) {
    return colgroupIndex + 1;
  }

  const captionIndex = children.findIndex((child) => child.type.name === names.caption);
  if (captionIndex >= 0) {
    return captionIndex + 1;
  }

  const sectionIndex = children.findIndex(
    (child) => child.type.name === names.body || child.type.name === names.foot,
  );
  return sectionIndex >= 0 ? sectionIndex : children.length;
}

function findBodyInsertIndex(children: ProseMirrorNode[], names: HtmlTableNodeNames): number {
  const footIndex = children.findIndex((child) => child.type.name === names.foot);
  if (footIndex >= 0) {
    return footIndex;
  }

  return children.length;
}

function createColgroup(
  schema: Schema,
  names: HtmlTableNodeNames,
  columnCount: number,
  widths?: Array<number | null>,
  existingColgroup?: ProseMirrorNode,
): ProseMirrorNode {
  const colgroupType = getNodeType(schema, names.colgroup);
  const colType = getNodeType(schema, names.col);
  const existingWidths = existingColgroup ? expandColgroupWidths(existingColgroup, columnCount) : [];
  const cols = Array.from({ length: columnCount }, (_value, index) =>
    colType.create({
      span: null,
      width: normalizeColumnWidth(widths?.[index] ?? existingWidths[index] ?? null),
    }),
  );

  return colgroupType.create(null, cols);
}

function expandColgroupWidths(colgroup: ProseMirrorNode, targetWidth: number): Array<number | null> {
  const widths: Array<number | null> = [];

  colgroup.forEach((col) => {
    const span = Math.max(1, Number(col.attrs.span ?? 1));
    const width = normalizeColumnWidth(col.attrs.width ?? null);
    for (let offset = 0; offset < span && widths.length < targetWidth; offset += 1) {
      widths.push(width);
    }
  });

  return widths;
}

function normalizeColumnWidth(value: unknown): number | null {
  const width = Number(value);
  return Number.isFinite(width) && width > 0 ? width : null;
}

function replaceTableAndSelectRow(
  state: EditorState,
  dispatch: Parameters<Command>[1],
  context: TableContext,
  table: ProseMirrorNode,
  targetSectionName: HtmlTableSectionName,
  targetSectionIndex: number,
  targetRowIndexInSection: number,
): boolean {
  if (dispatch) {
    const transaction = state.tr.replaceWith(context.tablePos, context.tablePos + context.table.nodeSize, table);
    const nextContext: TableContext = {
      ...context,
      table,
    };
    const grid = createHtmlTableGrid(table, { names: context.names });
    const targetRow = grid.rows.find(
      (row) =>
        row.section === targetSectionName &&
        row.sectionIndex === targetSectionIndex &&
        row.rowIndexInSection === targetRowIndexInSection,
    );
    const targetCell = targetRow
      ? grid.cells.find((cell) => cell.rowIndex === targetRow.rowIndex && cell.cellIndex === 0)
      : undefined;
    const targetCellPos = targetCell ? findCellPosition(nextContext, targetCell) : undefined;

    if (targetCellPos !== undefined) {
      transaction.setSelection(TextSelection.near(transaction.doc.resolve(targetCellPos + 1), 1));
    }

    dispatch(transaction.scrollIntoView());
  }

  return true;
}

function getSectionNodeName(names: HtmlTableNodeNames, sectionName: HtmlTableSectionName): string {
  if (sectionName === 'head') return names.head;
  if (sectionName === 'body') return names.body;
  return names.foot;
}

function convertRowForSection(
  schema: Schema,
  names: HtmlTableNodeNames,
  row: ProseMirrorNode,
  targetSectionName: HtmlTableSectionName,
): ProseMirrorNode {
  const shouldUseHeaderCells = targetSectionName === 'head';
  const rowChildren = getChildren(row).map((cell) =>
    convertCellType(schema, names, cell, shouldUseHeaderCells ? 'header' : 'body'),
  );

  return row.copy(Fragment.fromArray(rowChildren));
}

function getNodeType(schema: Schema, name: string) {
  const nodeType = schema.nodes[name];

  if (!nodeType) {
    throw new Error(`Missing node type in schema: ${name}`);
  }

  return nodeType;
}

function countSections(table: ProseMirrorNode, sectionNodeName: string): number {
  let count = 0;

  table.forEach((child) => {
    if (child.type.name === sectionNodeName) count += 1;
  });

  return count;
}

function countAnchorsBeforeColumn(grid: HtmlTableGrid, rowIndex: number, columnIndex: number): number {
  return grid.cells.filter((cell) => cell.rowIndex === rowIndex && cell.columnIndex < columnIndex).length;
}

function countPreviousSections(
  table: ProseMirrorNode,
  names: HtmlTableNodeNames,
  sectionName: HtmlTableSectionName,
  sectionChildIndex: number,
): number {
  let count = 0;

  table.forEach((section, _offset, childIndex) => {
    if (childIndex >= sectionChildIndex) return;
    if (getSectionName(section, names) === sectionName) {
      count += 1;
    }
  });

  return count;
}

function findGlobalRowIndexByNode(grid: HtmlTableGrid, row: ProseMirrorNode): number {
  return grid.rows.find((item) => item.node === row)?.rowIndex ?? 0;
}

function getCellAtColumn(grid: HtmlTableGrid, rowIndex: number, columnIndex: number): HtmlTableCellRef | undefined {
  return grid.slots[rowIndex]?.[columnIndex]?.cell;
}

function isHeaderCell(names: HtmlTableNodeNames, cell: ProseMirrorNode): boolean {
  return cell.type.name === names.headerCell;
}

function convertCellType(
  schema: Schema,
  names: HtmlTableNodeNames,
  cell: ProseMirrorNode,
  kind: 'header' | 'body',
): ProseMirrorNode {
  const targetType = getNodeType(schema, kind === 'header' ? names.headerCell : names.cell);

  if (cell.type === targetType) return cell;

  return targetType.create(cell.attrs, cell.content, cell.marks);
}

function copyCellWithAttrs(cell: ProseMirrorNode, attrs: Record<string, unknown>): ProseMirrorNode {
  return cell.type.create(
    {
      ...cell.attrs,
      ...attrs,
    },
    cell.content,
    cell.marks,
  );
}

function copyCellNode(
  cell: ProseMirrorNode,
  attrs: Record<string, unknown>,
  content: Fragment,
): ProseMirrorNode {
  return cell.type.create(
    {
      ...cell.attrs,
      ...attrs,
    },
    content,
    cell.marks,
  );
}

function mergeCellContent(cells: HtmlTableCellRef[]): Fragment {
  const nodes: ProseMirrorNode[] = [];

  for (const cell of cells) {
    cell.node.forEach((child) => nodes.push(child));
  }

  return Fragment.fromArray(nodes);
}

function normalizeColwidth(value: unknown, colSpan: number): number[] | null {
  if (!Array.isArray(value)) return null;

  const widths = value
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item > 0)
    .slice(0, colSpan);

  return widths.length > 0 ? widths : null;
}

function getNormalizeOptions(options: HtmlTableCommandOptions) {
  return options.names ? { names: options.names } : {};
}
