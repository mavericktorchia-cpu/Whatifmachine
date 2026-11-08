/**
 * Turns ./data-raw into the compact dataset the app loads (public/data/nhl.json), computing sWAR for
 * every player-team-season since 1979-80.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { computeSeasonWar, goalsPerWin, type GoalieLine, type SkaterLine, type TeamLine } from "../src/engine/war";
import { CAP_CEILING, playoffFormat, seasonLabel } from "../src/data/league";
import type { Dataset, DraftRow, PlayerInfo, PlayerSeasonRow, SeasonInfo, TeamSeason } from "../src/engine/types";

const RAW = join(process.cwd(), "data-raw");
const read = <T>(p: string): T => JSON.parse(readFileSync(join(RAW, p), "utf8")) as T;

interface ApiTeam { id: number; franchiseId: number; fullName: string; triCode: string }
interface StandingRow {
  teamAbbrev: { default: string }; teamName: { default: string };
  conferenceAbbrev?: string; divisionAbbrev?: string;
  gamesPlayed: number; wins: number; points: number; goalFor: number; goalAgainst: number;
}
interface SkaterSum {
  playerId: number; skaterFullName: string; positionCode: string; teamAbbrevs: string; gamesPlayed: number;
  goals: number; assists: number; points: number; plusMinus: number; timeOnIcePerGame: number | null;
}
interface GoalieSum {
  playerId: number; goalieFullName: string; teamAbbrevs: string; gamesPlayed: number;
  shotsAgainst: number | null; goalsAgainst: number; timeOnIce: number;
}
interface LandingSeason {
  leagueAbbrev: string; gameTypeId: number; season: number; teamName: { default: string };
  gamesPlayed: number; goals?: number; assists?: number; points?: number; plusMinus?: number; avgToi?: string;
  shotsAgainst?: number; goalsAgainst?: number; timeOnIce?: string;
}

const teams = read<{ data: ApiTeam[] }>("teams.json").data;
// The API lists the 1979 Jets under the modern Jets' franchise; they are the Coyotes' ancestors.
const franchiseFix: Record<string, number> = { WIN: 28 };
const teamInfo: Dataset["teams"] = {};
const nameToAbbrs = new Map<string, string[]>();
for (const t of teams) {
  const name = t.fullName.replace(" (1979)", "");
  teamInfo[t.triCode] = { name, franchise: franchiseFix[t.triCode] ?? t.franchiseId };
  nameToAbbrs.set(name, [...(nameToAbbrs.get(name) ?? []), t.triCode]);
}

const mmss = (s?: string) => {
  if (!s) return null;
  const [m, sec] = s.split(":").map(Number);
  return m * 60 + (sec || 0);
};

const landingCache = new Map<number, LandingSeason[] | null>();
function landingSplits(pid: number, season: number, abbrs: string[]): (LandingSeason & { team: string })[] | null {
  if (!landingCache.has(pid)) {
    const f = join(RAW, "landing", `${pid}.json`);
    landingCache.set(pid, existsSync(f) ? (JSON.parse(readFileSync(f, "utf8"))?.seasonTotals ?? null) : null);
  }
  const all = landingCache.get(pid);
  if (!all) return null;
  const rows = all.filter((s) => s.leagueAbbrev === "NHL" && s.gameTypeId === 2 && s.season === season);
  const out = rows.map((r) => {
    const team = (nameToAbbrs.get(r.teamName.default) ?? []).find((a) => abbrs.includes(a));
    return team ? { ...r, team } : null;
  });
  if (!out.length || out.some((r) => !r)) return null;
  return out as (LandingSeason & { team: string })[];
}

const seasonsRaw = read<{ id: number }[]>("seasons.json");
const seasons: SeasonInfo[] = [];
const standings: Dataset["standings"] = {};
const players: Record<string, PlayerInfo> = {};
const rows: PlayerSeasonRow[] = [];

for (const { id } of seasonsRaw) {
  const st = read<{ standings: StandingRow[] }>(`standings/${id}.json`).standings;
  const ts: TeamSeason[] = st.map((r) => ({
    t: r.teamAbbrev.default,
    conf: r.conferenceAbbrev || null,
    div: r.divisionAbbrev || null,
    gp: r.gamesPlayed, w: r.wins, pts: r.points, gf: r.goalFor, ga: r.goalAgainst,
  }));
  standings[id] = ts;
  for (const r of st) if (!teamInfo[r.teamAbbrev.default]) throw new Error(`unknown team ${r.teamAbbrev.default}`);
  const teamLines: TeamLine[] = ts.map((t) => ({ t: t.t, gp: t.gp, gf: t.gf, ga: t.ga }));

  const skaterLines: SkaterLine[] = [];
  const pts = new Map<string, number>();
  for (const s of read<{ data: SkaterSum[] }>(`skaters/${id}.json`).data) {
    players[s.playerId] ??= { n: s.skaterFullName, pos: s.positionCode };
    const abbrs = s.teamAbbrevs.split(",");
    if (abbrs.length === 1) {
      skaterLines.push({ pid: s.playerId, team: abbrs[0], pos: s.positionCode, gp: s.gamesPlayed, g: s.goals, a: s.assists, pm: s.plusMinus, toi: s.timeOnIcePerGame });
      pts.set(`${s.playerId}|${abbrs[0]}`, s.points);
      continue;
    }
    const splits = landingSplits(s.playerId, id, abbrs);
    if (splits) {
      for (const r of splits) {
        skaterLines.push({ pid: s.playerId, team: r.team, pos: s.positionCode, gp: r.gamesPlayed, g: r.goals ?? 0, a: r.assists ?? 0, pm: r.plusMinus ?? 0, toi: mmss(r.avgToi) ?? s.timeOnIcePerGame });
        pts.set(`${s.playerId}|${r.team}`, r.points ?? 0);
      }
    } else {
      // Short career, no landing page fetched: split the season evenly between the listed teams.
      const n = abbrs.length;
      for (const team of abbrs) {
        skaterLines.push({ pid: s.playerId, team, pos: s.positionCode, gp: s.gamesPlayed / n, g: s.goals / n, a: s.assists / n, pm: s.plusMinus / n, toi: s.timeOnIcePerGame });
        pts.set(`${s.playerId}|${team}`, Math.round(s.points / n));
      }
    }
  }

  const goalieLines: GoalieLine[] = [];
  for (const g of read<{ data: GoalieSum[] }>(`goalies/${id}.json`).data) {
    players[g.playerId] ??= { n: g.goalieFullName, pos: "G" };
    const abbrs = g.teamAbbrevs.split(",");
    const base = { pid: g.playerId };
    if (abbrs.length === 1) {
      goalieLines.push({ ...base, team: abbrs[0], gp: g.gamesPlayed, sa: g.shotsAgainst ?? 0, ga: g.goalsAgainst, toi: g.timeOnIce });
      continue;
    }
    const splits = landingSplits(g.playerId, id, abbrs);
    if (splits) {
      for (const r of splits) goalieLines.push({ ...base, team: r.team, gp: r.gamesPlayed, sa: r.shotsAgainst ?? 0, ga: r.goalsAgainst ?? 0, toi: mmss(r.timeOnIce) ?? 0 });
    } else {
      const n = abbrs.length;
      for (const team of abbrs) goalieLines.push({ ...base, team, gp: g.gamesPlayed / n, sa: (g.shotsAgainst ?? 0) / n, ga: g.goalsAgainst / n, toi: g.timeOnIce / n });
    }
  }

  const war = computeSeasonWar(teamLines, skaterLines, goalieLines);
  const gl = new Map(goalieLines.map((g) => [`${g.pid}|${g.team}`, g]));
  for (const w of war) {
    const g = gl.get(`${w.pid}|${w.team}`);
    const extra = g ? (g.sa ? Math.round(((g.sa - g.ga) / g.sa) * 1000) : 0) : (pts.get(`${w.pid}|${w.team}`) ?? 0);
    rows.push([w.pid, id, w.team, Math.round(w.gp), Math.round(w.war * 100), extra]);
  }

  // Champion from the final playoff round.
  let champion: string | null = null;
  let runnerUp: string | null = null;
  const po = read<{ rounds?: { series: { topSeed: { id: number; abbrev: string }; bottomSeed: { id: number; abbrev: string }; winningTeamId?: number }[] }[] } | null>(`playoffs/${id}.json`);
  const fin = po?.rounds?.at(-1)?.series?.[0];
  if (fin?.winningTeamId) {
    const top = fin.topSeed.id === fin.winningTeamId;
    champion = top ? fin.topSeed.abbrev : fin.bottomSeed.abbrev;
    runnerUp = top ? fin.bottomSeed.abbrev : fin.topSeed.abbrev;
  }
  const gpw = goalsPerWin(teamLines);
  seasons.push({
    id, label: seasonLabel(id), teamGoalsPerGame: +gpw.teamGoalsPerGame.toFixed(3), goalsPerWin: +gpw.goalsPerWin.toFixed(3),
    format: playoffFormat(id), champion, runnerUp, capCeiling: CAP_CEILING[id] ?? null,
  });
}

interface DraftApi { draftYear: number; roundNumber: number; overallPickNumber: number; triCode: string; playerId: number | null; playerName: string; position: string; teamPickHistory: string | null; supplementalDraft: string }
const draft: DraftRow[] = read<{ data: DraftApi[] }>("draft.json")
  .data.filter((d) => d.draftYear >= 1979 && d.supplementalDraft !== "Y")
  .sort((a, b) => a.draftYear - b.draftYear || a.overallPickNumber - b.overallPickNumber)
  .map((d) => [d.draftYear, d.roundNumber, d.overallPickNumber, d.triCode, d.playerId && players[d.playerId] ? d.playerId : 0, d.playerName, d.position, d.teamPickHistory ?? ""]);
for (const d of draft) {
  if (d[4] && !players[d[4]].dr) players[d[4]].dr = [d[0], d[2], d[1], d[3]];
}

const ds: Dataset = { generatedAt: new Date().toISOString(), seasons, teams: teamInfo, standings, players, rows, draft };
mkdirSync(join(process.cwd(), "public", "data"), { recursive: true });
const out = join(process.cwd(), "public", "data", "nhl.json");
writeFileSync(out, JSON.stringify(ds));
console.log(`wrote ${out}: ${seasons.length} seasons, ${Object.keys(players).length} players, ${rows.length} rows, ${draft.length} picks (${(readFileSync(out).length / 1e6).toFixed(1)} MB)`);
console.log(`missing champions: ${seasons.filter((s) => !s.champion).map((s) => s.label).join(", ") || "none"}`);
