import type { PlayoffFormat } from "../engine/types";

/** Upper limit of the salary cap by season, in millions USD (introduced with the 2005 CBA). */
export const CAP_CEILING: Record<number, number> = {
  20052006: 39.0,
  20062007: 44.0,
  20072008: 50.3,
  20082009: 56.7,
  20092010: 56.8,
  20102011: 59.4,
  20112012: 64.3,
  20122013: 60.0, // lockout-shortened season, prorated
  20132014: 64.3,
  20142015: 69.0,
  20152016: 71.4,
  20162017: 73.0,
  20172018: 75.0,
  20182019: 79.5,
  20192020: 81.5,
  20202021: 81.5,
  20212022: 81.5,
  20222023: 82.5,
  20232024: 83.5,
  20242025: 88.0,
  20252026: 95.5,
  20262027: 104.0,
};

/** League minimum salary (millions) — used for the replacement-level cap estimate. */
export const LEAGUE_MIN: Record<number, number> = {
  20052006: 0.45, 20062007: 0.45, 20072008: 0.475, 20082009: 0.475, 20092010: 0.5, 20102011: 0.5,
  20112012: 0.525, 20122013: 0.525, 20132014: 0.55, 20142015: 0.55, 20152016: 0.575, 20162017: 0.575,
  20172018: 0.65, 20182019: 0.65, 20192020: 0.7, 20202021: 0.7, 20212022: 0.75, 20222023: 0.75,
  20232024: 0.775, 20242025: 0.775, 20252026: 0.775, 20262027: 0.85,
};

/**
 * Playoff format by season. The engine models four bracket shapes:
 *  - overall16:   16 teams seeded league-wide, re-seeded each round (1979-81)
 *  - division4:   top four per division, division brackets (1981-93; 2020-21 realigned divisions)
 *  - conference8: top eight per conference, division winners seeded first, re-seeded (1993-2013;
 *                 the 2020 24-team bubble is approximated with this format)
 *  - wildcard:    top three per division + two wild cards per conference (2013-14 onward)
 */
export function playoffFormat(season: number): PlayoffFormat {
  if (season <= 19801981) return "overall16";
  if (season <= 19921993 || season === 20202021) return "division4";
  if (season <= 20122013 || season === 20192020) return "conference8";
  return "wildcard";
}

export function seasonLabel(season: number): string {
  const start = Math.floor(season / 10000);
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** NHL season a calendar date falls in (July 1 starts the new league year). */
export function seasonForDate(date: string): number {
  const [y, m] = date.split("-").map(Number);
  const start = m >= 7 ? y : y - 1;
  return start * 10000 + start + 1;
}
