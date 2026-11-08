/**
 * Converts the scraped trade ledger (data-sources/trades/*.csv, from nhltradetracker.com through
 * March 2025 and capwages.com after) into compact trades with every player resolved to an NHL player id.
 *
 *  - Teams are matched by name to a franchise, then to the abbrev that franchise used that season
 *    (the ledger calls Phoenix-era trades "Arizona Coyotes", for example).
 *  - Players are matched by name, preferring the namesake who played for one of the two clubs around
 *    the trade date.
 *  - Draft picks resolve to the player eventually taken: "(#13-Jean-Sebastien Giguere)" by draft slot,
 *    "(TOR)" through the draft records' pick history.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { seasonForDate } from "../src/data/league";
import { abbrFor, buildIndex, normName, resolvePlayer, type DataIndex } from "../src/engine/dataIndex";
import type { Dataset, LedgerAsset, LedgerTrade } from "../src/engine/types";

const DIR = join(process.cwd(), "data-sources", "trades");

/** Minimal RFC 4180 CSV parser (quoted fields, embedded commas and quotes). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

const ALIASES: Record<string, string> = {
  "California Golden Seals (Oakland)": "California Golden Seals",
  "Oakland Seals": "California Golden Seals",
  "Mighty Ducks of Anaheim": "Anaheim Ducks",
  "Phoenix Coyotes": "Arizona Coyotes",
  "Utah Hockey Club": "Utah Mammoth",
};

export interface LedgerStats {
  trades: number;
  assets: number;
  players: number;
  playersResolved: number;
  picks: number;
  picksResolved: number;
  skippedTeams: Map<string, number>;
  unresolvedPlayers: Map<string, number>;
}

export function buildLedger(ds: Dataset): { trades: LedgerTrade[]; stats: LedgerStats } {
  const ix: DataIndex = buildIndex(ds);
  const assets = parseCsv(readFileSync(join(DIR, "ALL_NHL_TRADES_assets.csv"), "utf8"));
  const firstSeason = ds.seasons[0].id;

  // Team name → franchises carrying that name (the Jets and Senators names were used twice).
  const nameToFranchises = new Map<string, Set<number>>();
  for (const [, t] of Object.entries(ds.teams)) {
    const k = normName(t.name);
    const set = nameToFranchises.get(k) ?? new Set<number>();
    set.add(t.franchise);
    nameToFranchises.set(k, set);
  }
  const teamAt = (name: string, season: number): string | null => {
    const n = normName(ALIASES[name] ?? name);
    for (const fr of nameToFranchises.get(n) ?? []) {
      // Off-season trades can fall in a season a franchise hadn't started or had already left.
      const abbr = abbrFor(ix, fr, season) ?? abbrFor(ix, fr, season - 10001) ?? abbrFor(ix, fr, season + 10001);
      if (abbr) return abbr;
    }
    return null;
  };

  /**
   * Nicknames and spellings differ between sources ("Steven"/"Steve", "Tiger"/"Dave" Williams, middle
   * initials). Fall back to the one player with that last name who played for either club within a
   * season of the trade.
   */
  const fallbackPlayer = (name: string, teams: string[], season: number): number | null => {
    const parts = normName(name.replace(/\b[A-Z]\.\s*/g, " ").replace(/\b(jr|sr|ii|iii)\b\.?/gi, "")).split(" ").filter(Boolean);
    const last = parts.at(-1);
    if (!last) return null;
    const frs = new Set(teams.map((t) => ds.teams[t]?.franchise));
    const found = new Set<number>();
    for (const s of [season - 10001, season, season + 10001]) {
      for (const t of ix.standings.get(s) ?? []) {
        if (!frs.has(ds.teams[t.t].franchise)) continue;
        for (const i of ix.rowsByTeamSeason.get(`${t.t}|${s}`) ?? []) {
          const pid = ds.rows[i][0];
          const pn = normName(ds.players[pid].n).split(" ");
          if (pn.at(-1) === last) found.add(pid);
        }
      }
    }
    if (found.size === 1) return [...found][0];
    // Several namesakes: require the first initial to match too.
    const byInitial = [...found].filter((pid) => normName(ds.players[pid].n)[0] === parts[0]?.[0]);
    return byInitial.length === 1 ? byInitial[0] : null;
  };

  // Draft lookups.
  const bySlot = new Map(ds.draft.map((d) => [`${d[0]}|${d[2]}`, d]));
  const byOwner = new Map<string, Dataset["draft"]>();
  for (const d of ds.draft) {
    const owner = d[7] ? d[7].split("-")[0] : d[3];
    const k = `${d[0]}|${d[1]}|${owner}`;
    byOwner.set(k, [...(byOwner.get(k) ?? []), d]);
  }
  const ROUND: Record<string, number> = { "1st": 1, "2nd": 2, "3rd": 3, "4th": 4, "5th": 5, "6th": 6, "7th": 7, "8th": 8, "9th": 9, "10th": 10, "11th": 11, "12th": 12 };

  const sameName = (x: string, y: string) => {
    const lx = normName(x).split(" ").at(-1) ?? "";
    const ly = normName(y).split(" ").at(-1) ?? "";
    return lx === ly || (lx.length >= 4 && ly.length >= 4 && lx.slice(0, 4) === ly.slice(0, 4));
  };
  /**
   * Resolve a pick to the player eventually drafted with it:
   *  1. "#13-Jean-Sebastien Giguere" anywhere in the text (with its own year if given, e.g.
   *     "1976 or 1977 1st round pick (1977 #8-Lucien DeBlois)"): by slot, checked against the name.
   *  2. "(TOR)": the pick originally owned by that team in that year and round.
   *  3. A bare "2018 2nd round pick": the pick of that year and round whose history shows it moving
   *     from the trading team to the receiving team.
   */
  const resolvePick = (text: string, from: string, to: string): number => {
    const ref = text.match(/(?:(\d{4})\s*)?#(\d+)\s*-\s*([^)]+?)\s*\)/);
    const years = [...text.matchAll(/\b(19\d{2}|20\d{2})\b/g)].map((m) => Number(m[1]));
    if (ref) {
      const year = ref[1] ? Number(ref[1]) : years[0];
      const d = bySlot.get(`${year}|${Number(ref[2])}`);
      if (d?.[4] && sameName(d[5], ref[3])) return d[4];
      // Slot typo: find the named player in that draft instead.
      const named = ds.draft.filter((x) => x[0] === year && x[4] && sameName(x[5], ref[3]) && normName(x[5])[0] === normName(ref[3])[0]);
      return named.length === 1 ? named[0][4] : 0;
    }
    const rm = text.match(/(\d{4})\s+(?:conditional\s+)?(\w+)\s+round pick(?:\s*\(([A-Z]{3})\))?/i);
    const round = rm ? ROUND[rm[2].toLowerCase()] : undefined;
    if (!rm || !round) return 0;
    const year = Number(rm[1]);
    if (rm[3]) {
      const cands = (byOwner.get(`${year}|${round}|${rm[3]}`) ?? []).filter((d) => d[4]);
      return cands.length === 1 ? cands[0][4] : 0;
    }
    const hop = `${from}-${to}`;
    const cands = ds.draft.filter((d) => d[0] === year && d[1] === round && d[7] && `-${d[7]}-`.includes(`-${hop}-`));
    return cands.length === 1 ? cands[0][4] : 0;
  };

  const stats: LedgerStats = { trades: 0, assets: 0, players: 0, playersResolved: 0, picks: 0, picksResolved: 0, skippedTeams: new Map(), unresolvedPlayers: new Map() };
  const byTrade = new Map<string, { date: string; season: number; assets: LedgerAsset[]; teams: string[] }>();

  for (const a of assets) {
    const season = seasonForDate(a.date);
    if (season < firstSeason) continue;
    const from = teamAt(a.from_team, season);
    const to = teamAt(a.to_team, season);
    if (!from || !to) {
      for (const n of [a.from_team, a.to_team]) if (!teamAt(n, season)) stats.skippedTeams.set(n, (stats.skippedTeams.get(n) ?? 0) + 1);
      continue;
    }
    let pid = 0;
    let kind: LedgerAsset[4] = "o";
    let label = a.asset;
    if (a.asset_type === "player" || a.asset_type === "rights") {
      kind = "p";
      const name = a.asset.replace(/^rights to\s+/i, "").trim();
      label = name;
      stats.players++;
      pid = resolvePlayer(ix, name, [from, to], season) ?? fallbackPlayer(name, [from, to], season) ?? 0;
      if (pid) stats.playersResolved++;
      else stats.unresolvedPlayers.set(name, (stats.unresolvedPlayers.get(name) ?? 0) + 1);
    } else if (a.asset_type === "draft_pick") {
      kind = "d";
      stats.picks++;
      pid = resolvePick(a.asset, from, to);
      if (pid && !a.asset.includes("#")) label = `${a.asset} → ${ds.players[pid].n}`;
      if (pid) stats.picksResolved++;
    }
    const t = byTrade.get(a.trade_id) ?? { date: a.date, season, assets: [], teams: [] };
    t.assets.push([from, to, label, pid, kind]);
    for (const x of [from, to]) if (!t.teams.includes(x)) t.teams.push(x);
    byTrade.set(a.trade_id, t);
    stats.assets++;
  }

  const trades: LedgerTrade[] = [];
  for (const [id, t] of byTrade) {
    // Keep trades that move at least one player who appears in the stats.
    if (!t.assets.some((a) => a[3])) continue;
    trades.push({ i: id, d: t.date, t: t.teams, a: t.assets });
  }
  trades.sort((x, y) => x.d.localeCompare(y.d) || x.i.localeCompare(y.i));
  stats.trades = trades.length;
  return { trades, stats };
}
