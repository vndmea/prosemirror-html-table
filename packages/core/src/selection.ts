import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { Selection, TextSelection, type SelectionBookmark } from 'prosemirror-state';
import type { Mappable } from 'prosemirror-transform';

export class CellSelection extends Selection {
  constructor(
    $anchorCell: ReturnType<ProseMirrorNode['resolve']>,
    $headCell: ReturnType<ProseMirrorNode['resolve']>,
    readonly anchorCellPos: number,
    readonly headCellPos: number,
  ) {
    super($anchorCell, $headCell);
  }

  static create(doc: ProseMirrorNode, anchorCellPos: number, headCellPos = anchorCellPos): CellSelection {
    return new CellSelection(
      doc.resolve(anchorCellPos + 1),
      doc.resolve(headCellPos + 1),
      anchorCellPos,
      headCellPos,
    );
  }

  static fromJSON(doc: ProseMirrorNode, json: { anchorCellPos: number; headCellPos: number }): CellSelection {
    return CellSelection.create(doc, json.anchorCellPos, json.headCellPos);
  }

  map(doc: ProseMirrorNode, mapping: Mappable): Selection {
    const anchorCellPos = mapping.map(this.anchorCellPos);
    const headCellPos = mapping.map(this.headCellPos);

    if (!isValidCellPosition(doc, anchorCellPos) || !isValidCellPosition(doc, headCellPos)) {
      const fallbackPos = clampSelectionPos(doc, Math.min(anchorCellPos, headCellPos));
      return TextSelection.near(doc.resolve(fallbackPos));
    }

    return CellSelection.create(doc, anchorCellPos, headCellPos);
  }

  eq(selection: Selection): boolean {
    return (
      selection instanceof CellSelection &&
      selection.anchorCellPos === this.anchorCellPos &&
      selection.headCellPos === this.headCellPos
    );
  }

  toJSON(): { type: string; anchorCellPos: number; headCellPos: number } {
    return {
      type: 'html-table-cell',
      anchorCellPos: this.anchorCellPos,
      headCellPos: this.headCellPos,
    };
  }

  getBookmark(): SelectionBookmark {
    return new CellBookmark(this.anchorCellPos, this.headCellPos);
  }
}

export function isCellSelection(selection: Selection): selection is CellSelection {
  return selection instanceof CellSelection;
}

class CellBookmark implements SelectionBookmark {
  constructor(
    readonly anchorCellPos: number,
    readonly headCellPos: number,
  ) {}

  map(mapping: Mappable): CellBookmark {
    return new CellBookmark(mapping.map(this.anchorCellPos), mapping.map(this.headCellPos));
  }

  resolve(doc: ProseMirrorNode): Selection {
    if (!isValidCellPosition(doc, this.anchorCellPos) || !isValidCellPosition(doc, this.headCellPos)) {
      const fallbackPos = clampSelectionPos(doc, Math.min(this.anchorCellPos, this.headCellPos));
      return TextSelection.near(doc.resolve(fallbackPos));
    }

    return CellSelection.create(doc, this.anchorCellPos, this.headCellPos);
  }
}

Selection.jsonID('html-table-cell', CellSelection);
CellSelection.prototype.visible = false;

function isValidCellPosition(doc: ProseMirrorNode, pos: number): boolean {
  if (pos < 0 || pos >= doc.content.size) return false;

  const node = doc.nodeAt(pos);
  return node?.type.name === 'htmlTableCell' || node?.type.name === 'htmlTableHeaderCell';
}

function clampSelectionPos(doc: ProseMirrorNode, pos: number): number {
  return Math.max(0, Math.min(pos, doc.content.size));
}
