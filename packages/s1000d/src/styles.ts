const STYLE_ELEMENT_ID = 'pmht-s1000d-table-styles';

const s1000dTableStyles = `
.s1000d-table-node__wrapper,
.s1000d-table-overlay-host {
  --s1000d-table-border-color: rgba(148, 163, 184, 0.34);
  --s1000d-table-selected-bg: rgba(37, 99, 235, 0.08);
  --s1000d-table-axis-selected-bg: rgba(37, 99, 235, 0.05);
  --s1000d-table-selected-stroke: #2563eb;
  --s1000d-table-column-resize-handle-bg: #2563eb;
  --s1000d-table-handle-bg-color: #ffffff;
  --s1000d-table-extend-icon-color: #64748b;
  --s1000d-table-overlay-surface: #ffffff;
  --s1000d-table-overlay-surface-muted: #f8fafc;
  --s1000d-table-overlay-border: rgba(148, 163, 184, 0.28);
  --s1000d-table-overlay-shadow: 0 6px 16px rgba(15, 23, 42, 0.08);
  --s1000d-table-overlay-shadow-strong: 0 10px 24px rgba(15, 23, 42, 0.12);
  --s1000d-table-overlay-selected-fill: var(--s1000d-table-selected-bg);
  --s1000d-table-overlay-selected-stroke: var(--s1000d-table-selected-stroke);
  --s1000d-table-overlay-selected-stroke-strong: #1d4ed8;
  --s1000d-table-overlay-selected-stroke-width: 1px;
  --s1000d-table-overlay-handle-rest: var(--s1000d-table-handle-bg-color);
  --s1000d-table-overlay-handle-hover: #f8fafc;
  --s1000d-table-overlay-handle-selected: rgba(37, 99, 235, 0.92);
  --s1000d-table-overlay-handle-menu: #1d4ed8;
  --s1000d-table-overlay-guide: var(--s1000d-table-column-resize-handle-bg);
  --s1000d-table-overlay-danger: #b91c1c;
  --s1000d-table-overlay-danger-bg: rgba(220, 38, 38, 0.08);
  --s1000d-table-dnd-indicator-color: #2563eb;
  --s1000d-table-dnd-indicator-invalid-color: #dc2626;
  --s1000d-table-selection-gutter: 1rem;
}

.s1000d-table-node__wrapper {
  position: relative;
  width: 100%;
  overflow-x: auto;
  margin: 1.25rem 0;
  padding: 1rem 1.5rem 1.5rem 1rem;
}

.s1000d-table-node__table {
  width: 100%;
  margin: 0;
  border-collapse: collapse;
  background: #ffffff;
  table-layout: fixed;
  box-shadow: none;
}

.s1000d-table-node__table caption {
  position: relative;
  min-height: 1.4em;
  margin-bottom: 0.5rem;
  padding: 0.1rem 0 0.25rem;
  color: #334155;
  font-weight: 700;
  text-align: center;
}

.s1000d-table-node__table caption:empty,
.s1000d-table-node__table caption[data-placeholder]:has(> .ProseMirror-trailingBreak:only-child) {
  box-sizing: border-box;
  padding-left: max(0.5rem, calc(50% - 8ch));
  text-align: left;
}

.s1000d-table-node__table caption:empty::after,
.s1000d-table-node__table caption[data-placeholder]:has(> .ProseMirror-trailingBreak:only-child)::after {
  content: attr(data-placeholder);
  color: #94a3b8;
  font-weight: 400;
  white-space: nowrap;
  pointer-events: none;
}

.s1000d-table-node__table caption[data-placeholder]:has(> .ProseMirror-trailingBreak:only-child) > .ProseMirror-trailingBreak {
  display: none;
}

.s1000d-table-node__table th,
.s1000d-table-node__table td {
  position: relative;
  border: 1px solid var(--s1000d-table-border-color);
  padding: 0.5rem;
  vertical-align: top;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    background 0.15s ease;
}

.s1000d-table-node__table th {
  background: #f8fafc;
  color: #0f172a;
  font-weight: 700;
  text-align: left;
}

.s1000d-table-node__table tfoot td,
.s1000d-table-node__table tfoot th {
  background: #f8fafc;
  font-weight: 700;
}

.s1000d-table-overlay {
  position: absolute;
  inset: 0;
  z-index: 5;
  pointer-events: none;
}

.s1000d-table-overlay[hidden],
.s1000d-table-overlay [hidden] {
  display: none !important;
}

.s1000d-table-overlay button,
.s1000d-table-overlay-host button {
  box-sizing: border-box;
  appearance: none;
  margin: 0;
  font: inherit;
}

.s1000d-table-overlay__rows,
.s1000d-table-overlay__columns,
.s1000d-table-overlay__resizers {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.s1000d-table-overlay__selection-band {
  position: absolute;
  z-index: 0;
  border-radius: 2px;
  background: var(--s1000d-table-overlay-selected-fill);
  box-shadow: inset 0 0 0 var(--s1000d-table-overlay-selected-stroke-width) var(--s1000d-table-overlay-selected-stroke);
  pointer-events: none;
}

.s1000d-table-overlay__selection-band--row,
.s1000d-table-overlay__selection-band--column {
  background: var(--s1000d-table-axis-selected-bg);
}

.s1000d-table-overlay__cell-selection-fill,
.s1000d-table-overlay__cell-selection-outline,
.s1000d-table-overlay__hover-cell-fill,
.s1000d-table-overlay__hover-cell-outline,
.s1000d-table-overlay__hover-band {
  position: absolute;
  pointer-events: none;
}

.s1000d-table-overlay__cell-selection-fill {
  z-index: 2;
  border-radius: 2px;
  background: var(--s1000d-table-selected-bg);
}

.s1000d-table-overlay__cell-selection-outline {
  z-index: 3;
  border: var(--s1000d-table-overlay-selected-stroke-width) solid var(--s1000d-table-overlay-selected-stroke);
  border-radius: 2px;
}

.s1000d-table-overlay__hover-cell-fill {
  z-index: 1;
  border-radius: 2px;
  background: rgba(37, 99, 235, 0.06);
}

.s1000d-table-overlay__hover-cell-outline {
  z-index: 2;
  border: 1px dashed rgba(37, 99, 235, 0.5);
  border-radius: 2px;
}

.s1000d-table-overlay__hover-band {
  z-index: 1;
  border-radius: 2px;
  background: rgba(37, 99, 235, 0.08);
  box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.22);
}

.s1000d-table-overlay .s1000d-table-overlay__cell-selection-handle {
  position: absolute;
  top: 50%;
  right: 0;
  z-index: 4;
  width: 0.625rem;
  height: 0.625rem;
  min-width: 0;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: var(--s1000d-table-overlay-selected-stroke);
  box-shadow: none;
  pointer-events: auto;
  transform: translate(50%, -50%);
  transition:
    background 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.15s ease;
}

.s1000d-table-overlay .s1000d-table-overlay__cell-selection-handle::before {
  content: none;
}

.s1000d-table-overlay .s1000d-table-overlay__cell-selection-handle:hover,
.s1000d-table-overlay .s1000d-table-overlay__cell-selection-handle[aria-expanded="true"],
.s1000d-table-overlay .s1000d-table-overlay__cell-selection-handle.is-menu-open {
  background: var(--s1000d-table-overlay-handle-menu);
}

.s1000d-table-overlay .s1000d-table-overlay__cell-selection-handle[aria-expanded="true"] {
  transform: translate(50%, -50%);
}

.s1000d-table-overlay .s1000d-table-overlay__handle {
  position: absolute;
  z-index: 1;
  min-width: 0;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: var(--s1000d-table-overlay-handle-rest);
  box-shadow: var(--s1000d-table-overlay-shadow);
  opacity: 1;
  pointer-events: auto;
  transform: translate(-50%, -50%);
  transition:
    background 0.15s ease,
    color 0.15s ease,
    box-shadow 0.15s ease;
}

.s1000d-table-overlay .s1000d-table-overlay__handle::after {
  content: "•••";
  position: absolute;
  top: 50%;
  left: 50%;
  color: rgba(71, 85, 105, 0.92);
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.08rem;
  line-height: 1;
  transform: translate(-50%, -50%);
}

.s1000d-table-overlay .s1000d-table-overlay__handle:not(.is-hovered):not(.is-selected):not(:hover) {
  background: var(--s1000d-table-overlay-handle-rest);
}

.s1000d-table-overlay .s1000d-table-overlay__handle.is-hovered,
.s1000d-table-overlay .s1000d-table-overlay__handle.is-selected {
  background: var(--s1000d-table-overlay-handle-hover);
  box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.32);
}

.s1000d-table-overlay .s1000d-table-overlay__handle.is-menu-open {
  background: var(--s1000d-table-overlay-handle-menu);
  box-shadow: inset 0 0 0 1px rgba(29, 78, 216, 0.95);
}

.s1000d-table-overlay .s1000d-table-overlay__handle.is-hovered::after,
.s1000d-table-overlay .s1000d-table-overlay__handle.is-selected::after {
  color: var(--s1000d-table-overlay-selected-stroke);
}

.s1000d-table-overlay .s1000d-table-overlay__handle.is-menu-open::after {
  color: #ffffff;
}

.s1000d-table-overlay .s1000d-table-overlay__handle.is-dragging {
  background: var(--s1000d-table-overlay-handle-selected);
  box-shadow: inset 0 0 0 1px rgba(29, 78, 216, 0.92);
}

.s1000d-table-overlay .s1000d-table-overlay__handle.is-dragging::after {
  color: #ffffff;
}

.s1000d-table-overlay .s1000d-table-overlay__handle--row {
  min-height: 0.95rem;
  cursor: grab;
}

.s1000d-table-overlay .s1000d-table-overlay__handle--row::after {
  writing-mode: vertical-rl;
  text-orientation: mixed;
  letter-spacing: 0;
}

.s1000d-table-overlay .s1000d-table-overlay__handle--column {
  cursor: grab;
}

.s1000d-table-overlay.s1000d-table-overlay--dragging .s1000d-table-overlay__handle--row,
.s1000d-table-overlay.s1000d-table-overlay--dragging .s1000d-table-overlay__handle--column {
  cursor: grabbing;
}

.s1000d-table-overlay .s1000d-table-overlay__handle--table {
  min-width: 0.95rem;
  min-height: 0.95rem;
  cursor: pointer;
}

.s1000d-table-overlay .s1000d-table-overlay__resize-handle {
  position: absolute;
  z-index: 2;
  width: 12px;
  min-width: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  cursor: col-resize;
  pointer-events: auto;
  transform: translateX(-50%);
}

.s1000d-table-overlay .s1000d-table-overlay__resize-handle::before {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 1px;
  border-radius: 0;
  background: var(--s1000d-table-column-resize-handle-bg);
  opacity: 0;
  transform: translateX(-50%);
  transition:
    opacity 0.15s ease,
    background 0.15s ease;
}

.s1000d-table-overlay .s1000d-table-overlay__resize-handle:hover::before,
.s1000d-table-overlay .s1000d-table-overlay__resize-handle.is-active::before,
.s1000d-table-overlay.s1000d-table-overlay--resizing .s1000d-table-overlay__resize-handle::before {
  opacity: 1;
}

.s1000d-table-overlay .s1000d-table-overlay__resize-handle.is-active::before {
  background: var(--s1000d-table-column-resize-handle-bg);
}

.s1000d-table-overlay .s1000d-table-overlay__extend-button {
  position: absolute;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  padding: 0;
  border: 1px solid rgba(148, 163, 184, 0.42);
  border-radius: 999px;
  background: var(--s1000d-table-overlay-surface);
  color: rgba(148, 163, 184, 0.42);
  font-size: 0.95rem;
  font-weight: 700;
  line-height: 1;
  pointer-events: auto;
  opacity: 0;
  transform: translate(-50%, -50%);
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease,
    opacity 0.15s ease;
}

.s1000d-table-overlay .s1000d-table-overlay__extend-button:hover,
.s1000d-table-overlay .s1000d-table-overlay__extend-button:focus-visible {
  opacity: 1;
  background: var(--s1000d-table-overlay-handle-hover);
  border-color: rgba(37, 99, 235, 0.34);
  color: var(--s1000d-table-overlay-selected-stroke);
}

.s1000d-table-overlay .s1000d-table-overlay__context-trigger {
  position: absolute;
  z-index: 4;
  width: 1.35rem;
  height: 1.35rem;
  min-width: 0;
  padding: 0;
  border: 1px solid rgba(148, 163, 184, 0.36);
  border-radius: 999px;
  background: var(--s1000d-table-overlay-surface);
  box-shadow: var(--s1000d-table-overlay-shadow);
  color: var(--s1000d-table-overlay-selected-stroke);
  font-size: 0.8rem;
  font-weight: 700;
  line-height: 1;
  pointer-events: auto;
  transform: translate(-50%, -50%);
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    color 0.15s ease;
}

.s1000d-table-overlay .s1000d-table-overlay__context-trigger:hover {
  background: var(--s1000d-table-overlay-handle-hover);
  border-color: rgba(37, 99, 235, 0.32);
  box-shadow: 0 8px 18px rgba(37, 99, 235, 0.14);
}

.s1000d-table-overlay .s1000d-table-overlay__context-trigger[aria-expanded="true"] {
  background: var(--s1000d-table-overlay-handle-menu);
  border-color: var(--s1000d-table-overlay-handle-menu);
  color: #ffffff;
}

.s1000d-table-overlay .s1000d-table-overlay__context-menu {
  position: absolute;
  z-index: 6;
  display: grid;
  gap: 0.38rem;
  min-width: 12rem;
  max-width: min(20rem, calc(100vw - 2rem));
  padding: 0.55rem;
  border: 1px solid var(--s1000d-table-overlay-border);
  border-radius: 0.7rem;
  background: #ffffff;
  box-shadow: var(--s1000d-table-overlay-shadow-strong);
  overflow-y: auto;
  pointer-events: auto;
}

.s1000d-table-overlay .s1000d-table-overlay__context-menu--submenu {
  z-index: 7;
}

.s1000d-table-overlay .s1000d-table-overlay__context-menu--submenu::before {
  content: none;
}

.s1000d-table-overlay .s1000d-table-overlay__context-menu-group {
  display: grid;
  gap: 0.28rem;
}

.s1000d-table-overlay .s1000d-table-overlay__context-menu-group--stack {
  gap: 0.22rem;
}

.s1000d-table-overlay .s1000d-table-overlay__context-menu-group-title {
  color: #64748b;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  line-height: 1.2;
  text-transform: uppercase;
}

.s1000d-table-overlay .s1000d-table-overlay__context-menu-action {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 0.55rem;
  width: 100%;
  min-width: 0;
  padding: 0.48rem 0.6rem;
  border: 0;
  border-radius: 0.55rem;
  background: transparent;
  color: #0f172a;
  font-size: 0.78rem;
  font-weight: 500;
  line-height: 1.2;
  text-align: left;
  cursor: pointer;
  transform: none;
  transition:
    background 0.15s ease,
    box-shadow 0.15s ease,
    color 0.15s ease;
}

.s1000d-table-overlay .s1000d-table-overlay__context-menu-action.has-submenu::after {
  content: "›";
  margin-left: auto;
  color: #94a3b8;
  font-size: 0.95rem;
  line-height: 1;
}

.s1000d-table-overlay .s1000d-table-overlay__context-menu-action:focus-visible {
  outline: none;
  background: #eff6ff;
  box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.18);
  color: #0f172a;
}

.s1000d-table-overlay .s1000d-table-overlay__context-menu-action:hover:not(:disabled),
.s1000d-table-overlay .s1000d-table-overlay__context-menu-action[aria-expanded="true"] {
  background: #f8fafc;
  color: #0f172a;
}

.s1000d-table-overlay .s1000d-table-overlay__context-menu-action:disabled {
  color: #94a3b8;
  background: transparent;
  cursor: default;
}

.s1000d-table-overlay .s1000d-table-overlay__context-menu-action.is-active {
  background: rgba(37, 99, 235, 0.08);
  color: #1d4ed8;
}

.s1000d-table-overlay .s1000d-table-overlay__context-menu-action.is-destructive {
  color: var(--s1000d-table-overlay-danger);
}

.s1000d-table-overlay .s1000d-table-overlay__context-menu-action.is-destructive:hover:not(:disabled),
.s1000d-table-overlay .s1000d-table-overlay__context-menu-action.is-destructive:focus-visible {
  background: var(--s1000d-table-overlay-danger-bg);
  box-shadow: none;
  color: #991b1b;
}

.s1000d-table-overlay.s1000d-table-overlay--resizing,
.s1000d-table-overlay.s1000d-table-overlay--resizing * {
  cursor: col-resize;
  user-select: none;
}

.s1000d-table-cell--selected {
  background: var(--s1000d-table-selected-bg);
  box-shadow: none;
}

.s1000d-table-cell--selected.s1000d-table-cell--selected--anchor,
.s1000d-table-cell--selected.s1000d-table-cell--selected--head {
  background: var(--s1000d-table-selected-bg);
}

.s1000d-table-node--has-selection {
  box-shadow: none;
}

.s1000d-table-overlay[data-selection-scope="table"] .s1000d-table-overlay__handle--table,
.s1000d-table-overlay[data-selection-scope="row"] .s1000d-table-overlay__handle--row.is-selected,
.s1000d-table-overlay[data-selection-scope="column"] .s1000d-table-overlay__handle--column.is-selected {
  background: var(--s1000d-table-overlay-handle-selected);
}

.s1000d-table-overlay[data-selection-scope="table"] .s1000d-table-overlay__handle--table::after,
.s1000d-table-overlay[data-selection-scope="row"] .s1000d-table-overlay__handle--row.is-selected::after,
.s1000d-table-overlay[data-selection-scope="column"] .s1000d-table-overlay__handle--column.is-selected::after {
  color: #ffffff;
}
`;

export function ensureS1000DTableStyles(ownerDocument: Document): void {
  if (ownerDocument.getElementById(STYLE_ELEMENT_ID)) {
    return;
  }

  const style = ownerDocument.createElement('style');
  style.id = STYLE_ELEMENT_ID;
  style.textContent = s1000dTableStyles;
  ownerDocument.head.append(style);
}
