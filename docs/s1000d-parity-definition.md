# S1000D Parity Definition

This document is the source-controlled Phase 0 baseline for aligning `packages/s1000d` with `packages/tiptap`.

## Baseline

- UI and interaction baseline:
  - `packages/tiptap/src/html-table-overlay-view.ts`
  - `packages/tiptap/src/html-table-menu-controller.ts`
  - `packages/tiptap/src/html-table-context-menu.ts`
  - `packages/tiptap/src/html-table-interaction.ts`
  - `packages/tiptap/src/table-interaction/*`
- Validation baseline:
  - `tests/e2e/table-official-parity.spec.ts`
  - `tests/e2e/table-interactions.spec.ts`

## Allowed Long-Term Differences

- Schema and node names
- S1000D DOM mapping
- S1000D geometry and grid adapters
- XML, CALS, `tgroup`, `colspec`, `spanspec`, `namest`, `nameend`, `morerows` semantics

Everything else should converge.

## Parity Areas

| Area | Tiptap Baseline | S1000D Status | Phase |
| --- | --- | --- | --- |
| Overlay host and viewport geometry | Package-owned | Already reusing shared pieces | Keep aligned |
| Interaction state fields | Package-owned plugin | Missing shared state model | P1 -> P2 |
| Menu lifecycle and keyboard model | Package-owned | Demo-owned | P1 -> P3 |
| Action registry and grouping | Package-owned | Demo-owned | P3 -> P4 |
| Handle visibility priority | Package-owned | Partial in overlay | P1 -> P5 |
| Extend controls and control suppression | Package-owned | Partial CSS, incomplete behavior | P5 |
| Row and column drag lifecycle | Package-owned | Missing | P5 |
| E2E parity matrix | Official parity specs | Demo-oriented coverage only | P7 |

## Completion Criteria

S1000D parity is complete only when:

1. Package-owned UI and interaction behavior no longer depend on `examples/s1000d-react-demo/src/App.tsx`.
2. Shared interaction and menu primitives live under `packages/tiptap/src/table-interaction/*` or an equivalent shared layer.
3. S1000D consumes shared interaction primitives through adapters instead of copying HTML-specific controllers.
4. A dedicated S1000D parity spec mirrors the intent of `table-official-parity.spec.ts`.
