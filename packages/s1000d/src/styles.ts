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
  --s1000d-table-overlay-surface: #ffffff;
  --s1000d-table-overlay-border: rgba(148, 163, 184, 0.28);
  --s1000d-table-overlay-shadow: 0 6px 16px rgba(15, 23, 42, 0.08);
  --s1000d-table-overlay-selected-fill: var(--s1000d-table-selected-bg);
  --s1000d-table-overlay-selected-stroke: var(--s1000d-table-selected-stroke);
  --s1000d-table-overlay-handle-rest: var(--s1000d-table-handle-bg-color);
  --s1000d-table-overlay-handle-hover: #f8fafc;
  --s1000d-table-overlay-handle-selected: rgba(37, 99, 235, 0.92);
  --s1000d-table-overlay-handle-menu: #1d4ed8;
}

.s1000d-table-node__wrapper {
  position: relative;
  width: 100%;
  overflow-x: auto;
  margin: 1rem 0;
  padding: 1rem 1.5rem 1.5rem 1rem;
}

.s1000d-table-node__table {
  width: 100%;
  margin: 0;
  border-collapse: collapse;
  background: #ffffff;
  table-layout: fixed;
}

.s1000d-table-node__table caption {
  margin-bottom: 0.5rem;
  padding: 0.1rem 0 0.25rem;
  color: #334155;
  font-weight: 700;
  text-align: center;
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
  box-shadow: inset 0 0 0 1px var(--s1000d-table-overlay-selected-stroke);
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
  border: 1px solid var(--s1000d-table-overlay-selected-stroke);
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
    box-shadow 0.15s ease;
}

.s1000d-table-overlay .s1000d-table-overlay__cell-selection-handle:hover,
.s1000d-table-overlay .s1000d-table-overlay__cell-selection-handle[aria-expanded="true"],
.s1000d-table-overlay .s1000d-table-overlay__cell-selection-handle.is-menu-open {
  background: var(--s1000d-table-overlay-handle-menu);
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

.s1000d-table-overlay .s1000d-table-overlay__handle--row {
  min-height: 0.95rem;
  cursor: pointer;
}

.s1000d-table-overlay .s1000d-table-overlay__handle--row::after {
  writing-mode: vertical-rl;
  text-orientation: mixed;
  letter-spacing: 0;
}

.s1000d-table-overlay .s1000d-table-overlay__handle--column {
  cursor: pointer;
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
  background: var(--s1000d-table-column-resize-handle-bg);
  opacity: 0;
  transform: translateX(-50%);
  transition: opacity 0.15s ease;
}

.s1000d-table-overlay .s1000d-table-overlay__resize-handle:hover::before,
.s1000d-table-overlay .s1000d-table-overlay__resize-handle.is-active::before {
  opacity: 1;
}

.s1000d-table-cell--selected {
  background: var(--s1000d-table-selected-bg);
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
