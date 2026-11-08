import { seasonLabel } from "../data/league";
import type { DataIndex } from "../engine/dataIndex";

export const fmtSeason = seasonLabel;
export const signed = (n: number, d = 1) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n).toFixed(d)}`;
export const pct = (p: number, d = 1) => `${(p * 100).toFixed(d)}%`;
export const money = (m: number) => `$${m.toFixed(2)}M`;
export const teamName = (ix: DataIndex, abbr: string | null) => (abbr ? (ix.ds.teams[abbr]?.name ?? abbr) : "—");
export const playerName = (ix: DataIndex, pid: number) => ix.ds.players[pid]?.n ?? `#${pid}`;
export const tone = (n: number, eps = 0.005) => (n > eps ? "up" : n < -eps ? "down" : "flat");
