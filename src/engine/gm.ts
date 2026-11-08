/**
 * GM activity meter: how predictably a general manager behaved, 1 (wild card) to 99 (by the book),
 * scored from his actual record. League average is 50.
 *
 *  - Deadline discipline: did his in-season trading match his team's situation (sell when out of it,
 *    buy when contending)? The cosine between what the league-wide curve expects at his standings
 *    and what he actually did, season by season.
 *  - Draft return: WAR his first- and second-round picks gave the club over ten seasons, against
 *    what those slots returned across that same draft year. Reaches that bust drag this down.
 *
 * Both are shrunk toward average for short tenures, standardised across all GMs, and combined.
 *
 * In a scenario the meter scales his responses: deadline moves × (meter − 25) / 25, so a 50 behaves
 * like the league curve, 75+ reacts twice as hard, and below 25 he does the opposite of what the
 * standings call for. Draft-slot value × meter / 50 (bounded 0.4–1.6): the same pick is worth more
 * to a GM who drafts well.
 */
import type { DataIndex } from "./dataIndex";
import { deadlineModel, deadlineNet, draftValueModel, inSeasonNet, percentiles, DRAFT_WINDOW } from "./responses";

export interface GmScore {
  name: string;
  meter: number;
  /** Cosine of expected vs actual deadline moves (−1…1), before shrinkage. Null = no seasons. */
  deadline: number | null;
  deadlineSeasons: number;
  /** Actual ÷ expected WAR from his picks. Null = no complete drafts. */
  draftRatio: number | null;
  picks: number;
  tenures: { franchise: number; from: string; to: string | null }[];
}

export interface GmModel {
  scores: Map<string, GmScore>;
  /** GM in charge of a franchise on a date (YYYY-MM-DD). */
  at: (franchise: number, date: string) => string | null;
}

const DEADLINE_SHRINK = 10;
const DRAFT_SHRINK = 8;
const DEADLINE_WEIGHT = 14;
const DRAFT_WEIGHT = 18;

export const deadlineDate = (season: number) => `${Math.floor(season / 10000) + 1}-02-20`;
export const draftDate = (year: number) => `${year}-06-25`;

export function meterLabel(m: number): string {
  if (m >= 80) return "By the book";
  if (m >= 60) return "Steady";
  if (m >= 40) return "Typical";
  if (m >= 20) return "Unpredictable";
  return "Wild card";
}

/** Multiplier on a GM's deadline response. */
export const deadlineMultiplier = (meter: number) => Math.max(-1, Math.min(2, (meter - 25) / 25));
/** Multiplier on the value a GM gets out of a draft slot. */
export const draftMultiplier = (meter: number) => Math.max(0.4, Math.min(1.6, meter / 50));

const memo = new WeakMap<DataIndex, GmModel>();

export function gmModel(ix: DataIndex): GmModel {
  const cached = memo.get(ix);
  if (cached) return cached;

  const byFranchise = new Map<number, { name: string; from: string; to: string | null }[]>();
  for (const g of ix.ds.gms) byFranchise.set(g.franchise, [...(byFranchise.get(g.franchise) ?? []), g]);
  const at = (franchise: number, date: string) => {
    // Latest start wins when tenures overlap (interim titles, the day of a handover).
    let best: { name: string; from: string } | null = null;
    for (const g of byFranchise.get(franchise) ?? []) {
      if (g.from <= date && (g.to === null || date <= g.to) && (!best || g.from > best.from)) best = g;
    }
    return best?.name ?? null;
  };

  const dl = deadlineModel(ix);
  const net = inSeasonNet(ix);
  const mean = dl.curve.reduce((a, [, y]) => a + y, 0) / dl.curve.length;
  const acc = new Map<string, { se: number; sa: number; sea: number; n: number; actual: number; expected: number; picks: number }>();
  const get = (name: string) => {
    let e = acc.get(name);
    if (!e) acc.set(name, (e = { se: 0, sa: 0, sea: 0, n: 0, actual: 0, expected: 0, picks: 0 }));
    return e;
  };

  for (const s of ix.ds.seasons) {
    const st = ix.standings.get(s.id) ?? [];
    const pct = percentiles(st);
    for (const t of st) {
      const name = at(ix.ds.teams[t.t].franchise, deadlineDate(s.id));
      if (!name) continue;
      const e = get(name);
      const exp = deadlineNet(dl, pct.get(t.t)!) - mean;
      const act = (net.get(`${t.t}|${s.id}`) ?? 0) - mean;
      e.se += exp * exp;
      e.sa += act * act;
      e.sea += exp * act;
      e.n++;
    }
  }

  // Draft return, judged against the same draft year: early drafts (small, pre-1969 sponsorship
  // leftovers) returned far less for everyone, so each pick's expectation is the slot value scaled by
  // how that whole draft year performed.
  const dv = draftValueModel(ix);
  const lastYear = Math.floor(ix.seasonIds.at(-1)! / 10000) - DRAFT_WINDOW;
  const picks: { name: string; year: number; got: number; slot: number }[] = [];
  const yearGot = new Map<number, number>();
  const yearSlot = new Map<number, number>();
  for (const d of ix.ds.draft) {
    const [year, round, overall, team, pid] = d;
    if (round > 2 || year > lastYear || !(overall in dv.value)) continue;
    const fr = ix.ds.teams[team]?.franchise;
    if (fr === undefined) continue;
    let w = 0;
    for (const i of pid ? (ix.rowsByPlayer.get(pid) ?? []) : []) {
      const r = ix.ds.rows[i];
      const off = Math.floor(r[1] / 10000) - year;
      if (off >= 0 && off < DRAFT_WINDOW && ix.ds.teams[r[2]]?.franchise === fr) w += r[4] / 100;
    }
    yearGot.set(year, (yearGot.get(year) ?? 0) + Math.max(0, w));
    yearSlot.set(year, (yearSlot.get(year) ?? 0) + dv.value[overall]);
    const name = at(fr, draftDate(year));
    if (name) picks.push({ name, year, got: w, slot: dv.value[overall] });
  }
  for (const p of picks) {
    const e = get(p.name);
    e.actual += p.got;
    e.expected += (p.slot * (yearGot.get(p.year) ?? 0)) / (yearSlot.get(p.year) || 1);
    e.picks++;
  }

  // Shrunk raw components, then z-scores across GMs.
  const raw = [...acc.entries()].map(([name, e]) => {
    const cos = e.se > 0 && e.sa > 0 ? e.sea / Math.sqrt(e.se * e.sa) : null;
    const ratio = e.expected > 0 ? Math.max(0, e.actual) / e.expected : null;
    return {
      name,
      e,
      cos,
      ratio,
      a: cos === null ? 0 : cos * (e.n / (e.n + DEADLINE_SHRINK)),
      b: ratio === null ? 0 : Math.log(Math.max(0.1, ratio)) * (e.picks / (e.picks + DRAFT_SHRINK)),
    };
  });
  const z = (xs: number[]) => {
    const m = xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
    const sd = Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, xs.length)) || 1;
    return (x: number) => (x - m) / sd;
  };
  const za = z(raw.filter((r) => r.cos !== null).map((r) => r.a));
  const zb = z(raw.filter((r) => r.ratio !== null).map((r) => r.b));

  const scores = new Map<string, GmScore>();
  for (const r of raw) {
    const meter = 50 + (r.cos !== null ? DEADLINE_WEIGHT * za(r.a) : 0) + (r.ratio !== null ? DRAFT_WEIGHT * zb(r.b) : 0);
    scores.set(r.name, {
      name: r.name,
      meter: Math.round(Math.max(1, Math.min(99, meter))),
      deadline: r.cos,
      deadlineSeasons: r.e.n,
      draftRatio: r.ratio,
      picks: r.e.picks,
      tenures: ix.ds.gms.filter((g) => g.name === r.name).map((g) => ({ franchise: g.franchise, from: g.from, to: g.to })),
    });
  }
  const model = { scores, at };
  memo.set(ix, model);
  return model;
}

/** GM of a team abbrev's franchise at a season's trade deadline. */
export function gmForSeason(ix: DataIndex, team: string, season: number): string | null {
  const fr = ix.ds.teams[team]?.franchise;
  return fr === undefined ? null : gmModel(ix).at(fr, deadlineDate(season));
}

