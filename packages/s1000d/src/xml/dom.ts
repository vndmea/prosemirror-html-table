export interface XmlElement {
  localName: string;
  attributes: Array<{ name: string; value: string }>;
  children: Array<XmlElement | string>;
  textContent: string;
  getAttribute: (name: string) => string | null;
}

export function parseXmlDocument(xml: string): XmlElement {
  const root: XmlElement = createElement('__root__', []);
  const stack: XmlElement[] = [root];
  const tokenPattern = /<[^>]+>|[^<]+/g;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(xml))) {
    const token = match[0];
    const parent = stack[stack.length - 1];
    if (!parent) throw new Error('Invalid S1000D table XML');

    if (token.startsWith('<?') || token.startsWith('<!--')) continue;
    if (token.startsWith('</')) {
      const closingName = token.slice(2, -1).trim();
      const current = stack.pop();
      if (!current || current.localName !== closingName) {
        throw new Error(`Unexpected closing XML element: ${closingName}`);
      }
      continue;
    }
    if (token.startsWith('<')) {
      const selfClosing = token.endsWith('/>');
      const body = token.slice(1, selfClosing ? -2 : -1).trim();
      const nameEnd = body.search(/\s/);
      const name = nameEnd === -1 ? body : body.slice(0, nameEnd);
      const attrText = nameEnd === -1 ? '' : body.slice(nameEnd + 1);
      const element = createElement(name, parseAttributes(attrText));
      parent.children.push(element);
      if (!selfClosing) stack.push(element);
      continue;
    }

    const text = decodeXml(token);
    if (text.trim()) parent.children.push(text);
  }

  if (stack.length !== 1) throw new Error('Unclosed S1000D table XML element');
  const documentElement = root.children.find((child): child is XmlElement => typeof child !== 'string');
  if (!documentElement) throw new Error('Expected S1000D table XML root element');
  return documentElement;
}

export function childElements(element: XmlElement, name?: string): XmlElement[] {
  return element.children.filter((child): child is XmlElement =>
    typeof child !== 'string' && (!name || child.localName === name));
}

export function firstChildElement(element: XmlElement, name: string): XmlElement | undefined {
  return childElements(element, name)[0];
}

export function getDirectText(element: XmlElement): string {
  return element.children
    .filter((child): child is string => typeof child === 'string')
    .join('')
    .trim();
}

function createElement(
  localName: string,
  attributes: Array<{ name: string; value: string }>,
): XmlElement {
  const element: XmlElement = {
    localName,
    attributes,
    children: [],
    get textContent() {
      return this.children.map((child) => (typeof child === 'string' ? child : child.textContent)).join('');
    },
    getAttribute(name) {
      return this.attributes.find((attr) => attr.name === name)?.value ?? null;
    },
  };

  return element;
}

function parseAttributes(text: string): Array<{ name: string; value: string }> {
  const attrs: Array<{ name: string; value: string }> = [];
  const attrPattern = /([^\s=]+)\s*=\s*"([^"]*)"/g;
  let match: RegExpExecArray | null;

  while ((match = attrPattern.exec(text))) {
    const [, name, value] = match;
    if (!name || value == null) continue;
    attrs.push({ name, value: decodeXml(value) });
  }

  return attrs;
}

function decodeXml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}
