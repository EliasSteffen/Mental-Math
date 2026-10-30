// DOM-Helfer: kein innerHTML, keine Inline-Styles, nie append(null).
const SVG_NS = 'http://www.w3.org/2000/svg';

export const app: HTMLElement = document.getElementById('app') ?? document.body;

/** Beliebiger Event-Handler (Parametertyp wird am Aufrufort annotiert). */
export type Handler = (event: never) => unknown;
export type AttrValue = string | number | boolean | null | undefined | Handler;
export type Attrs = Record<string, AttrValue> | null | undefined;
export type Child = Node | string | number | boolean | null | undefined | readonly Child[];

function applyAttrs(el: Element, attrs: Attrs): void {
  if (!attrs) return;
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = String(value);
    else if (key === 'text') el.textContent = String(value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value as unknown as EventListener);
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, String(value));
  }
}

export function appendChildren(el: Element, children: readonly Child[]): void {
  for (const child of children) {
    if (child === undefined || child === null || child === false) continue;
    if (Array.isArray(child)) { appendChildren(el, child as readonly Child[]); continue; }
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Attrs, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  applyAttrs(el, attrs);
  appendChildren(el, children);
  return el;
}

export function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs?: Record<string, string | number>): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs ?? {})) el.setAttribute(k, String(v));
  return el;
}
