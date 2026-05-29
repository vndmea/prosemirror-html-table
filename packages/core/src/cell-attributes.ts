import type { HtmlTableCellAttributeSpec, HtmlTableCellAttributes, HtmlTableRenderedAttributes } from './types.js';

export const defaultHtmlTableCellAttributes: HtmlTableCellAttributes = {
  colspan: {
    default: 1,
    parseHTML: (element) => Number(element.getAttribute('colspan') || 1),
    renderHTML: (attrs) => (attrs.colspan !== 1 ? { colspan: String(attrs.colspan) } : {}),
  },
  rowspan: {
    default: 1,
    parseHTML: (element) => Number(element.getAttribute('rowspan') || 1),
    renderHTML: (attrs) => (attrs.rowspan !== 1 ? { rowspan: String(attrs.rowspan) } : {}),
  },
  colwidth: {
    default: null,
    parseHTML: (element) => {
      const value = element.getAttribute('data-colwidth');
      return value ? value.split(',').map((item) => Number(item)) : null;
    },
    renderHTML: (attrs) =>
      Array.isArray(attrs.colwidth) ? { 'data-colwidth': attrs.colwidth.join(',') } : {},
  },
  textAlign: {
    default: null,
    parseHTML: (element) => normalizeStyleValue(element.style?.textAlign || element.getAttribute('align')),
    renderHTML: (attrs) =>
      typeof attrs.textAlign === 'string' && attrs.textAlign.length > 0
        ? { style: `text-align: ${attrs.textAlign};` }
        : {},
  },
  backgroundColor: {
    default: null,
    parseHTML: (element) => normalizeStyleValue(element.style?.backgroundColor),
    renderHTML: (attrs) =>
      typeof attrs.backgroundColor === 'string' && attrs.backgroundColor.length > 0
        ? { style: `background-color: ${attrs.backgroundColor};` }
        : {},
  },
  verticalAlign: {
    default: null,
    parseHTML: (element) => normalizeStyleValue(element.style?.verticalAlign),
    renderHTML: (attrs) =>
      typeof attrs.verticalAlign === 'string' && attrs.verticalAlign.length > 0
        ? { style: `vertical-align: ${attrs.verticalAlign};` }
        : {},
  },
};

export function createHtmlTableCellAttributes(
  attributes: HtmlTableCellAttributes = {},
): HtmlTableCellAttributes {
  return {
    ...defaultHtmlTableCellAttributes,
    ...attributes,
  };
}

export function getHtmlTableCellNodeSpecAttributes(
  attributes: HtmlTableCellAttributes,
): Record<string, { default: unknown }> {
  return Object.fromEntries(
    Object.entries(attributes).map(([name, attribute]) => [
      name,
      {
        default: attribute.default,
      },
    ]),
  );
}

export function parseHtmlTableCellAttributes(
  element: HTMLElement,
  attributes: HtmlTableCellAttributes,
): Record<string, unknown> {
  const parsed: Record<string, unknown> = {};

  for (const [name, attribute] of Object.entries(attributes)) {
    const value = attribute.parseHTML?.(element);
    if (value !== undefined) {
      parsed[name] = value;
    }
  }

  return parsed;
}

export function renderHtmlTableCellAttributes(
  values: Record<string, unknown>,
  attributes: HtmlTableCellAttributes,
): HtmlTableRenderedAttributes {
  const rendered: HtmlTableRenderedAttributes = {};

  for (const attribute of Object.values(attributes)) {
    const partial = attribute.renderHTML?.(values);
    if (!partial) continue;

    for (const [name, value] of Object.entries(partial)) {
      if (name === 'style' && typeof value === 'string' && value.length > 0) {
        rendered.style = mergeStyleAttribute(rendered.style, value);
        continue;
      }

      rendered[name] = value;
    }
  }

  return rendered;
}

export function createTiptapHtmlTableCellAttributes(
  attributes: HtmlTableCellAttributes = {},
): Record<string, HtmlTableCellAttributeSpec> {
  return createHtmlTableCellAttributes(attributes);
}

function normalizeStyleValue(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function mergeStyleAttribute(
  existing: HtmlTableRenderedAttributes['style'] | undefined,
  next: string,
): string {
  const existingValue = typeof existing === 'string' ? existing.trim() : '';
  const nextValue = next.trim();
  if (!existingValue) return nextValue;
  if (!nextValue) return existingValue;
  return `${existingValue} ${nextValue}`;
}
