import { TRADES, type TradeDef } from "../data/trades";
import { seasonForDate, seasonLabel } from "../data/league";
import { projectHealthy, type Extra } from "./injuries";
import { abbrFor, franchiseOf, resolvePlayer, type DataIndex } from "./dataIndex";

/**
 * Tenure model — how long a player would have stayed with his original team in the alternate timeline:
 *  - mirror: exactly as many seasons as he actually spent with the team that acquired him, then his
 *            real career resumes (the default; it keeps each change local)
 *  - career: he never leaves — the rest of his career belongs to the original team
 */
export type Tenure = "mirror" | "career";

export type Change =
  | { kind: "trade"; tradeId: string; tenure: Tenure }
  | { kind: "draft"; year: number; overall: number; altPid: number; tenure: Tenure }
  | { kind: "move"; pid: number; season: number; toFranchise: number; years: number | "career" }
  | { kind: "injury"; pid: number; from: number; to: number; availability?: number; team?: string; presetId?: string };

/** Row index → team the row belongs to in the alternate timeline (null = removed from the league). */
export type Overrides = Map<number, string | null>;

export interface ResolvedAsset {
  name: string;
  via?: string;
  pid: number | null;
}

export interface Move {
  pid: number;
  from: string;
  to: string | null;
  seasons: number[];
}

export interface AppliedChange {
  change: Change;
  title: string;
  moves: Move[];
  warnings: string[];
  /** Healthy-projection production added by an injury change. */
  extras?: Extra[];
}

export function tradeById(id: string): TradeDef | undefined {
  return TRADES.find((t) => t.id === id);
}

export function resolveTrade(ix: DataIndex, t: TradeDef): { team: string; assets: ResolvedAsset[] }[] {
  const season = seasonForDate(t.date);
  const teams = t.sides.map((s) => s.team);
  return t.sides.map((s) => ({
    team: s.team,
    assets: s.receives.map((a) => ({ ...a, pid: resolvePlayer(ix, a.name, teams, season) })),
  }));
}

const currentTeam = (ix: DataIndex, ov: Overrides, i: number) => (ov.has(i) ? ov.get(i)! : ix.ds.rows[i][2]);

/**
 * Rows of `pid` from `fromSeason` on, starting at the first row that belongs to `franchise`
 * (in the current alternate timeline) and continuing while it still does.
 */
export function tenureRun(ix: DataIndex, ov: Overrides, pid: number, franchise: number, fromSeason: number, tenure: Tenure): number[] {
  const rows = (ix.rowsByPlayer.get(pid) ?? []).filter((i) => ix.ds.rows[i][1] >= fromSeason);
  const start = rows.findIndex((i) => {
    const t = currentTeam(ix, ov, i);
    return t !== null && franchiseOf(ix, t) === franchise;
  });
  if (start < 0) return [];
  if (tenure === "career") return rows.slice(start).filter((i) => currentTeam(ix, ov, i) !== null);
  const run: number[] = [];
  for (const i of rows.slice(start)) {
    const t = currentTeam(ix, ov, i);
    if (t === null || franchiseOf(ix, t) !== franchise) break;
    run.push(i);
  }
  return run;
}

/** Was the player on `franchise` in the alternate timeline just before (or during) the trade season? */
function wasWith(ix: DataIndex, ov: Overrides, pid: number, franchise: number, receiver: number, season: number): boolean {
  const before = (ix.rowsByPlayer.get(pid) ?? [])
    .filter((i) => ix.ds.rows[i][1] <= season)
    .map((i) => currentTeam(ix, ov, i))
    .filter((t): t is string => t !== null && franchiseOf(ix, t) !== receiver);
  // No NHL games before the trade (a prospect) → nothing to contradict.
  return !before.length || franchiseOf(ix, before.at(-1)!) === franchise;
}

/** Reassign rows to `franchise` (using whatever abbrev it had each season). */
export function reassign(ix: DataIndex, ov: Overrides, rows: number[], franchise: number | null, pid: number, warnings: string[]): Move[] {
  const moves = new Map<string, Move>();
  for (const i of rows) {
    const r = ix.ds.rows[i];
    const from = currentTeam(ix, ov, i)!;
    let to: string | null = null;
    if (franchise !== null) {
      to = abbrFor(ix, franchise, r[1]);
      if (!to) {
        warnings.push(`${ix.ds.players[pid]?.n ?? pid}: franchise did not exist in ${r[1]}; season left unchanged`);
        continue;
      }
    }
    if (to === from) continue;
    ov.set(i, to);
    const k = `${from}>${to}`;
    const m = moves.get(k) ?? { pid, from, to, seasons: [] };
    if (!m.seasons.includes(r[1])) m.seasons.push(r[1]);
    moves.set(k, m);
  }
  return [...moves.values()];
}

export function applyChange(ix: DataIndex, ov: Overrides, change: Change): AppliedChange {
  const warnings: string[] = [];
  const moves: Move[] = [];

  if (change.kind === "injury") {
    const p = ix.ds.players[change.pid];
    const name = p?.n ?? String(change.pid);
    // Keeping him with one club: his real seasons elsewhere in the window move there first.
    if (change.team) {
      const fr = franchiseOf(ix, change.team);
      const rows = (ix.rowsByPlayer.get(change.pid) ?? []).filter((i) => {
        const r = ix.ds.rows[i];
        const t = currentTeam(ix, ov, i);
        return r[1] >= change.from && r[1] <= change.to && t !== null && franchiseOf(ix, t) !== fr;
      });
      moves.push(...reassign(ix, ov, rows, fr, change.pid, warnings));
    }
    const proj = projectHealthy(ix, { pid: change.pid, from: change.from, to: change.to, availability: change.availability, team: change.team, teamOf: (i) => currentTeam(ix, ov, i) });
    if (!proj) return { change, title: `${name} stays healthy`, moves, warnings: [...warnings, `Not enough healthy seasons to project ${name}`], extras: [] };
    const span = change.from === change.to ? seasonLabel(change.from) : `${seasonLabel(change.from)} to ${seasonLabel(change.to)}`;
    return { change, title: `${name} stays healthy, ${span}`, moves, warnings, extras: proj.extras };
  }

  if (change.kind === "trade") {
    const t = tradeById(change.tradeId);
    if (!t) return { change, title: `Unknown trade ${change.tradeId}`, moves, warnings: ["unknown trade"] };
    const season = seasonForDate(t.date);
    const sides = resolveTrade(ix, t);
    sides.forEach((side, k) => {
      const giver = sides[1 - k].team; // the team that sent these assets away
      const giverFr = franchiseOf(ix, giver);
      const receiverFr = franchiseOf(ix, side.team);
      for (const a of side.assets) {
        if (a.pid === null) {
          warnings.push(`Could not find ${a.name} in NHL data`);
          continue;
        }
        // A traded player must still belong to the giver in this timeline (earlier changes may have
        // moved him elsewhere). Picks are exempt: the giver would simply have made the selection.
        if (!a.via && !wasWith(ix, ov, a.pid, giverFr, receiverFr, season)) {
          warnings.push(`${a.name} was not with ${giver} at the time in this timeline — left as is`);
          continue;
        }
        // Picks: the player's run with the receiving club starts whenever he debuts.
        const run = tenureRun(ix, ov, a.pid, receiverFr, season, change.tenure);
        moves.push(...reassign(ix, ov, run, giverFr, a.pid, warnings));
      }
    });
    return { change, title: `Undo: ${t.title}`, moves, warnings };
  }

  if (change.kind === "draft") {
    const pick = ix.ds.draft.find((d) => d[0] === change.year && d[2] === change.overall);
    const alt = ix.ds.players[change.altPid];
    if (!pick || !alt?.dr || alt.dr[0] !== change.year) {
      return { change, title: "Invalid draft redo", moves, warnings: ["The alternate player must come from the same draft."] };
    }
    const [, , , team, origPid, origName] = pick;
    const altTeam = alt.dr[3];
    const draftSeason = change.year * 10000 + change.year + 1;
    const teamFr = franchiseOf(ix, team);
    const altFr = franchiseOf(ix, altTeam);
    // Collect both runs before reassigning, so the swap is simultaneous.
    const origRun = origPid ? tenureRun(ix, ov, origPid, teamFr, draftSeason, change.tenure) : [];
    const altRun = tenureRun(ix, ov, change.altPid, altFr, draftSeason, change.tenure);
    moves.push(...reassign(ix, ov, altRun, teamFr, change.altPid, warnings));
    if (origPid) moves.push(...reassign(ix, ov, origRun, altFr, origPid, warnings));
    return { change, title: `Redraft ${change.year} #${change.overall}: ${team} takes ${alt.n} instead of ${origName}`, moves, warnings };
  }

  // custom move
  const rows = (ix.rowsByPlayer.get(change.pid) ?? []).filter((i) => ix.ds.rows[i][1] >= change.season && currentTeam(ix, ov, i) !== null);
  const seasons = [...new Set(rows.map((i) => ix.ds.rows[i][1]))];
  const keep = change.years === "career" ? seasons : seasons.slice(0, change.years);
  const chosen = rows.filter((i) => keep.includes(ix.ds.rows[i][1]));
  moves.push(...reassign(ix, ov, chosen, change.toFranchise, change.pid, warnings));
  const p = ix.ds.players[change.pid];
  const dest = keep.length ? abbrFor(ix, change.toFranchise, keep[0]) : null;
  const span = change.years === "career" ? "for the rest of his career" : `for ${keep.length} season${keep.length === 1 ? "" : "s"}`;
  const destName = dest ? (ix.ds.teams[dest]?.name ?? dest) : `franchise ${change.toFranchise}`;
  return { change, title: `${p?.n ?? change.pid} plays for the ${destName} ${span}`, moves, warnings };
}

export function applyAll(ix: DataIndex, changes: Change[]): { overrides: Overrides; extras: Extra[]; applied: AppliedChange[] } {
  const overrides: Overrides = new Map();
  const applied = changes.map((c) => applyChange(ix, overrides, c));
  return { overrides, extras: applied.flatMap((a) => a.extras ?? []), applied };
}
