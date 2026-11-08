import { seasonLabel } from "../data/league";
import type { DataIndex } from "../engine/dataIndex";

export const fmtSeason = seasonLabel;
export const signed = (n: number, d = 1) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n).toFixed(d)}`;
export const pct = (p: number, d = 1) => `${(p * 100).toFixed(d)}%`;
export const money = (m: number) => `$${m.toFixed(2)}M`;
export const teamName = (ix: DataIndex, abbr: string | null) => (abbr ? (ix.ds.teams[abbr]?.name ?? abbr) : "—");
export const playerName = (ix: DataIndex, pid: number) => ix.ds.players[pid]?.n ?? `#${pid}`;
export const tone = (n: number, eps = 0.005) => (n > eps ? "up" : n < -eps ? "down" : "flat");

/** WAR each side actually banked from the trade: seasons the player spent with the receiving club. */
export function bankedWar(ix: DataIndex, pid: number | null, team: string, fromSeason: number): number {
  if (pid === null) return 0;
  const fr = ix.ds.teams[team].franchise;
  let w = 0;
  let started = false;
  for (const i of ix.rowsByPlayer.get(pid) ?? []) {
    const r = ix.ds.rows[i];
    if (r[1] < fromSeason) continue;
    const mine = ix.ds.teams[r[2]].franchise === fr;
    if (mine) {
      started = true;
      w += r[4] / 100;
    } else if (started) break;
  }
  return w;
}
