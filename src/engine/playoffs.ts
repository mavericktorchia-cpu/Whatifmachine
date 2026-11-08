import type { PlayoffFormat } from "./types";
import type { Rng } from "./rng";

export interface PlayoffTeam {
  t: string;
  conf: string | null;
  div: string | null;
  pts: number;
  w: number;
  rating: number; // goal differential per game
}

/** Goals-per-game scale of the single-game logistic: a +1.0 GD/game edge ≈ 70% win probability. */
export const GAME_SCALE = 1.18;

export function gameWinProb(a: number, b: number): number {
  return 1 / (1 + Math.exp(-(a - b) / GAME_SCALE));
}

/** Probability of winning a best-of-n series given single-game probability p. */
export function seriesWinProb(p: number, bestOf = 7): number {
  const need = Math.ceil(bestOf / 2);
  // P(win `need` games before opponent does) = Σ_k C(need-1+k, k) p^need (1-p)^k
  let s = 0;
  let c = 1;
  for (let k = 0; k < need; k++) {
    if (k > 0) c = (c * (need - 1 + k)) / k;
    s += c * p ** need * (1 - p) ** k;
  }
  return s;
}

const byStanding = (a: PlayoffTeam, b: PlayoffTeam) => b.pts - a.pts || b.w - a.w || b.rating - a.rating || a.t.localeCompare(b.t);

function series(a: PlayoffTeam, b: PlayoffTeam, rng: Rng, bestOf = 7): PlayoffTeam {
  return rng() < seriesWinProb(gameWinProb(a.rating, b.rating), bestOf) ? a : b;
}

/** Re-seeded rounds: best remaining seed plays worst remaining seed. `teams` must be in seed order. */
function reseeded(teams: PlayoffTeam[], rng: Rng, until = 1): PlayoffTeam[] {
  let alive = teams;
  while (alive.length > until) {
    const next: PlayoffTeam[] = [];
    for (let i = 0; i < alive.length / 2; i++) next.push(series(alive[i], alive[alive.length - 1 - i], rng));
    const order = new Map(teams.map((t, i) => [t, i]));
    alive = next.sort((x, y) => order.get(x)! - order.get(y)!);
  }
  return alive;
}

function groupBy<T>(items: T[], k: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) m.set(k(it), [...(m.get(k(it)) ?? []), it]);
  return m;
}

/** Fixed bracket: pairs[0] vs pairs[1] winners meet, etc. */
function bracket(teams: PlayoffTeam[], rng: Rng): PlayoffTeam {
  let alive = teams;
  while (alive.length > 1) {
    const next: PlayoffTeam[] = [];
    for (let i = 0; i < alive.length; i += 2) next.push(series(alive[i], alive[i + 1], rng));
    alive = next;
  }
  return alive[0];
}

export interface Field {
  /** Every qualified team. */
  qualified: Set<string>;
  /** Simulate one playoff, returning the champion's abbrev. */
  run: (rng: Rng) => string;
}

export function buildField(format: PlayoffFormat, teams: PlayoffTeam[]): Field {
  const sorted = [...teams].sort(byStanding);

  if (format === "overall4") {
    // Original Six: 1st vs 3rd, 2nd vs 4th.
    const f = sorted.slice(0, 4);
    return { qualified: new Set(f.map((t) => t.t)), run: (rng) => series(series(f[0], f[2], rng), series(f[1], f[3], rng), rng).t };
  }

  if (format === "bye12") {
    // 1974-79: top three per division. Division winners get byes; the other eight play a best-of-three
    // preliminary round (5 v 12, 6 v 11, …); the final eight are re-seeded by points.
    const divs = [...groupBy(sorted, (t) => t.div ?? "?").values()].map((d) => d.slice(0, 3));
    const winners = divs.map((d) => d[0]).sort(byStanding);
    const others = divs.flatMap((d) => d.slice(1)).sort(byStanding);
    const field = [...winners, ...others];
    return {
      qualified: new Set(field.map((t) => t.t)),
      run: (rng) => {
        const prelim: PlayoffTeam[] = [];
        for (let i = 0; i < others.length / 2; i++) prelim.push(series(others[i], others[others.length - 1 - i], rng, 3));
        const order = new Map(field.map((t, i) => [t, i]));
        const eight = [...winners, ...prelim].sort((x, y) => order.get(x)! - order.get(y)!);
        return reseeded(eight, rng)[0].t;
      },
    };
  }

  if (format === "overall16") {
    const field = sorted.slice(0, 16);
    return { qualified: new Set(field.map((t) => t.t)), run: (rng) => reseeded(field, rng)[0].t };
  }

  if (format === "division4") {
    const divs = [...groupBy(sorted, (t) => t.div ?? "?").values()].map((d) => d.slice(0, 4));
    const qualified = new Set(divs.flat().map((t) => t.t));
    return {
      qualified,
      run: (rng) => {
        const champs = divs.map((d) => (d.length === 4 ? bracket([d[0], d[3], d[1], d[2]], rng) : reseeded(d, rng)[0]));
        const confs = groupBy(champs, (t) => t.conf ?? "");
        if (confs.size === 2) {
          const finals = [...confs.values()].map((c) => (c.length === 2 ? series(c[0], c[1], rng) : c[0]));
          return series(finals[0], finals[1], rng).t;
        }
        // No conferences (2020-21): division champions re-seeded by points.
        return reseeded([...champs].sort(byStanding), rng)[0].t;
      },
    };
  }

  const confs = [...groupBy(sorted, (t) => t.conf ?? "?").values()];

  if (format === "conference8") {
    const fields = confs.map((c) => {
      const divLeaders = [...groupBy(c, (t) => t.div ?? "?").values()].map((d) => d[0]).sort(byStanding);
      const rest = c.filter((t) => !divLeaders.includes(t));
      return [...divLeaders, ...rest].slice(0, 8);
    });
    return {
      qualified: new Set(fields.flat().map((t) => t.t)),
      run: (rng) => {
        const [a, b] = fields.map((f) => reseeded(f, rng)[0]);
        return series(a, b, rng).t;
      },
    };
  }

  // wildcard
  const fields = confs.map((c) => {
    const divs = [...groupBy(c, (t) => t.div ?? "?").values()].map((d) => d.slice(0, 3));
    const top = new Set(divs.flat());
    const wc = c.filter((t) => !top.has(t)).slice(0, 2);
    divs.sort((x, y) => byStanding(x[0], y[0]));
    const [d1, d2] = divs;
    // Better division winner meets the second wild card.
    return [d1[0], wc[1] ?? wc[0], d1[1], d1[2], d2[0], wc[0], d2[1], d2[2]].filter(Boolean) as PlayoffTeam[];
  });
  return {
    qualified: new Set(fields.flat().map((t) => t.t)),
    run: (rng) => {
      const [a, b] = fields.map((f) => (f.length === 8 ? bracket(f, rng) : reseeded(f.sort(byStanding), rng)[0]));
      return series(a, b, rng).t;
    },
  };
}

export function cupOdds(field: Field, sims: number, rng: Rng): Map<string, number> {
  const wins = new Map<string, number>();
  for (let i = 0; i < sims; i++) {
    const c = field.run(rng);
    wins.set(c, (wins.get(c) ?? 0) + 1);
  }
  const out = new Map<string, number>();
  for (const [t, n] of wins) out.set(t, n / sims);
  return out;
}
