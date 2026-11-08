/** Compact dataset shipped to the browser (public/data/nhl.json). Built by scripts/build-data.ts. */

export type PlayoffFormat = "overall16" | "division4" | "conference8" | "wildcard";

export interface SeasonInfo {
  id: number; // e.g. 19881989
  label: string; // "1988-89"
  teamGoalsPerGame: number;
  goalsPerWin: number;
  format: PlayoffFormat;
  champion: string | null; // team abbrev
  runnerUp: string | null;
  capCeiling: number | null; // millions USD, null before the 2005 CBA
}

export interface TeamInfo {
  name: string;
  franchise: number;
}

export interface TeamSeason {
  t: string; // abbrev
  conf: string | null;
  div: string | null;
  gp: number;
  w: number;
  pts: number;
  gf: number;
  ga: number;
}

export interface PlayerInfo {
  n: string; // full name
  pos: string; // C L R D G
  /** [draftYear, overall, round, draftedBy abbrev] */
  dr?: [number, number, number, string];
}

/** [playerId, seasonId, team, gamesPlayed, WAR × 100, points (skaters) or saves% × 1000 (goalies)] */
export type PlayerSeasonRow = [number, number, string, number, number, number];

/** [year, round, overall, team, playerId (0 = never reached the NHL / unknown), name, pos, pickHistory] */
export type DraftRow = [number, number, number, string, number, string, string, string];

export interface Dataset {
  generatedAt: string;
  seasons: SeasonInfo[];
  teams: Record<string, TeamInfo>;
  standings: Record<string, TeamSeason[]>;
  players: Record<string, PlayerInfo>;
  rows: PlayerSeasonRow[];
  draft: DraftRow[];
}
