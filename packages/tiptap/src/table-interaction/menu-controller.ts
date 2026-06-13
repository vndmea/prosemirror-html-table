export function shouldCloseMenuForTarget(
  target: EventTarget | null,
  ...elements: Array<Pick<Element, 'contains'> | null>
): boolean {
  return !elements.some((element) => element && containsEventTarget(element, target));
}

export function isMenuDismissKey(key: string): boolean {
  return key === 'Escape';
}

export function isMenuExitKey(key: string): boolean {
  return key === 'Tab';
}

export function isMenuNavigationKey(key: string): boolean {
  return key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End';
}

export function isMenuTypeaheadKey(event: {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
}): boolean {
  if (event.altKey || event.ctrlKey || event.metaKey) {
    return false;
  }

  return event.key.length === 1 && event.key.trim().length > 0;
}

export function getNextMenuActionIndex(currentIndex: number, total: number, key: string): number {
  if (total <= 0) {
    return -1;
  }

  if (key === 'Home') {
    return 0;
  }

  if (key === 'End') {
    return total - 1;
  }

  if (currentIndex < 0 || currentIndex >= total) {
    return key === 'ArrowUp' ? total - 1 : 0;
  }

  if (key === 'ArrowUp') {
    return (currentIndex - 1 + total) % total;
  }

  if (key === 'ArrowDown') {
    return (currentIndex + 1) % total;
  }

  return currentIndex;
}

export function getNextMenuTypeaheadIndex(labels: string[], currentIndex: number, query: string): number {
  if (!labels.length || !query.length) {
    return -1;
  }

  const normalizedQuery = query.toLowerCase();
  for (let offset = 1; offset <= labels.length; offset += 1) {
    const index = (Math.max(currentIndex, -1) + offset) % labels.length;
    const label = labels[index]?.trim().toLowerCase() ?? '';
    if (label.startsWith(normalizedQuery)) {
      return index;
    }
  }

  return -1;
}

export function isKeyboardClick(event: Pick<MouseEvent, 'detail'>): boolean {
  return event.detail === 0;
}

export function canRestoreMenuFocus(target: HTMLButtonElement | null): target is HTMLButtonElement {
  return Boolean(target && target.isConnected && !target.hidden && target.tabIndex >= 0);
}

export class MenuTypeaheadController {
  private currentQuery = '';
  private resetTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly resetMs: number;

  constructor(resetMs = 700) {
    this.resetMs = resetMs;
  }

  advance(labels: string[], currentIndex: number, nextCharacter: string): number {
    const normalizedCharacter = nextCharacter.toLowerCase();
    const composedQuery = `${this.currentQuery}${normalizedCharacter}`;
    let nextIndex = getNextMenuTypeaheadIndex(labels, currentIndex, composedQuery);
    let nextQuery = composedQuery;

    if (nextIndex < 0) {
      nextIndex = getNextMenuTypeaheadIndex(labels, currentIndex, normalizedCharacter);
      nextQuery = normalizedCharacter;
    }

    if (nextIndex < 0) {
      return -1;
    }

    this.currentQuery = nextQuery;
    this.scheduleReset();
    return nextIndex;
  }

  reset(): void {
    this.currentQuery = '';
    if (this.resetTimer !== null) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
  }

  destroy(): void {
    this.reset();
  }

  private scheduleReset(): void {
    if (this.resetTimer !== null) {
      clearTimeout(this.resetTimer);
    }

    this.resetTimer = setTimeout(() => {
      this.currentQuery = '';
      this.resetTimer = null;
    }, this.resetMs);
  }
}

function containsEventTarget(
  element: Pick<Element, 'contains'>,
  target: EventTarget | null,
): boolean {
  if (!target) {
    return false;
  }

  if (target === (element as unknown as EventTarget)) {
    return true;
  }

  try {
    return element.contains(target as Node);
  } catch {
    return false;
  }
}
