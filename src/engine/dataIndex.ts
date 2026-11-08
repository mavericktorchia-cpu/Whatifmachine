import type { Dataset, PlayerSeasonRow, SeasonInfo, TeamSeason } from "./types";

/** Lookup structures over the raw dataset. Built once after load. */
export interface DataIndex {
  ds: Dataset;
  seasonIds: number[];
  season: Map<number, SeasonInfo>;
  rowsByPlayer: Map<number, number[]>; // row indices, chronological
  rowsByTeamSeason: Map<string, number[]>; // `${abbr}|${season}`
  /** `${franchise}|${season}` → abbrev used by that franchise that season */
  franchiseAbbr: Map<string, string>;
  standings: Map<number, TeamSeason[]>;
  playersByName: Map<string, number[]>;
}

export const key = (a: string | number, b: string | number) => `${a}|${b}`;

export function buildIndex(ds: Dataset): DataIndex {
  const rowsByPlayer = new Map<number, number[]>();
  const rowsByTeamSeason = new Map<string, number[]>();
  ds.rows.forEach((r, i) => {
    let p = rowsByPlayer.get(r[0]);
    if (!p) rowsByPlayer.set(r[0], (p = []));
    p.push(i);
    const k = key(r[2], r[1]);
    let t = rowsByTeamSeason.get(k);
    if (!t) rowsByTeamSeason.set(k, (t = []));
    t.push(i);
  });
  for (const list of rowsByPlayer.values()) list.sort((a, b) => ds.rows[a][1] - ds.rows[b][1] || a - b);

  const franchiseAbbr = new Map<string, string>();
  const standings = new Map<number, TeamSeason[]>();
  for (const s of ds.seasons) {
    const st = ds.standings[s.id] ?? [];
    standings.set(s.id, st);
    for (const t of st) franchiseAbbr.set(key(ds.teams[t.t].franchise, s.id), t.t);
  }
  const playersByName = new Map<string, number[]>();
  for (const [id, p] of Object.entries(ds.players)) {
    const n = normName(p.n);
    playersByName.set(n, [...(playersByName.get(n) ?? []), Number(id)]);
  }
  return {
    ds,
    seasonIds: ds.seasons.map((s) => s.id),
    season: new Map(ds.seasons.map((s) => [s.id, s])),
    rowsByPlayer,
    rowsByTeamSeason,
    franchiseAbbr,
    standings,
    playersByName,
  };
}

export function normName(n: string): string {
  return n
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export const franchiseOf = (ix: DataIndex, abbr: string) => ix.ds.teams[abbr]?.franchise ?? -1;
export const abbrFor = (ix: DataIndex, franchise: number, season: number) => ix.franchiseAbbr.get(key(franchise, season)) ?? null;
export const row = (ix: DataIndex, i: number): PlayerSeasonRow => ix.ds.rows[i];
export const war = (r: PlayerSeasonRow) => r[4] / 100;

export function careerWar(ix: DataIndex, pid: number): number {
  return (ix.rowsByPlayer.get(pid) ?? []).reduce((s, i) => s + ix.ds.rows[i][4], 0) / 100;
}

export function careerGp(ix: DataIndex, pid: number): number {
  return (ix.rowsByPlayer.get(pid) ?? []).reduce((s, i) => s + ix.ds.rows[i][3], 0);
}

/**
 * Resolve a player by name, preferring someone who played for one of `teams` within a few seasons of
 * `season` (handles namesakes like the two Taylor Halls).
 */
export function resolvePlayer(ix: DataIndex, name: string, teams: string[] = [], season?: number): number | null {
  const ids = ix.playersByName.get(normName(name)) ?? [];
  if (!ids.length) return null;
  if (ids.length === 1) return ids[0];
  const fr = new Set(teams.map((t) => franchiseOf(ix, t)));
  const score = (pid: number) => {
    let s = careerGp(ix, pid) / 10000;
    for (const i of ix.rowsByPlayer.get(pid) ?? []) {
      const r = ix.ds.rows[i];
      const near = season === undefined || Math.abs(Math.floor(r[1] / 10000) - Math.floor(season / 10000)) <= 4;
      if (near && fr.has(franchiseOf(ix, r[2]))) s += 1;
      else if (near) s += 0.1;
    }
    return s;
  };
  return [...ids].sort((a, b) => score(b) - score(a))[0];
}
