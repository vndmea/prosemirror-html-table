import { afterAll, describe, expect, it } from 'vitest';

import {
  measureS1000DRenderedTableGeometry,
  measureS1000DTableRect,
} from './overlay-geometry.js';

const OriginalHTMLElement = globalThis.HTMLElement;
const OriginalHTMLTableCellElement = globalThis.HTMLTableCellElement;

class MockHTMLElement {
  tagName: string;
  children: MockHTMLElement[] = [];
  dataset: Record<string, string> = {};
  private rect: DOMRect = createRect(0, 0, 0, 0);
  colSpan = 1;
  rowSpan = 1;

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  append(...children: MockHTMLElement[]): void {
    this.children.push(...children);
  }

  matches(selector: string): boolean {
    return selector === 'tbody[data-s1000d="tgroup"]'
      ? this.tagName === 'TBODY' && this.dataset.s1000d === 'tgroup'
      : false;
  }

  querySelectorAll(selector: string): MockHTMLElement[] {
    const matches: MockHTMLElement[] = [];
    const visit = (node: MockHTMLElement) => {
      for (const child of node.children) {
        if (selector === 'tr' && child.tagName === 'TR') {
          matches.push(child);
        }
        visit(child);
      }
    };

    visit(this);
    return matches;
  }

  getBoundingClientRect(): DOMRect {
    return this.rect;
  }

  setBoundingRect(rect: DOMRect): void {
    this.rect = rect;
  }
}

if (!globalThis.HTMLElement) {
  globalThis.HTMLElement = MockHTMLElement as unknown as typeof HTMLElement;
}
if (!globalThis.HTMLTableCellElement) {
  globalThis.HTMLTableCellElement = MockHTMLElement as unknown as typeof HTMLTableCellElement;
}

describe('s1000d overlay geometry', () => {
  it('measures the rendered grid area instead of the caption box', () => {
    const table = createMeasuredTable({
      left: 10,
      right: 370,
      top: 20,
      bottom: 128,
      captionBottom: 40,
      tgroups: [
        {
          rows: [
            {
              top: 44,
              bottom: 76,
              cells: [{ left: 10, right: 370 }],
            },
            {
              top: 76,
              bottom: 128,
              cells: [{ left: 10, right: 370 }],
            },
          ],
        },
      ],
    });

    expect(measureS1000DTableRect(table, 0)).toEqual({
      left: 10,
      right: 370,
      width: 360,
      top: 44,
      bottom: 128,
      height: 84,
    });

    expect(measureS1000DRenderedTableGeometry(table, undefined, 0).rows).toEqual([
      { index: 0, top: 0, height: 32 },
      { index: 1, top: 32, height: 52 },
    ]);
  });
});

function createMeasuredTable(options: {
  left: number;
  right: number;
  top: number;
  bottom: number;
  captionBottom?: number;
  tgroups: Array<{
    rows: Array<{
      top: number;
      bottom: number;
      cells: Array<{ left: number; right: number; colSpan?: number; rowSpan?: number }>;
    }>;
  }>;
}): HTMLTableElement {
  const table = new MockHTMLElement('table');
  mockRect(table, createRect(options.left, options.right, options.top, options.bottom));

  if (typeof options.captionBottom === 'number') {
    const caption = new MockHTMLElement('caption');
    mockRect(caption, createRect(options.left, options.right, options.top, options.captionBottom));
    table.append(caption);
  }

  for (const tgroupSpec of options.tgroups) {
    const tgroup = new MockHTMLElement('tbody');
    tgroup.dataset.s1000d = 'tgroup';

    for (const rowSpec of tgroupSpec.rows) {
      const row = new MockHTMLElement('tr');
      mockRect(row, createRect(options.left, options.right, rowSpec.top, rowSpec.bottom));

      for (const cellSpec of rowSpec.cells) {
        const cell = new MockHTMLElement('td');
        if (cellSpec.colSpan) {
          cell.colSpan = cellSpec.colSpan;
        }
        if (cellSpec.rowSpan) {
          cell.rowSpan = cellSpec.rowSpan;
        }
        mockRect(cell, createRect(cellSpec.left, cellSpec.right, rowSpec.top, rowSpec.bottom));
        row.append(cell);
      }

      tgroup.append(row);
    }

    table.append(tgroup);
  }

  return table as unknown as HTMLTableElement;
}

function mockRect(element: MockHTMLElement, rect: DOMRect): void {
  element.setBoundingRect(rect);
}

function createRect(left: number, right: number, top: number, bottom: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    right,
    top,
    bottom,
    width: right - left,
    height: bottom - top,
    toJSON: () => ({}),
  } as DOMRect;
}

afterAll(() => {
  globalThis.HTMLElement = OriginalHTMLElement;
  globalThis.HTMLTableCellElement = OriginalHTMLTableCellElement;
});
