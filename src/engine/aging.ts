import type { DataIndex } from "./dataIndex";

/**
 * Aging curve measured with the delta method: for every player with 40+ games in two consecutive
 * seasons, compare his WAR per game at age a and a+1. The ratio of the summed rates (weighted by the
 * smaller of the two game counts) gives the typical change for one year of aging. Chained together
 * and normalised so the peak is 1, it gives `factor(age)`.
 *
 * Survivorship bias (players who decline sharply retire) makes the late-career decline a little
 * optimistic; that's the standard caveat of this method.
 */
export interface AgingCurve {
  factor: (age: number) => number;
  /** age → factor, for display. */
  table: [number, number][];
  peakAge: number;
}

export const MIN_AGE = 18;
export const MAX_AGE = 42;
const MIN_GP = 40;
const MIN_PAIRS = 30;

const memo = new WeakMap<DataIndex, AgingCurve>();

export function agingCurve(ix: DataIndex): AgingCurve {
  const cached = memo.get(ix);
  if (cached) return cached;
  // Season totals per player (summing mid-season splits).
  const seasons = new Map<number, Map<number, { gp: number; war: number }>>();
  for (const r of ix.ds.rows) {
    let m = seasons.get(r[0]);
    if (!m) seasons.set(r[0], (m = new Map()));
    const e = m.get(r[1]) ?? { gp: 0, war: 0 };
    e.gp += r[3];
    e.war += r[4] / 100;
    m.set(r[1], e);
  }
  const num = new Map<number, number>();
  const den = new Map<number, number>();
  const pairs = new Map<number, number>();
  for (const [pid, m] of seasons) {
    const born = ix.ds.players[pid]?.b;
    if (!born || ix.ds.players[pid].pos === "G") continue; // goalie aging is too noisy to pool with skaters
    for (const [sid, a] of m) {
      const next = m.get(sid + 10001);
      if (!next || a.gp < MIN_GP || next.gp < MIN_GP) continue;
      const age = Math.floor(sid / 10000) - born;
      const w = Math.min(a.gp, next.gp);
      num.set(age, (num.get(age) ?? 0) + (next.war / next.gp) * w);
      den.set(age, (den.get(age) ?? 0) + (a.war / a.gp) * w);
      pairs.set(age, (pairs.get(age) ?? 0) + 1);
    }
  }
  const step = (age: number) => {
    const n = num.get(age);
    const d = den.get(age);
    if (n === undefined || !d || d <= 0 || (pairs.get(age) ?? 0) < MIN_PAIRS) return age < 27 ? 1.05 : 0.9;
    return Math.max(0.7, Math.min(1.3, n / d));
  };
  const raw = new Map<number, number>([[MIN_AGE, 1]]);
  for (let a = MIN_AGE; a < MAX_AGE; a++) raw.set(a + 1, raw.get(a)! * step(a));
  const peak = Math.max(...raw.values());
  const peakAge = [...raw.entries()].find(([, v]) => v === peak)![0];
  const table = [...raw.entries()].map(([a, v]) => [a, v / peak] as [number, number]);
  const lookup = new Map(table);
  const factor = (age: number) => lookup.get(Math.max(MIN_AGE, Math.min(MAX_AGE, Math.round(age))))!;
  const curve = { factor, table, peakAge };
  memo.set(ix, curve);
  return curve;
}
