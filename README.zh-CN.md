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

playground 内置了一个完整 HTML 表格示例，包含 `caption`、`colgroup`、`thead`、`tbody` 和 `tfoot`，同时提供了行列编辑、表头切换、单元格导航和表格选择相关的工具栏按钮。

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

### Core commands

当前 core 包公开了这些表格命令：

```ts
import {
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  deleteColumn,
  deleteRow,
  deleteTable,
  fixTables,
  goToNextCell,
  goToPreviousCell,
  insertHtmlTable,
  mergeCells,
  mergeOrSplit,
  selectCell,
  selectColumn,
  selectRow,
  selectTable,
  setCellAttribute,
  splitCell,
  toggleHeaderCell,
  toggleHeaderColumn,
  toggleHeaderRow,
} from 'prosemirror-html-table';
```

当前支持的命令集合：

```txt
insertHtmlTable
addRowBefore
addRowAfter
deleteRow
addColumnBefore
addColumnAfter
deleteColumn
deleteTable
mergeCells
splitCell
mergeOrSplit
fixTables
setCellAttribute
toggleHeaderCell
toggleHeaderRow
toggleHeaderColumn
goToNextCell
goToPreviousCell
selectCell
selectRow
selectColumn
selectTable
```

这些命令内部都基于感知 section 的 grid。当前已经覆盖独立单元格选择、矩形合并、已合并单元格拆分，以及通过 `fixTables` 做整表规范化。

表头相关命令会在 `htmlTableHeaderCell` 和 `htmlTableCell` 之间转换，同时保留单元格属性、内容和 marks。

选择命令对单元格、行和列范围使用专用的 `CellSelection`，整表选择仍然使用 `NodeSelection`。

### Tiptap 交互层

Tiptap 包目前包含：

```txt
- 支持可选 wrapper 的自定义 table node view
- 列宽拖拽手柄
- 持久化的 colgroup / colwidth 状态
- selected-cell decorations
- Tab / Shift-Tab 导航
- Shift-Arrow 单元格范围扩展
```

可用选项：

```ts
{
  HTMLAttributes: {},
  resizable: true,
  renderWrapper: true,
  handleWidth: 6,
  cellMinWidth: 120,
  lastColumnResizable: true,
  allowTableNodeSelection: true,
}
```

### Tiptap 使用方式

```ts
import { Editor } from '@tiptap/core';
import { HtmlTableExtensions } from 'tiptap-html-table';

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
editor.commands.setHtmlTableCellAttribute('colspan', 2);
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
editor.commands.mergeOrSplitHtmlTableCells();
editor.commands.fixHtmlTables();
editor.commands.deleteHtmlTable();
```

`goToNextHtmlTableCell` 和 `goToPreviousHtmlTableCell` 支持可选的循环导航：

```ts
editor.commands.goToNextHtmlTableCell({ cycle: true });
```

## Roadmap

下一阶段的主要方向：

```txt
1. 可选的行列控制 UI 组件
2. 更丰富的键盘快捷键和 copy/paste 行为
3. 单元格范围 copy/paste
4. 行列移动 / 复制控制
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
