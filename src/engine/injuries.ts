import { agingCurve } from "./aging";
import { abbrFor, franchiseOf, type DataIndex } from "./dataIndex";

/**
 * Healthy-career projection.
 *
 * 1. Baseline: the player's WAR per game over his last (up to) three healthy seasons before the injury
 *    window (40+ games, at least half his team's schedule). With none, his three best such seasons.
 * 2. Each season in the window: baseline rate × aging(age) / aging(baseline age), over
 *    `availability` × the team's games (healthy players still miss a few games).
 * 3. A healthy version is never worse than reality: if he actually produced more, that season stands.
 * The difference (projected − actual) is added to his team as extra WAR and games.
 */
export const DEFAULT_AVAILABILITY = 0.92;
const BASELINE_SEASONS = 3;
const MIN_BASELINE_GP = 40;

/** Extra production credited to a team-season by a healthy projection. */
export interface Extra {
  pid: number;
  season: number;
  team: string;
  gp: number;
  war: number;
}

export interface HealthyProjection {
  baselineRate: number; // WAR per game
  baselineAge: number;
  seasons: { season: number; age: number; team: string; actualGp: number; actualWar: number; gp: number; war: number }[];
  extras: Extra[];
}

export interface ProjectionInput {
  pid: number;
  from: number;
  to: number;
  availability?: number;
  /** Abbrev of the club he stays with for the whole window (else: whoever he really played for). */
  team?: string;
  /** Current team of a row in the alternate timeline (so injuries compose with trades). */
  teamOf?: (rowIndex: number) => string | null;
}

const startYear = (season: number) => Math.floor(season / 10000);

export function projectHealthy(ix: DataIndex, input: ProjectionInput): HealthyProjection | null {
  const { pid, from, to } = input;
  const avail = input.availability ?? DEFAULT_AVAILABILITY;
  const born = ix.ds.players[pid]?.b;
  const teamOf = input.teamOf ?? ((i: number) => ix.ds.rows[i][2]);
  if (!born) return null;
  const aging = agingCurve(ix);

  // Season totals (with the team he played most for) and his team's schedule length.
  const rows = ix.rowsByPlayer.get(pid) ?? [];
  const bySeason = new Map<number, { gp: number; war: number; team: string | null; teamGp: number }>();
  for (const i of rows) {
    const r = ix.ds.rows[i];
    const e = bySeason.get(r[1]) ?? { gp: 0, war: 0, team: null, teamGp: 0 };
    const t = teamOf(i);
    if (t && r[3] >= e.teamGp) {
      e.team = t;
      e.teamGp = r[3];
    }
    e.gp += r[3];
    e.war += r[4] / 100;
    bySeason.set(r[1], e);
  }
  const schedule = (season: number) => Math.max(...(ix.standings.get(season) ?? []).map((t) => t.gp), 1);
  const healthy = [...bySeason.entries()].filter(([s, e]) => e.gp >= MIN_BASELINE_GP && e.gp >= 0.5 * schedule(s));
  let base = healthy.filter(([s]) => s < from).slice(-BASELINE_SEASONS);
  if (!base.length) base = [...healthy].sort((a, b) => b[1].war / b[1].gp - a[1].war / a[1].gp).slice(0, BASELINE_SEASONS);
  if (!base.length) return null;
  const gp = base.reduce((s, [, e]) => s + e.gp, 0);
  const baselineRate = base.reduce((s, [, e]) => s + e.war, 0) / gp;
  const baselineAge = base.reduce((s, [sid, e]) => s + (startYear(sid) - born) * e.gp, 0) / gp;

  const fixedFr = input.team ? franchiseOf(ix, input.team) : null;
  let lastTeam: string | null = null;
  for (const [s, e] of [...bySeason.entries()].sort((a, b) => a[0] - b[0])) if (s < from && e.team) lastTeam = e.team;

  const out: HealthyProjection = { baselineRate, baselineAge, seasons: [], extras: [] };
  for (const s of ix.seasonIds) {
    if (s < from || s > to) continue;
    const age = startYear(s) - born;
    const actual = bySeason.get(s);
    let team: string | null = null;
    if (fixedFr !== null) team = abbrFor(ix, fixedFr, s);
    else if (actual?.team) team = actual.team;
    else if (lastTeam) team = abbrFor(ix, franchiseOf(ix, lastTeam), s);
    if (actual?.team) lastTeam = actual.team;
    if (!team) continue;
    const teamGp = ix.standings.get(s)?.find((t) => t.t === team)?.gp ?? schedule(s);
    const projGp = Math.round(avail * teamGp);
    const projWar = (baselineRate * aging.factor(age)) / aging.factor(baselineAge) * projGp;
    const actualGp = actual?.gp ?? 0;
    const actualWar = actual?.war ?? 0;
    const war = Math.max(projWar, actualWar);
    const gpOut = Math.max(projGp, actualGp);
    out.seasons.push({ season: s, age, team, actualGp, actualWar, gp: gpOut, war });
    if (war - actualWar > 0.005) out.extras.push({ pid, season: s, team, gp: gpOut - actualGp, war: war - actualWar });
  }
  return out;
}
