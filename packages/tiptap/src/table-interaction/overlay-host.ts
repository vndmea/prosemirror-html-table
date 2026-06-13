import type { EditorView } from '@tiptap/pm/view';

export interface TableOverlayHostOptions {
  hostClassName?: string;
  hostDataAttribute?: string;
  hostDataValue?: string;
}

export class TableOverlayHost {
  private readonly root: HTMLDivElement;
  private readonly options: Required<TableOverlayHostOptions>;
  private currentMount: HTMLElement | null = null;
  private currentHost: HTMLDivElement | null = null;
  private currentMountPositionManaged = false;

  constructor(root: HTMLDivElement, options: TableOverlayHostOptions = {}) {
    this.root = root;
    this.options = {
      hostClassName: options.hostClassName ?? 'table-overlay-host',
      hostDataAttribute: options.hostDataAttribute ?? 'data-table-overlay-host',
      hostDataValue: options.hostDataValue ?? 'true',
    };
  }

  attach(mount: HTMLElement): HTMLDivElement {
    if (
      this.currentMount === mount
      && this.currentHost
      && this.root.parentElement === this.currentHost
    ) {
      return this.currentHost;
    }

    this.detach();
    if (this.root.ownerDocument.defaultView?.getComputedStyle(mount).position === 'static') {
      mount.style.position = 'relative';
      this.currentMountPositionManaged = true;
    }

    const host = this.root.ownerDocument.createElement('div');
    host.className = this.options.hostClassName;
    host.setAttribute(this.options.hostDataAttribute, this.options.hostDataValue);
    host.setAttribute('role', 'presentation');
    host.style.position = 'absolute';
    host.style.inset = '0';
    host.style.zIndex = '5';
    host.style.pointerEvents = 'none';
    host.append(this.root);

    mount.append(host);
    this.currentMount = mount;
    this.currentHost = host;
    return host;
  }

  detach(): void {
    this.root.remove();
    this.currentHost?.remove();
    if (this.currentMount && this.currentMountPositionManaged) {
      this.currentMount.style.removeProperty('position');
    }
    this.currentMount = null;
    this.currentHost = null;
    this.currentMountPositionManaged = false;
  }
}

export function getTableOverlayMount(view: Pick<EditorView, 'dom'>): HTMLElement {
  return (view.dom.parentElement ?? view.dom) as HTMLElement;
}
