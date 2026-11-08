/**
 * Stat-based WAR ("sWAR") — an approximation built only from box-score data the NHL publishes back to 1979.
 *
 * It is deliberately simple and transparent, in the spirit of Hockey-Reference's point shares rather than
 * tracking-data models (Evolving-Hockey, etc.), which do not exist for most of league history.
 *
 * Skaters:  GAR = offense + defense
 *   offense = goalsCreated − replacementGoalsCreated
 *     goalsCreated = k · (G + ½A), k scales league totals so Σ goalsCreated = league goals
 *     replacement  = REPL_SHARE × league-average goals created per game for the position group (F / D)
 *   defense = share of the team's shot suppression vs replacement, plus relative plus-minus
 * Goalies:  GAR = GOALIE_SHRINK · shotsAgainst · (sv% − (league sv% − GOALIE_REPL_GAP))
 * WAR = GAR / goalsPerWin, with goalsPerWin = 2 × league goals per team-game (Pythagorean derivative).
 */

export const REPL_SHARE = 0.5;
export const GOALIE_REPL_GAP = 0.006;
export const GOALIE_SHRINK = 0.75;
export const REPL_SHOTS_FACTOR = 1.05;
export const REL_PM_WEIGHT = 0.08;

export interface SkaterLine {
  pid: number;
  team: string;
  pos: string; // C L R D
  gp: number;
  g: number;
  a: number;
  pm: number;
  toi: number | null; // seconds per game
}

export interface GoalieLine {
  pid: number;
  team: string;
  gp: number;
  sa: number;
  ga: number;
  toi: number; // total seconds
}

export interface TeamLine {
  t: string;
  gp: number;
  gf: number;
  ga: number;
}

export interface WarResult {
  pid: number;
  team: string;
  gp: number;
  gar: number;
  war: number;
}

export function goalsPerWin(teams: TeamLine[]): { teamGoalsPerGame: number; goalsPerWin: number } {
  const gf = teams.reduce((s, t) => s + t.gf, 0);
  const gp = teams.reduce((s, t) => s + t.gp, 0);
  const teamGoalsPerGame = gp ? gf / gp : 3;
  return { teamGoalsPerGame, goalsPerWin: 2 * teamGoalsPerGame };
}

const isD = (pos: string) => pos === "D";

export function computeSeasonWar(teams: TeamLine[], skaters: SkaterLine[], goalies: GoalieLine[]): WarResult[] {
  const { goalsPerWin: gpw } = goalsPerWin(teams);
  const lgGF = teams.reduce((s, t) => s + t.gf, 0);
  const lgGP = teams.reduce((s, t) => s + t.gp, 0);

  // Offense
  const raw = skaters.reduce((s, p) => s + p.g + 0.5 * p.a, 0);
  const k = raw > 0 ? lgGF / raw : 0;
  const group = { F: { gc: 0, gp: 0 }, D: { gc: 0, gp: 0 } };
  for (const p of skaters) {
    const g = isD(p.pos) ? group.D : group.F;
    g.gc += k * (p.g + 0.5 * p.a);
    g.gp += p.gp;
  }
  const replRate = {
    F: group.F.gp ? (REPL_SHARE * group.F.gc) / group.F.gp : 0,
    D: group.D.gp ? (REPL_SHARE * group.D.gc) / group.D.gp : 0,
  };

  // Team shot suppression, from goalie lines
  const teamSA = new Map<string, number>();
  let lgSA = 0;
  let lgSaves = 0;
  for (const g of goalies) {
    teamSA.set(g.team, (teamSA.get(g.team) ?? 0) + g.sa);
    lgSA += g.sa;
    lgSaves += g.sa - g.ga;
  }
  const lgSV = lgSA ? lgSaves / lgSA : 0.9;
  const lgSApg = lgGP ? lgSA / lgGP : 30;
  const teamGP = new Map(teams.map((t) => [t.t, t.gp]));
  const teamDef = new Map<string, number>();
  for (const [t, sa] of teamSA) {
    const gp = teamGP.get(t) ?? 0;
    if (!gp) continue;
    teamDef.set(t, (lgSApg * REPL_SHOTS_FACTOR - sa / gp) * gp * (1 - lgSV));
  }

  // Ice-time weights & plus-minus baselines per team
  const weight = (p: SkaterLine) => (p.toi ? p.toi * p.gp : p.gp * (isD(p.pos) ? 1.6 : 1) * 1000);
  const teamW = new Map<string, number>();
  const teamPm = new Map<string, { pm: number; gp: number }>();
  for (const p of skaters) {
    teamW.set(p.team, (teamW.get(p.team) ?? 0) + weight(p));
    const e = teamPm.get(p.team) ?? { pm: 0, gp: 0 };
    e.pm += p.pm;
    e.gp += p.gp;
    teamPm.set(p.team, e);
  }

  const out: WarResult[] = [];
  for (const p of skaters) {
    const off = k * (p.g + 0.5 * p.a) - p.gp * (isD(p.pos) ? replRate.D : replRate.F);
    const tw = teamW.get(p.team) ?? 0;
    const def = tw ? ((teamDef.get(p.team) ?? 0) * weight(p)) / tw : 0;
    const tpm = teamPm.get(p.team);
    const relPm = tpm && tpm.gp ? p.pm - (tpm.pm / tpm.gp) * p.gp : 0;
    const gar = off + def + REL_PM_WEIGHT * relPm;
    out.push({ pid: p.pid, team: p.team, gp: p.gp, gar, war: gar / gpw });
  }
  for (const g of goalies) {
    let gar: number;
    if (g.sa > 0) {
      const sv = (g.sa - g.ga) / g.sa;
      gar = GOALIE_SHRINK * g.sa * (sv - (lgSV - GOALIE_REPL_GAP));
    } else {
      gar = 0;
    }
    out.push({ pid: g.pid, team: g.team, gp: g.gp, gar, war: gar / gpw });
  }
  return out;
}
