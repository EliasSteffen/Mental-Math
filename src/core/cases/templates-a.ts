// Case-Vorlagen 1–4: Marktgröße, Profitabilität, Break-even, Investition.
// Jede Vorlage wählt Basiszahlen aus einer Kandidatenliste (runde Werte, glatte Zwischenergebnisse), berechnet daraus
// alle Schritte und nennt in jedem Folgeschritt den richtigen Wert des vorigen – ein Fehler zieht keine Folgefehler nach.
import { fmt } from '../numbers.ts';
import { lw } from '../l10n.ts';
import type { Rng } from '../numbers.ts';
import { choiceStep, ct, hasDecimals, lines, money, niceThreshold, numStep, pickBuilt } from './helpers.ts';
import type { CaseTemplate, MiniCase } from './types.ts';

const f = fmt;
const once = <T>(fn: () => T): (() => T) => {
  let v: T | undefined;
  return () => (v ??= fn());
};

/* ---------- 1 · Marktgröße ---------- */

interface MarketBase { pop: number; share: number; rides: number; price: number; target: number }
const marketCands = once((): MarketBase[] => {
  const out: MarketBase[] = [];
  for (const pop of [2, 3, 4, 5, 6, 8, 10]) for (const share of [20, 25, 30, 40, 50]) {
    const g = (pop * share) / 100;
    for (const rides of [10, 12, 20, 24, 25, 30]) for (const price of [2, 3, 4, 5]) for (const target of [5, 10, 15, 20]) {
      const fl = g * rides, m = fl * price, r = (m * target) / 100;
      if (hasDecimals(g, 2) && hasDecimals(fl, 1) && Number.isInteger(m) && hasDecimals(r, 1) && r >= 3 && m >= 40 && m <= 400) {
        out.push({ pop, share, rides, price, target });
      }
    }
  }
  return out;
});

export const market: CaseTemplate = {
  id: 'market',
  title: () => ct('market.title'),
  generate(rng: Rng): MiniCase {
    return pickBuilt(marketCands(), rng, (b) => {
      const g = (b.pop * b.share) / 100, fl = g * b.rides, m = fl * b.price, r = (m * b.target) / 100;
      const min = niceThreshold(r, rng);
      if (min === null) return null;
      const ok = r > min;
      const p = { pop: f(b.pop), share: f(b.share), rides: f(b.rides), price: money('eur', b.price), target: f(b.target) };
      return {
        templateId: 'market', title: ct('market.title'), exhibit: null,
        brief: ct('market.brief', { ...p, min: money('mio', min) }),
        base: { ...b, min },
        steps: [
          numStep({
            prompt: ct('market.p1'), expected: g, unit: ct('u.mioPeople'),
            solution: lines('market.s1', { pop: f(b.pop), share: f(b.share), g: f(g) }),
          }),
          numStep({
            prompt: ct('market.p2', { g: f(g) }), expected: fl, unit: ct('u.mioRides'),
            solution: lines('market.s2', { g: f(g), rides: f(b.rides), f: f(fl) }),
          }),
          numStep({
            prompt: ct('market.p3', { f: f(fl) }), expected: m, unit: lw('Mio. €'),
            solution: lines('market.s3', { f: f(fl), price: money('eur', b.price), m: money('mio', m) }),
          }),
          numStep({
            prompt: ct('market.p4', { m: money('mio', m), target: f(b.target) }), expected: r, unit: lw('Mio. €'),
            solution: lines('market.s4', { m: money('mio', m), target: f(b.target), r: money('mio', r) }),
          }),
          choiceStep({
            prompt: ct('market.q', { r: money('mio', r), min: money('mio', min) }),
            choices: [ct('market.c.yes'), ct('market.c.no')], correctIndex: ok ? 0 : 1,
            why: ct(ok ? 'market.why.yes' : 'market.why.no', { r: money('mio', r), min: money('mio', min) }),
          }),
        ],
      };
    });
  },
};

/* ---------- 2 · Profitabilität ---------- */

interface ProfitBase { q: number; price: number; vc: number; fix: number }
const profitCands = once((): ProfitBase[] => {
  const out: ProfitBase[] = [];
  for (const q of [20, 25, 40, 50, 80, 100, 200]) for (const price of [20, 24, 25, 30, 40, 48, 50, 60]) {
    for (const vcShare of [0.4, 0.5, 0.6]) for (const fixShare of [0.1, 0.15, 0.2, 0.25, 0.3]) {
      const vc = price * vcShare, u = q * price, fix = u * fixShare;
      if (!Number.isInteger(vc) || !Number.isInteger(fix) || fix % 10 !== 0) continue;
      const gewinn = u - q * vc - fix;
      const marge = (gewinn / u) * 100;
      const d1 = 0.05 * u, d2 = 0.1 * fix;
      if (gewinn / u >= 0.08 && gewinn / u <= 0.4 && hasDecimals(marge, 1) && Math.abs(d1 - d2) >= 0.15 * Math.max(d1, d2)) {
        out.push({ q, price, vc, fix });
      }
    }
  }
  return out;
});

export const profit: CaseTemplate = {
  id: 'profit',
  title: () => ct('profit.title'),
  generate(rng: Rng): MiniCase {
    return pickBuilt(profitCands(), rng, (b) => {
      const u = b.q * b.price, v = b.q * b.vc, g = u - v - b.fix, marge = (g / u) * 100;
      const d1 = 0.05 * u, d2 = 0.1 * b.fix, priceWins = d1 > d2;
      const p = { u: money('tsd', u), v: money('tsd', v), fix: money('tsd', b.fix), g: money('tsd', g) };
      return {
        templateId: 'profit', title: ct('profit.title'), exhibit: null,
        brief: ct('profit.brief', { q: f(b.q), price: money('eur', b.price), vc: money('eur', b.vc), fix: money('tsd', b.fix) }),
        base: { ...b },
        steps: [
          numStep({
            prompt: ct('profit.p1'), expected: u, unit: lw('Tsd. €'),
            solution: lines('profit.s1', { q: f(b.q), price: money('eur', b.price), u: p.u }),
          }),
          numStep({
            prompt: ct('profit.p2'), expected: v, unit: lw('Tsd. €'),
            solution: lines('profit.s2', { q: f(b.q), vc: money('eur', b.vc), v: p.v }),
          }),
          numStep({
            prompt: ct('profit.p3', { u: p.u, v: p.v }), expected: g, unit: lw('Tsd. €'),
            solution: lines('profit.s3', { u: p.u, v: p.v, fix: p.fix, g: p.g }),
          }),
          numStep({
            prompt: ct('profit.p4', { g: p.g, u: p.u }), expected: marge, unit: '%', abs: 0.5,
            hint: hasDecimals(marge, 0) ? undefined : ct('hint.oneDecimal'),
            solution: lines('profit.s4', { g: p.g, u: p.u, m: f(marge) }),
          }),
          choiceStep({
            prompt: ct('profit.q'),
            choices: [ct('profit.c.price'), ct('profit.c.fix')], correctIndex: priceWins ? 0 : 1,
            why: ct(priceWins ? 'profit.why.price' : 'profit.why.fix', { u: p.u, fix: p.fix, d1: money('tsd', d1), d2: money('tsd', d2) }),
          }),
        ],
      };
    });
  },
};

/* ---------- 3 · Break-even ---------- */

interface BreakevenBase { price: number; db: number; fix: number; rate: number; limit: number }
const breakevenCands = once((): BreakevenBase[] => {
  const out: BreakevenBase[] = [];
  for (const price of [20, 25, 40, 50, 80, 100]) for (const dbPct of [20, 25, 30, 40, 50, 60]) {
    const db = (price * dbPct) / 100;
    if (!Number.isInteger(db)) continue;
    for (const fix of [300, 400, 500, 600, 800, 1000, 1200, 1500, 2000, 3000]) {
      const be = fix / db;
      if (!hasDecimals(be, 1)) continue;
      for (const rate of [5, 10, 20, 25, 40, 50]) {
        const months = be / rate;
        if (!(Number.isInteger(months) && months >= 4 && months <= 60)) continue;
        for (const limit of [12, 18, 24, 36]) if (Math.abs(months - limit) >= 3) out.push({ price, db, fix, rate, limit });
      }
    }
  }
  return out;
});

export const breakeven: CaseTemplate = {
  id: 'breakeven',
  title: () => ct('breakeven.title'),
  generate(rng: Rng): MiniCase {
    return pickBuilt(breakevenCands(), rng, (b) => {
      const vc = b.price - b.db, quote = (b.db / b.price) * 100, be = b.fix / b.db, months = be / b.rate;
      const ok = months <= b.limit;
      const p = { price: money('eur', b.price), vc: money('eur', vc), db: money('eur', b.db) };
      return {
        templateId: 'breakeven', title: ct('breakeven.title'), exhibit: null,
        brief: ct('breakeven.brief', { price: p.price, vc: p.vc, fix: money('tsd', b.fix), rate: f(b.rate) }),
        base: { ...b },
        steps: [
          numStep({
            prompt: ct('breakeven.p1'), expected: b.db, unit: '€',
            solution: lines('breakeven.s1', { price: p.price, vc: p.vc, db: p.db }),
          }),
          numStep({
            prompt: ct('breakeven.p2', { db: p.db, price: p.price }), expected: quote, unit: '%',
            solution: lines('breakeven.s2', { db: p.db, price: p.price, q: f(quote) }),
          }),
          numStep({
            prompt: ct('breakeven.p3', { db: p.db, fix: money('tsd', b.fix) }), expected: be, unit: ct('u.tsdPieces'),
            solution: lines('breakeven.s3', { fix: money('tsd', b.fix), db: p.db, be: f(be) }),
          }),
          numStep({
            prompt: ct('breakeven.p4', { be: f(be), rate: f(b.rate) }), expected: months, unit: ct('u.months'),
            solution: lines('breakeven.s4', { be: f(be), rate: f(b.rate), months: f(months) }),
          }),
          choiceStep({
            prompt: ct('breakeven.q', { months: f(months), limit: f(b.limit) }),
            choices: [ct('breakeven.c.yes', { limit: f(b.limit) }), ct('breakeven.c.no', { limit: f(b.limit) })], correctIndex: ok ? 0 : 1,
            why: ct(ok ? 'breakeven.why.yes' : 'breakeven.why.no', { months: f(months), limit: f(b.limit) }),
          }),
        ],
      };
    });
  },
};

/* ---------- 4 · Investition ---------- */

interface InvestBase { n: number; k: number; w: number; kma: number; wart: number; limit: number }
const investCands = once((): InvestBase[] => {
  const out: InvestBase[] = [];
  for (const n of [2, 3, 4, 5]) for (const k of [1, 1.5, 2, 2.5, 3]) for (const w of [10, 15, 20, 25, 30, 40]) {
    for (const kma of [40, 50, 60, 80]) for (const wart of [50, 100, 150, 200]) {
      const c = n * k * 1000, s = w * kma - wart;
      if (s <= 0) continue;
      const pb = c / s;
      if (![2, 2.5, 4].some((x) => Math.abs(pb - x) < 1e-9)) continue;
      for (const limit of [3, 3.5]) out.push({ n, k, w, kma, wart, limit });
    }
  }
  return out;
});

export const invest: CaseTemplate = {
  id: 'invest',
  title: () => ct('invest.title'),
  generate(rng: Rng): MiniCase {
    return pickBuilt(investCands(), rng, (b) => {
      const c = b.n * b.k, s = b.w * b.kma - b.wart, pb = (c * 1000) / s, roi = ((5 * s - c * 1000) / (c * 1000)) * 100;
      const ok = pb <= b.limit;
      const p = { c: money('mio', c), s: money('tsd', s), pb: f(pb) };
      return {
        templateId: 'invest', title: ct('invest.title'), exhibit: null,
        brief: ct('invest.brief', {
          n: f(b.n), k: money('mio', b.k), w: f(b.w), kma: money('tsd', b.kma), wart: money('tsd', b.wart), limit: f(b.limit),
        }),
        base: { ...b },
        steps: [
          numStep({
            prompt: ct('invest.p1'), expected: c, unit: lw('Mio. €'),
            solution: lines('invest.s1', { n: f(b.n), k: money('mio', b.k), c: p.c }),
          }),
          numStep({
            prompt: ct('invest.p2'), expected: s, unit: lw('Tsd. €'),
            solution: lines('invest.s2', { w: f(b.w), kma: money('tsd', b.kma), wart: money('tsd', b.wart), s: p.s, saved: money('tsd', b.w * b.kma) }),
          }),
          numStep({
            prompt: ct('invest.p3', { c: p.c, s: p.s }), expected: pb, unit: ct('u.years'),
            solution: lines('invest.s3', { c: money('tsd', c * 1000), s: p.s, pb: p.pb }),
          }),
          numStep({
            prompt: ct('invest.p4', { c: p.c, s: p.s }), expected: roi, unit: '%',
            solution: lines('invest.s4', { s: p.s, total: money('tsd', 5 * s), c: money('tsd', c * 1000), net: money('tsd', 5 * s - c * 1000), roi: f(roi) }),
          }),
          choiceStep({
            prompt: ct('invest.q', { pb: p.pb, limit: f(b.limit) }),
            choices: [ct('invest.c.yes'), ct('invest.c.no')], correctIndex: ok ? 0 : 1,
            why: ct(ok ? 'invest.why.yes' : 'invest.why.no', { pb: p.pb, limit: f(b.limit) }),
          }),
        ],
      };
    });
  },
};
