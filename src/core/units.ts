// Einheiten-Algebra (Liste aus [Basiseinheit, Exponent], ungekürzt) und Zehnerpotenz-Darstellung
export type UnitList = Array<[string, number]>;

export function parseU(str: string): UnitList {
  const [n, d] = String(str).split('/');
  const part = (s: string | undefined, sign: number): UnitList =>
    s && s !== '1' ? s.replace(/[()]/g, '').split('·').map((x): [string, number] => [x.trim(), sign]) : [];
  return [...part(n, 1), ...part(d, -1)];
}
export const uMul = (a: UnitList, b: UnitList): UnitList => [...a, ...b];
export const uDiv = (a: UnitList, b: UnitList): UnitList => [...a, ...b.map(([n, e]): [string, number] => [n, -e])];
export const uInv = (a: UnitList): UnitList => a.map(([n, e]): [string, number] => [n, -e]);
export function uMap(list: UnitList): UnitList {
  const m = new Map<string, number>();
  for (const [n, e] of list) m.set(n, (m.get(n) || 0) + e);
  return [...m].filter(([, e]) => e !== 0);
}
export function uStr(list: UnitList): string {
  const m = uMap(list);
  const sup = (e: number) => String(e).replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(d)] ?? d);
  const num = m.filter(([, e]) => e > 0).map(([n, e]) => (e === 1 ? n : `${n}${sup(e)}`)).sort();
  const den = m.filter(([, e]) => e < 0).map(([n, e]) => (e === -1 ? n : `${n}${sup(-e)}`)).sort();
  if (!num.length && !den.length) return 'dimensionslos';
  const top = num.length ? num.join('·') : '1';
  if (!den.length) return top;
  return `${top}/${den.length > 1 ? `(${den.join('·')})` : den[0]}`;
}
// Ungekürzte Bruchschreibweise, z. B. "(€ · h) / (h · Jahr)"
export function uRaw(list: UnitList): string {
  const num = list.filter(([, e]) => e > 0).map(([n]) => n);
  const den = list.filter(([, e]) => e < 0).map(([n]) => n);
  const g = (xs: string[]) => (xs.length > 1 ? `(${xs.join(' · ')})` : xs[0]);
  if (!den.length) return num.join(' · ') || '1';
  return `${num.length ? g(num) : '1'} / ${g(den)}`;
}

const SUPD = '⁰¹²³⁴⁵⁶⁷⁸⁹';
/** 10 hoch n als Text, z. B. 10⁻³ */
export const p10 = (n: number): string =>
  '10' + (n < 0 ? '⁻' : '') + String(Math.abs(n)).split('').map((c) => SUPD[+c]).join('');
