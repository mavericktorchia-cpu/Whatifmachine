import { CAP_CEILING, LEAGUE_MIN } from "../data/league";
import { CONTRACTS } from "../data/trades";
import { normName, type DataIndex } from "./dataIndex";

/**
 * Cap hit for a player-season, in millions.
 *  1. Known contract (curated list) → its AAV.
 *  2. Within three seasons of the NHL debut for a drafted player → entry-level deal.
 *  3. Otherwise a market estimate: league minimum + (average WAR over the two previous seasons) × $/WAR,
 *     where $/WAR is the cap space above minimum salaries divided by average team WAR. Capped at 20% of
 *     the ceiling (the CBA max contract).
 * Returns null before the 2005 CBA, when there was no cap.
 */
export interface CapModel {
  capHit: (pid: number, season: number) => { aav: number; estimated: boolean } | null;
}

export function buildCapModel(ix: DataIndex): CapModel {
  const contracts = new Map<string, [number, number, number][]>();
  for (const [n, c] of Object.entries(CONTRACTS)) contracts.set(normName(n), c);

  const teamWar = new Map<number, number>();
  for (const s of ix.ds.seasons) {
    const total = ix.ds.rows.reduce((acc, r) => (r[1] === s.id ? acc + Math.max(0, r[4]) : acc), 0) / 100;
    const teams = ix.standings.get(s.id)?.length || 1;
    teamWar.set(s.id, total / teams);
  }
  const memo = new Map<string, { aav: number; estimated: boolean } | null>();

  const capHit = (pid: number, season: number) => {
    const k = `${pid}|${season}`;
    if (memo.has(k)) return memo.get(k)!;
    const ceiling = CAP_CEILING[season];
    let res: { aav: number; estimated: boolean } | null = null;
    if (ceiling) {
      const p = ix.ds.players[pid];
      const known = p && contracts.get(normName(p.n))?.find(([a, b]) => season >= a && season <= b);
      if (known) res = { aav: known[2], estimated: false };
      else {
        const rows = (ix.rowsByPlayer.get(pid) ?? []).map((i) => ix.ds.rows[i]);
        const seasons = [...new Set(rows.map((r) => r[1]))];
        const idx = seasons.indexOf(season);
        const min = LEAGUE_MIN[season] ?? 0.75;
        if (p?.dr && idx >= 0 && idx < 3 && Math.floor(season / 10000) - p.dr[0] <= 5) {
          res = { aav: +(min * 1.25).toFixed(3), estimated: true };
        } else {
          const prev = seasons.filter((s) => s < season).slice(-2);
          const prevWar = prev.length
            ? prev.reduce((acc, s) => acc + rows.filter((r) => r[1] === s).reduce((x, r) => x + r[4], 0) / 100, 0) / prev.length
            : 0;
          const perWar = (ceiling - 23 * min) / (teamWar.get(season) || teamWar.get(prev.at(-1) ?? 0) || 25);
          const aav = Math.min(0.2 * ceiling, min + Math.max(0, prevWar) * perWar);
          res = { aav: +aav.toFixed(3), estimated: true };
        }
      }
    }
    memo.set(k, res);
    return res;
  };
  return { capHit };
}
