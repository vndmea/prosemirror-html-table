# prosemirror-html-table

[English](README.md) | 简体中文

面向完整 HTML 表格结构的 ProseMirror 表格基础包。

## 安装

```bash
npm install prosemirror-html-table
```

## 能力

- 完整 HTML table schema 工具
- 感知 section 的 grid 与 `HtmlTableMap`
- 行、列、section、合并 / 拆分、规范化命令
- `CellSelection` 与相关表格工具

## 用法

```ts
import {
  HtmlTableMap,
  createHtmlTableGrid,
  fixTables,
  insertHtmlTable,
} from 'prosemirror-html-table';

const grid = createHtmlTableGrid(tableNode);
const tableMap = HtmlTableMap.get(tableNode);
```

这个包只提供 ProseMirror 核心能力，不包含 Tiptap 扩展或默认 UI 样式。
