import { abbrFor, franchiseOf, type DataIndex } from "./dataIndex";
import { buildField, cupOdds, type PlayoffTeam } from "./playoffs";
import { hashSeed, mulberry32 } from "./rng";
import type { CapModel } from "./cap";
import type { Overrides } from "./scenario";
import { ALL_RESPONSES, DRAFT_WINDOW, deadlineModel, deadlineNet, depthCorrection, draftValueModel, percentiles, redraftFirstRound, type DeadlineModel, type DraftValueModel, type ResponseOptions } from "./responses";

/** Standings points per win above replacement (a win is worth two points). */
export const POINTS_PER_WAR = 2;

export interface WarComponents {
  /** The user's own changes. */
  direct: number;
  /** Expected value gained or lost because the team picked in a different first-round slot. */
  draft: number;
  /** Depth players losing (or regaining) games to arrivals (or departures). */
  depth: number;
  /** Expected extra buying or selling at the trade deadline after the standing moved. */
  deadline: number;
}

export interface TeamSeasonResult {
  season: number;
  team: string;
  franchise: number;
  gp: number;
  actualPts: number;
  altPts: number;
  deltaWar: number;
  components: WarComponents;
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

export interface ResponseNote {
  season: number;
  team: string;
  war: number;
  text: string;
}

export interface Timeline {
  seasons: SeasonResult[];
  byFranchise: Map<number, TeamSeasonResult[]>;
  overrides: Overrides;
  notes: ResponseNote[];
  deadline: DeadlineModel;
  draftValue: DraftValueModel;
}

export interface TimelineOptions {
  sims?: number;
  seed?: number;
  responses?: ResponseOptions;
}

/** Deadline adjustments smaller than this are dropped, so rivals don't pick up rounding noise. */
export const MIN_DEADLINE_WAR = 0.05;

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

export function computeTimeline(ix: DataIndex, userOverrides: Overrides, cap: CapModel, opts: TimelineOptions = {}): Timeline {
  const sims = opts.sims ?? 4000;
  const seed = opts.seed ?? 1;
  const resp = opts.responses ?? ALL_RESPONSES;
  const dl = deadlineModel(ix);

  const ov = userOverrides;
  const dv = draftValueModel(ix);
  /** `${franchise}|${season}` → expected WAR from a changed draft slot. */
  const draftAdj = new Map<string, number>();
  const notes: ResponseNote[] = [];

  const seasonGp = new Map<string, number>();
  for (const r of ix.ds.rows) {
    const k = `${r[0]}|${r[1]}`;
    seasonGp.set(k, (seasonGp.get(k) ?? 0) + r[3]);
  }

  const seasons: SeasonResult[] = [];
  const byFranchise = new Map<number, TeamSeasonResult[]>();
  for (const s of ix.ds.seasons) {
    const st = ix.standings.get(s.id) ?? [];

    // Moves touching this season, per team.
    const arrived = new Map<string, number[]>();
    const departed = new Map<string, number[]>();
    for (const [i, to] of ov) {
      const r = ix.ds.rows[i];
      if (r[1] !== s.id || r[2] === to) continue;
      departed.set(r[2], [...(departed.get(r[2]) ?? []), i]);
      if (to) arrived.set(to, [...(arrived.get(to) ?? []), i]);
    }

    const comp = new Map<string, WarComponents>();
    const capD = new Map<string, number>();
    for (const t of st) {
      const c: WarComponents = { direct: 0, draft: draftAdj.get(`${franchiseOf(ix, t.t)}|${s.id}`) ?? 0, depth: 0, deadline: 0 };
      const inn = arrived.get(t.t) ?? [];
      const out = departed.get(t.t) ?? [];
      let cd = 0;
      for (const [list, sign] of [[inn, 1], [out, -1]] as const) {
        for (const i of list) {
          const r = ix.ds.rows[i];
          c.direct += (sign * r[4]) / 100;
          const hit = cap.capHit(r[0], r[1]);
          if (hit) cd += sign * hit.aav * (r[3] / Math.max(1, seasonGp.get(`${r[0]}|${r[1]}`) ?? 1));
        }
      }
      if (resp.depth && (inn.length || out.length)) c.depth = depthCorrection(ix, t.t, s.id, inn, out);
      comp.set(t.t, c);
      capD.set(t.t, cd);
    }

    const preDeadline = (t: (typeof st)[number]) => {
      const c = comp.get(t.t)!;
      return t.pts + POINTS_PER_WAR * (c.direct + c.draft + c.depth);
    };
    let changed = [...comp.values()].some((c) => c.direct || c.draft || c.depth);
    if (changed && resp.deadline) {
      const pA = percentiles(st);
      const pB = percentiles(st.map((t) => ({ t: t.t, gp: t.gp, pts: preDeadline(t) })));
      for (const t of st) {
        const d = deadlineNet(dl, pB.get(t.t)!) - deadlineNet(dl, pA.get(t.t)!);
        if (Math.abs(d) >= MIN_DEADLINE_WAR) comp.get(t.t)!.deadline = d;
      }
    }
    const total = (abbr: string) => {
      const c = comp.get(abbr)!;
      return c.direct + c.draft + c.depth + c.deadline;
    };
    changed = st.some((t) => total(t.t) !== 0);

    const base: PlayoffTeam[] = st.map((t) => ({ t: t.t, conf: t.conf, div: t.div, pts: t.pts, w: t.w, rating: (t.gf - t.ga) / Math.max(1, t.gp) }));
    const alt: PlayoffTeam[] = st.map((t) => {
      const d = total(t.t);
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
      const inn = arrived.get(t.t) ?? [];
      const res: TeamSeasonResult = {
        season: s.id,
        team: t.t,
        franchise: franchiseOf(ix, t.t),
        gp: t.gp,
        actualPts: t.pts,
        altPts: alt[j].pts,
        deltaWar: total(t.t),
        components: comp.get(t.t)!,
        actualRating: base[j].rating,
        altRating: alt[j].rating,
        actualRank: r0.get(t.t)!,
        altRank: r1.get(t.t)!,
        madePlayoffs: baseField.qualified.has(t.t),
        altMadePlayoffs: altField.qualified.has(t.t),
        baseCupOdds: baseOdds.get(t.t) ?? 0,
        altCupOdds: altOdds.get(t.t) ?? 0,
        wonCup: s.champion === t.t,
        capDelta: s.capCeiling ? (capD.get(t.t) ?? 0) : null,
        arrivals: [...new Set(inn.map((i) => ix.ds.rows[i][0]))],
        departures: [...new Set((departed.get(t.t) ?? []).map((i) => ix.ds.rows[i][0]))],
      };
      byFranchise.set(res.franchise, [...(byFranchise.get(res.franchise) ?? []), res]);
      return res;
    });
    seasons.push({ season: s.id, changed, teams, actualChampion: s.champion, altChampion });

    // The draft that follows this season, re-ordered from the alternate standings.
    if (changed && resp.draftOrder) {
      const key = (pts: (t: (typeof st)[number], j: number) => number, field: typeof baseField) =>
        new Map(st.map((t, j) => [t.t, { playoffs: field.qualified.has(t.t), pts: pts(t, j) }]));
      // First-order only: the re-ordered draft follows standings moved by the user's changes (and their depth
      // effects), not by earlier draft-slot or deadline adjustments, so the effect can't snowball.
      const firstOrder = (t: (typeof st)[number]) => {
        const c = comp.get(t.t)!;
        return t.pts + POINTS_PER_WAR * (c.direct + c.depth);
      };
      const altFirst = buildField(s.format, st.map((t, j) => ({ ...alt[j], pts: firstOrder(t) })));
      const shifts = redraftFirstRound(ix, s.id, key((t) => t.pts, baseField), key((t) => firstOrder(t), altFirst));
      for (const sh of shifts) {
        const fr = franchiseOf(ix, sh.holder);
        const dW = (dv.value[sh.to] ?? 0) - (dv.value[sh.from] ?? 0);
        dv.timing.forEach((share, off) => {
          const season = (sh.year + off) * 10000 + sh.year + off + 1;
          if (!ix.season.has(season)) return;
          const k = `${fr}|${season}`;
          draftAdj.set(k, (draftAdj.get(k) ?? 0) + dW * share);
        });
        if (Math.abs(dW) >= 0.2) {
          notes.push({ season: s.id, team: sh.holder, war: dW, text: `${sh.year} draft: ${sh.holder} picks #${sh.to} instead of #${sh.from} (${dW > 0 ? "+" : "−"}${Math.abs(dW).toFixed(1)} expected WAR over ${DRAFT_WINDOW} seasons)` });
        }
      }
    }
  }
  return { seasons, byFranchise, overrides: ov, notes, deadline: dl, draftValue: dv };
}

export interface FranchiseSummary {
  franchise: number;
  team: string; // most recent abbrev
  name: string;
  seasonsAffected: number;
  deltaWar: number;
  components: WarComponents;
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
      seasonsAffected: rows.filter((r) => r.components.direct !== 0).length,
      deltaWar: rows.reduce((s, r) => s + r.deltaWar, 0),
      components: (["direct", "draft", "depth", "deadline"] as const).reduce(
        (acc, k) => ({ ...acc, [k]: rows.reduce((s, r) => s + r.components[k], 0) }),
        { direct: 0, draft: 0, depth: 0, deadline: 0 } as WarComponents,
      ),
      deltaPts: rows.reduce((s, r) => s + (r.altPts - r.actualPts), 0),
      deltaPlayoffs: rows.reduce((s, r) => s + Number(r.altMadePlayoffs) - Number(r.madePlayoffs), 0),
      deltaExpectedCups: rows.reduce((s, r) => s + r.altCupOdds - r.baseCupOdds, 0),
      actualCups: rows.filter((r) => r.wonCup).length,
      altCups: rows.filter((r) => champs.get(r.season)?.altChampion === r.team).length,
    });
  }
  // Teams whose rosters the user changed first, then teams moved by league responses, then rivals whose
  // odds moved. Teams touched only by a negligible response are dropped.
  const tier = (f: FranchiseSummary) => (f.seasonsAffected > 0 ? 2 : Math.abs(f.deltaWar) >= 0.5 ? 1 : 0);
  const direct = tier;
  return out
    .filter((f) => tier(f) > 0 || f.deltaPlayoffs !== 0 || Math.abs(f.deltaExpectedCups) >= 0.02 || f.actualCups !== f.altCups)
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
