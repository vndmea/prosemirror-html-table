# tiptap-html-table

[English](README.md) | 简体中文

面向完整 HTML 表格结构的 Tiptap v3 扩展包。

## 安装

```bash
npm install tiptap-html-table prosemirror-html-table
```

## 用法

```ts
import { Editor } from '@tiptap/core';
import { HtmlTableExtensions } from 'tiptap-html-table';
import 'tiptap-html-table/styles.css';

const editor = new Editor({
  extensions: [...HtmlTableExtensions],
});
```

## 包含内容

- `table`、`caption`、`colgroup`、`thead`、`tbody`、`tfoot`
- 基于 `prosemirror-html-table` 的命令封装
- node view、交互插件、手柄、overlay 和上下文菜单
- 表格宽度适配、平均分配列宽
- clipboard、cut、paste、删除等行为
- 默认 CSS 主题

可以通过自定义 CSS variables 和 class 样式覆盖默认外观。
