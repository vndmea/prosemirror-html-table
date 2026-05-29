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

    Object.assign(rendered, partial);
  }

  return rendered;
}

export function createTiptapHtmlTableCellAttributes(
  attributes: HtmlTableCellAttributes = {},
): Record<string, HtmlTableCellAttributeSpec> {
  return createHtmlTableCellAttributes(attributes);
}
