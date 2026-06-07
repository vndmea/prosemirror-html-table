# prosemirror-html-table

[English](https://github.com/vndmea/prosemirror-html-table/blob/main/README.md) | 简体中文

面向 ProseMirror 的完整 HTML 表格引擎。

这个项目适用于需要保留和操作比默认 ProseMirror / Tiptap 表格模型更丰富 HTML 表格语义的编辑器，包括：

- `caption`
- `colgroup`
- `col`
- `thead`
- `tbody`
- `tfoot`
- `tr`
- `th`
- `td`

## Packages

```txt
packages/core    ProseMirror schema helper、表格模型类型、grid 工具和命令
packages/tiptap  基于 core 包构建的 Tiptap v3 节点扩展和命令封装
```

## Playground

仓库提供了一个基于 Vue 3 + Tiptap v3 的 playground，位置在 `examples/vue3-tiptap-table`。

在线体验：

[Playground](https://vndmea.github.io/prosemirror-html-table/)

本地运行：

```bash
npm install
npm run dev --workspace vue3-tiptap-table-demo
```

playground 内置了一个完整 HTML 表格示例，包含 `caption`、`colgroup`、`thead`、`tbody` 和 `tfoot`，同时提供行列手柄、多级上下文菜单、resize 与扩展控件、selection overlay，以及一个聚焦表级操作的精简工具栏。

## Install

```bash
npm install prosemirror-html-table
```

如果你在 Tiptap 项目中使用：

```bash
npm install tiptap-html-table prosemirror-html-table
```

## Current capabilities

### 完整 HTML 表格结构

schema 基础层支持完整的 HTML 表格结构：

```txt
htmlTable
  ├── htmlTableCaption?
  ├── htmlTableColgroup?
  │   └── htmlTableCol+
  ├── htmlTableHead?
  │   └── htmlTableRow+
  ├── htmlTableBody+
  │   └── htmlTableRow+
  └── htmlTableFoot?
      └── htmlTableRow+
```

行节点内部包含 `htmlTableHeaderCell` 和 `htmlTableCell`，分别渲染为 `th` 和 `td`。

### 感知 section 的 grid 模型

`createHtmlTableGrid` 会把 `thead`、`tbody` 和 `tfoot` 中的行映射为一个统一的逻辑 grid。它会跟踪行索引、列索引、section 名称、`rowspan`、`colspan`，以及某个 slot 是否为跨行跨列单元格的锚点。

```ts
import { createHtmlTableGrid } from 'prosemirror-html-table';

const grid = createHtmlTableGrid(tableNode);
```

### TableMap 风格适配层

`HtmlTableMap` 在 `createHtmlTableGrid` 之上提供了一个能感知 section 的兼容层。它会保留相对 table 起点的位置，并暴露 `width`、`height`、`map`、`cellPositions`，以及与官方 `TableMap` 对齐的 `findCell`、`rectBetween`、`cellsInRect`、`positionAt`、`nextCell`。

```ts
import { HtmlTableMap } from 'prosemirror-html-table';

const tableMap = HtmlTableMap.get(tableNode);
const firstCellRect = tableMap.findCell(tableMap.map[0]!);
```

### Core commands

当前 core 包公开了感知 section 的命令集合：

```txt
结构：    insertHtmlTable、fixTables、deleteTable
行：      addRowBefore、addRowAfter、addRowToHead、addRowToBody、addRowToFoot、
          deleteRow、duplicateRow、moveRowUp、moveRowDown、
          moveRowToHead、moveRowToBody、moveRowToFoot
列：      addColumnBefore、addColumnAfter、deleteColumn、duplicateColumn、
          moveColumnLeft、moveColumnRight、setColumnWidth、
          fitTableToWidth、distributeColumns
Section： addHeadSection、removeHeadSection、addFootSection、removeFootSection
HTML：    setCaption、removeCaption、setColgroup、removeColgroup
单元格：  mergeCells、splitCell、mergeOrSplit、clearSelectedCells、
          clearRowContent、clearColumnContent
格式化：  setCellAttribute、setCellTextAlign、setCellBackgroundColor、
          setCellVerticalAlign、toggleHeaderCell、toggleHeaderRow、
          toggleHeaderColumn
选择：    selectCell、selectRow、selectColumn、selectTable、
          goToNextCell、goToPreviousCell
数据：    sortBodyRowsByColumn
```

这些命令内部都基于感知 section 的 grid。当前已经覆盖独立单元格选择、矩形合并、已合并单元格拆分、行列移动与复制、section 操作，以及通过 `fixTables` 做整表规范化。

表头相关命令会在 `htmlTableHeaderCell` 和 `htmlTableCell` 之间转换，同时保留单元格属性、内容和 marks。

选择命令对单元格、行和列范围使用专用的 `CellSelection`，整表选择仍然使用 `NodeSelection`。

### Tiptap 交互层

Tiptap 包目前包含：

```txt
- 支持可选 wrapper 的自定义 table node view
- 具有显式选择状态的行列手柄
- 单元格、行和列操作的多级上下文菜单
- 行列扩展控件
- 带拖拽预览的列宽调整手柄
- 表格菜单中的适配宽度与平均分配列宽
- 持久化的 colgroup / colwidth 状态
- 单元格、行、列和整表的选择视觉效果
- 单元格内的原生文字选择
- Tab / Shift-Tab 导航
- Shift-Arrow 单元格范围扩展
- 选中整张表全部单元格时支持 Backspace / Delete 删除整表
```

可用选项：

```ts
{
  HTMLAttributes: {},
  resizable: true,
  renderWrapper: true,
  handleWidth: 1,
  cellMinWidth: 120,
  lastColumnResizable: true,
  allowTableNodeSelection: true,
  enableRowColumnDrag: true,
  allowCrossSectionRowDrag: false,
  enableTabNavigation: true,
  addRowOnTabAtEnd: true,
  enableShiftArrowSelection: true,
  constrainShiftArrowToSection: true,
  deleteTableOnAllCellsSelected: true,
  View: null,
  wrapperClassName: 'html-table-node__wrapper',
  selectedCellClassName: 'html-table-cell--selected',
  selectedTableClassName: 'html-table-node--selected',
}
```

默认支持通过行/列 handle 拖拽重排；只有在开启 `allowCrossSectionRowDrag` 时，行才允许跨 `thead` / `tbody` / `tfoot` 拖动。

可用 `editor.commands.fitHtmlTableToWidth()` 测量当前 table wrapper，并持久化 table width 与 `colgroup` / `colwidth`；可用 `editor.commands.distributeHtmlTableColumns()` 平均分配列宽。

快捷键：

| 快捷键 | 行为 |
| --- | --- |
| `Tab` | 移动到下一个单元格；在最后一个单元格时可按配置自动补一行并继续移动。 |
| `Shift-Tab` | 移动到上一个单元格。 |
| `Shift-ArrowLeft/Right/Up/Down` | 将当前 `CellSelection` 扩展到相邻单元格。 |
| `Backspace` / `Delete` | 当所有逻辑单元格都被选中时删除整张表。 |
| `Mod-Backspace` / `Mod-Delete` | 在 macOS / 平台修饰键场景下执行同样的整表删除行为。 |

默认情况下，`Shift-Arrow` 会把 `thead`、`tbody`、`tfoot` 的边界当作硬边界。如果需要跨 section 扩展选区，可将 `constrainShiftArrowToSection` 设为 `false`。

### Tiptap 使用方式

```ts
import { Editor } from '@tiptap/core';
import { HtmlTableExtensions } from 'tiptap-html-table';
import 'tiptap-html-table/styles.css';

const editor = new Editor({
  extensions: [
    // 在这里加入你的 document、paragraph、text 以及其他基础扩展。
    ...HtmlTableExtensions,
  ],
});

editor.commands.insertHtmlTable({
  rows: 3,
  cols: 3,
  withHeaderRow: true,
  withCaption: true,
  captionText: 'Demo table',
});

editor.commands.addHtmlTableRowAfter();
editor.commands.addHtmlTableColumnAfter();
editor.commands.deleteHtmlTableRow();
editor.commands.deleteHtmlTableColumn();
editor.commands.duplicateHtmlTableRow();
editor.commands.duplicateHtmlTableColumn();
editor.commands.moveHtmlTableRowDown();
editor.commands.moveHtmlTableColumnRight();
editor.commands.sortHtmlTableBodyRowsByColumn({ direction: 'asc' });
editor.commands.setHtmlTableCellAttribute('colspan', 2);
editor.commands.setHtmlTableCellTextAlign('center');
editor.commands.setHtmlTableCellBackgroundColor('#dbeafe');
editor.commands.toggleHtmlTableHeaderCell();
editor.commands.toggleHtmlTableHeaderRow();
editor.commands.toggleHtmlTableHeaderColumn();
editor.commands.goToNextHtmlTableCell();
editor.commands.goToPreviousHtmlTableCell();
editor.commands.selectHtmlTableCell();
editor.commands.selectHtmlTableRow();
editor.commands.selectHtmlTableColumn();
editor.commands.selectHtmlTable();
editor.commands.mergeHtmlTableCells();
editor.commands.splitHtmlTableCell();
editor.commands.fixHtmlTables();
editor.commands.deleteHtmlTable();
```

`goToNextHtmlTableCell` 和 `goToPreviousHtmlTableCell` 支持可选的循环导航：

```ts
editor.commands.goToNextHtmlTableCell({ cycle: true });
```

## 与 `prosemirror-tables` 的差异

本项目不是 `prosemirror-tables` 的直接替代品。

- 本项目保留完整 HTML table section 与元素，而 `prosemirror-tables` 默认使用更简单的表格树结构。
- `HtmlTableMap` 现在提供了一个能感知 section 的 `TableMap` 风格适配层，但完整的 `prosemirror-tables` 命令和插件兼容性仍未全部覆盖。
- 当前 `CellSelection` 和 Tiptap 交互插件覆盖了本项目的编辑 UI，但尚未提供官方 `CellSelection` 与 `tableEditing()` 的全部 API 和插件行为。
- 单元格范围 clipboard、官方风格的 editing plugin、增量表格修复和兼容适配层仍属于后续工作。
- `setCellAttribute` 当前只修改当前单元格；需要对 selection 批量格式化时，请使用专用的文本对齐、背景色和垂直对齐命令。
- 当前 `Shift-Arrow` 范围扩展会将 section 边界视为不可跨越的边界。

## Roadmap

下一阶段的主要方向：

```txt
1. 扩展 CellSelection API，并让 selection mapping 全面支持自定义节点名
2. 增加包含单元格范围 clipboard 和删除行为的 core editing plugin
3. 将表格修复拆分为增量 transaction API 与 command wrapper
4. 在 `HtmlTableMap` 之外继续扩展兼容适配层
5. 加固非法 HTML / Excel / Word 导入和大表格性能
```

## Development

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run build
```

运行 Vue demo：

```bash
npm run dev --workspace vue3-tiptap-table-demo
```

## License

MIT
