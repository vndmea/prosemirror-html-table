export class TableResizeLifecycle {
  private readonly ownerDocument: Document;
  private readonly onMove: (event: MouseEvent) => void;
  private readonly onEnd: () => void;
  private active = false;

  constructor(
    ownerDocument: Document,
    onMove: (event: MouseEvent) => void,
    onEnd: () => void,
  ) {
    this.ownerDocument = ownerDocument;
    this.onMove = onMove;
    this.onEnd = onEnd;
  }

  start(): void {
    if (this.active) {
      return;
    }

    this.ownerDocument.addEventListener('mousemove', this.onMove);
    this.ownerDocument.addEventListener('mouseup', this.onEnd);
    this.active = true;
  }

  stop(): void {
    if (!this.active) {
      return;
    }

    this.ownerDocument.removeEventListener('mousemove', this.onMove);
    this.ownerDocument.removeEventListener('mouseup', this.onEnd);
    this.active = false;
  }

  destroy(): void {
    this.stop();
  }
}

export function applyTableColumnPreviewWidths(
  table: HTMLTableElement,
  widths: number[],
  minColumnWidth: number,
): void {
  const totalWidth = widths.reduce((sum, width) => sum + width, 0);
  table.style.tableLayout = 'fixed';
  table.style.minWidth = `${Math.max(minColumnWidth, totalWidth)}px`;
  table.style.width = `${totalWidth}px`;

  const colElements = Array.from(table.querySelectorAll('col'));
  colElements.forEach((col, index) => {
    const width = widths[index];
    if (!width) return;

    col.setAttribute('width', String(width));
    (col as HTMLElement).style.width = `${width}px`;
  });
}
