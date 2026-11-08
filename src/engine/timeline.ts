import { abbrFor, franchiseOf, type DataIndex } from "./dataIndex";
import { buildField, cupOdds, type PlayoffTeam } from "./playoffs";
import { hashSeed, mulberry32 } from "./rng";
import type { CapModel } from "./cap";
import type { Overrides } from "./scenario";

/** Standings points per win above replacement (a win is worth two points). */
export const POINTS_PER_WAR = 2;

export interface TeamSeasonResult {
  season: number;
  team: string;
  franchise: number;
  gp: number;
  actualPts: number;
  altPts: number;
  deltaWar: number;
  actualRating: number;
  altRating: number;
  actualRank: number; // league rank by points (1 = best)
  altRank: number;
  madePlayoffs: boolean;
  altMadePlayoffs: boolean;
  baseCupOdds: number;
  altCupOdds: number;
  wonCup: boolean;
  capDelta: number | null; // millions; positive = more committed cap in the alternate timeline
  arrivals: number[]; // player ids
  departures: number[];
}

export interface SeasonResult {
  season: number;
  changed: boolean;
  teams: TeamSeasonResult[];
  actualChampion: string | null;
  /** Champion in one coupled draw of the alternate timeline (see coupleChampion). */
  altChampion: string | null;
}

export interface Timeline {
  seasons: SeasonResult[];
  byFranchise: Map<number, TeamSeasonResult[]>;
}

export interface TimelineOptions {
  sims?: number;
  seed?: number;
}

function rank(teams: { t: string; pts: number; w: number }[]): Map<string, number> {
  const s = [...teams].sort((a, b) => b.pts - a.pts || b.w - a.w);
  return new Map(s.map((t, i) => [t.t, i + 1]));
}

/**
 * Couple the alternate champion to real history: keep the real champion with probability
 * min(1, altOdds/baseOdds); otherwise draw from the teams whose odds increased, in proportion to the
 * increase. History only changes as much as the changed odds demand.
 */
export function coupleChampion(actual: string | null, base: Map<string, number>, alt: Map<string, number>, u: number, v: number): string | null {
  if (!actual) return null;
  const p = base.get(actual) ?? 0;
  const q = alt.get(actual) ?? 0;
  const keep = p > 0 ? Math.min(1, q / p) : q > 0 ? 1 : 0;
  if (u < keep) return actual;
  const gains = [...alt.entries()].map(([t, a]) => [t, Math.max(0, a - (base.get(t) ?? 0))] as const).filter(([, g]) => g > 0);
  const total = gains.reduce((s, [, g]) => s + g, 0);
  if (!total) {
    const best = [...alt.entries()].sort((a, b) => b[1] - a[1])[0];
    return best ? best[0] : actual;
  }
  let x = v * total;
  for (const [t, g] of gains) {
    x -= g;
    if (x <= 0) return t;
  }
  return gains.at(-1)![0];
}

/** Real-history Cup odds don't depend on the scenario, so compute them once per dataset. */
const baseCache = new WeakMap<DataIndex, Map<string, Map<string, number>>>();

export function computeTimeline(ix: DataIndex, overrides: Overrides, cap: CapModel, opts: TimelineOptions = {}): Timeline {
  const sims = opts.sims ?? 4000;
  const seed = opts.seed ?? 1;

  // Per-season deltas.
  const dWar = new Map<string, number>();
  const arrivals = new Map<string, Set<number>>();
  const departures = new Map<string, Set<number>>();
  const capD = new Map<string, number>();
  const seasonGp = new Map<string, number>();
  for (const r of ix.ds.rows) {
    const k = `${r[0]}|${r[1]}`;
    seasonGp.set(k, (seasonGp.get(k) ?? 0) + r[3]);
  }
  const add = <T>(m: Map<string, T>, k: string, f: (v: T | undefined) => T) => m.set(k, f(m.get(k)));
  for (const [i, to] of overrides) {
    const r = ix.ds.rows[i];
    const from = r[2];
    if (from === to) continue;
    const w = r[4] / 100;
    const share = r[3] / Math.max(1, seasonGp.get(`${r[0]}|${r[1]}`) ?? 1);
    const hit = cap.capHit(r[0], r[1]);
    const fk = `${from}|${r[1]}`;
    add(dWar, fk, (v) => (v ?? 0) - w);
    add(departures, fk, (v) => (v ?? new Set()).add(r[0]));
    if (hit) add(capD, fk, (v) => (v ?? 0) - hit.aav * share);
    if (to) {
      const tk = `${to}|${r[1]}`;
      add(dWar, tk, (v) => (v ?? 0) + w);
      add(arrivals, tk, (v) => (v ?? new Set()).add(r[0]));
      if (hit) add(capD, tk, (v) => (v ?? 0) + hit.aav * share);
    }
  }
  const changedSeasons = new Set([...dWar.keys()].map((k) => Number(k.split("|")[1])));

  const seasons: SeasonResult[] = [];
  const byFranchise = new Map<number, TeamSeasonResult[]>();
  for (const s of ix.ds.seasons) {
    const st = ix.standings.get(s.id) ?? [];
    const changed = changedSeasons.has(s.id);
    const base: PlayoffTeam[] = st.map((t) => ({ t: t.t, conf: t.conf, div: t.div, pts: t.pts, w: t.w, rating: (t.gf - t.ga) / Math.max(1, t.gp) }));
    const alt: PlayoffTeam[] = st.map((t) => {
      const d = dWar.get(`${t.t}|${s.id}`) ?? 0;
      return {
        t: t.t,
        conf: t.conf,
        div: t.div,
        pts: Math.max(0, Math.min(2 * t.gp, t.pts + POINTS_PER_WAR * d)),
        w: t.w + d,
        rating: (t.gf - t.ga + d * s.goalsPerWin) / Math.max(1, t.gp),
      };
    });
    const baseField = buildField(s.format, base);
    const altField = changed ? buildField(s.format, alt) : baseField;
    const ck = `${sims}|${seed}|${s.id}`;
    let baseOdds = baseCache.get(ix)?.get(ck);
    if (!baseOdds) {
      baseOdds = cupOdds(baseField, sims, mulberry32(hashSeed(seed, s.id, "base")));
      if (!baseCache.has(ix)) baseCache.set(ix, new Map());
      baseCache.get(ix)!.set(ck, baseOdds);
    }
    // Common random numbers: the alternate run replays the base run's draws, so odds only move where
    // rosters actually changed, not because of Monte Carlo noise.
    const altOdds = changed ? cupOdds(altField, sims, mulberry32(hashSeed(seed, s.id, "base"))) : baseOdds;
    const r0 = rank(base);
    const r1 = rank(alt);
    const pick = mulberry32(hashSeed(seed, s.id, "couple"));
    const altChampion = changed ? coupleChampion(s.champion, baseOdds, altOdds, pick(), pick()) : s.champion;

    const teams: TeamSeasonResult[] = st.map((t, j) => {
      const k = `${t.t}|${s.id}`;
      const res: TeamSeasonResult = {
        season: s.id,
        team: t.t,
        franchise: franchiseOf(ix, t.t),
        gp: t.gp,
        actualPts: t.pts,
        altPts: alt[j].pts,
        deltaWar: dWar.get(k) ?? 0,
        actualRating: base[j].rating,
        altRating: alt[j].rating,
        actualRank: r0.get(t.t)!,
        altRank: r1.get(t.t)!,
        madePlayoffs: baseField.qualified.has(t.t),
        altMadePlayoffs: altField.qualified.has(t.t),
        baseCupOdds: baseOdds.get(t.t) ?? 0,
        altCupOdds: altOdds.get(t.t) ?? 0,
        wonCup: s.champion === t.t,
        capDelta: s.capCeiling ? (capD.get(k) ?? 0) : null,
        arrivals: [...(arrivals.get(k) ?? [])],
        departures: [...(departures.get(k) ?? [])],
      };
      byFranchise.set(res.franchise, [...(byFranchise.get(res.franchise) ?? []), res]);
      return res;
    });
    seasons.push({ season: s.id, changed, teams, actualChampion: s.champion, altChampion });
  }
  return { seasons, byFranchise };
}

export interface FranchiseSummary {
  franchise: number;
  team: string; // most recent abbrev
  name: string;
  seasonsAffected: number;
  deltaWar: number;
  deltaPts: number;
  deltaPlayoffs: number;
  deltaExpectedCups: number;
  actualCups: number;
  altCups: number; // in the coupled draw
}

export function summarize(ix: DataIndex, tl: Timeline): FranchiseSummary[] {
  const out: FranchiseSummary[] = [];
  const champs = new Map(tl.seasons.map((s) => [s.season, s]));
  for (const [fr, rows] of tl.byFranchise) {
    const affected = rows.filter((r) => r.deltaWar !== 0 || r.madePlayoffs !== r.altMadePlayoffs || Math.abs(r.altCupOdds - r.baseCupOdds) > 0.004);
    if (!affected.length) continue;
    const last = rows.at(-1)!;
    out.push({
      franchise: fr,
      team: last.team,
      name: ix.ds.teams[last.team]?.name ?? last.team,
      seasonsAffected: rows.filter((r) => r.deltaWar !== 0).length,
      deltaWar: rows.reduce((s, r) => s + r.deltaWar, 0),
      deltaPts: rows.reduce((s, r) => s + (r.altPts - r.actualPts), 0),
      deltaPlayoffs: rows.reduce((s, r) => s + Number(r.altMadePlayoffs) - Number(r.madePlayoffs), 0),
      deltaExpectedCups: rows.reduce((s, r) => s + r.altCupOdds - r.baseCupOdds, 0),
      actualCups: rows.filter((r) => r.wonCup).length,
      altCups: rows.filter((r) => champs.get(r.season)?.altChampion === r.team).length,
    });
  }
  // Teams whose rosters changed first, then collateral effects (rivals whose odds moved).
  const direct = (f: FranchiseSummary) => (f.seasonsAffected > 0 ? 1 : 0);
  return out
    .filter((f) => f.seasonsAffected > 0 || f.deltaPlayoffs !== 0 || Math.abs(f.deltaExpectedCups) >= 0.02 || f.actualCups !== f.altCups)
    .sort((a, b) => direct(b) - direct(a) || Math.abs(b.deltaExpectedCups) - Math.abs(a.deltaExpectedCups) || Math.abs(b.deltaWar) - Math.abs(a.deltaWar));
}

/** Alternate roster for a team-season: [rowIndex, status]. */
export function roster(ix: DataIndex, overrides: Overrides, team: string, season: number): { i: number; status: "stayed" | "arrived" | "departed" }[] {
  const out: { i: number; status: "stayed" | "arrived" | "departed" }[] = [];
  for (const i of ix.rowsByTeamSeason.get(`${team}|${season}`) ?? []) {
    out.push({ i, status: overrides.has(i) && overrides.get(i) !== team ? "departed" : "stayed" });
  }
  for (const [i, to] of overrides) if (to === team && ix.ds.rows[i][1] === season) out.push({ i, status: "arrived" });
  return out;
}

export { abbrFor };
