# prosemirror-html-table-s1000d

[English](README.md) | 简体中文

S1000D/CALS 表格支持包，基于 `prosemirror-html-table`。

这个包聚焦 `proced.xsd` 覆盖到的 S1000D 表格子集，同时也提供 `extended` profile，覆盖更宽的 CALS/S1000D 结构，例如 `spanspec`、`tfoot` 和 graphic-only table。

## 特性

- `proced` / `extended` 两套 S1000D table schema
- S1000D table 片段的 XML 导入 / 导出
- grid、map、normalize、validate 和编辑命令
- `S1000DCellSelection`
- `/tiptap`、`/clipboard`、`/renderer` 子入口

## 入口

- `prosemirror-html-table-s1000d`
  - schema、XML、validation、normalize、CALS、grid、命令

- `prosemirror-html-table-s1000d/tiptap`
  - Tiptap extensions 和 editing plugin

- `prosemirror-html-table-s1000d/clipboard`
  - clipboard 序列化、解析和应用

- `prosemirror-html-table-s1000d/renderer`
  - 最终 HTML 渲染

## 示例

- `examples/s1000d-snippets`
  - API snippets

- `examples/s1000d-react-demo`
  - React 可视化 demo
  - 本地运行：`npm run dev:demo:s1000d`
  - 或直接运行 workspace：`npm run dev --workspace s1000d-react-demo`
  - E2E：`npm run test:e2e:s1000d`
