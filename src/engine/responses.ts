/**
 * League responses: second-order effects of a changed history, applied on top of the user's changes.
 *
 *  - Draft order: a team that finishes differently picks in a different first-round slot the following June,
 *    worth the historical difference in value between the two slots.
 *  - Depth displacement: an arriving player takes games from the team's depth players at his position
 *    rather than from a replacement-level player; a departing player's games go to them.
 *  - Deadline behaviour: bad teams sell during the season and good teams buy a little. When a team's standing
 *    moves, it trades like a team at its new standing. The effect is measured from 46 seasons of mid-season moves.
 */
import { franchiseOf, abbrFor, type DataIndex } from "./dataIndex";

export interface ResponseOptions {
  draftOrder: boolean;
  depth: boolean;
  deadline: boolean;
}

export const ALL_RESPONSES: ResponseOptions = { draftOrder: true, depth: true, deadline: true };
export const NO_RESPONSES: ResponseOptions = { draftOrder: false, depth: false, deadline: false };

export const posGroup = (pos: string | undefined) => (pos === "D" ? "D" : pos === "G" ? "G" : "F");

/** Per-game WAR of a depth player is clamped so tiny samples can't swing the result. */
export const DEPTH_RATE_MIN = -0.02;
export const DEPTH_RATE_MAX = 0.03;
/** Share of a position group's games, from the lowest-usage players up, treated as the depth chart's bottom. */
export const DEPTH_SHARE = 0.25;

const memo = new WeakMap<DataIndex, Map<string, number>>();

/**
 * WAR per game of the players at the bottom of a team's depth chart for a position group: the
 * bottom third of the group's games played, lowest-usage players first. These are the players
 * who lose games when someone arrives and gain them when someone leaves.
 */
export function depthRate(ix: DataIndex, team: string, season: number, group: string): number {
  let m = memo.get(ix);
  if (!m) memo.set(ix, (m = new Map()));
  const k = `${team}|${season}|${group}`;
  const hit = m.get(k);
  if (hit !== undefined) return hit;
  const rows = (ix.rowsByTeamSeason.get(`${team}|${season}`) ?? [])
    .map((i) => ix.ds.rows[i])
    .filter((r) => posGroup(ix.ds.players[r[0]]?.pos) === group && r[3] > 0)
    .sort((a, b) => a[3] - b[3]);
  const total = rows.reduce((s, r) => s + r[3], 0);
  let gp = 0;
  let war = 0;
  for (const r of rows) {
    if (gp >= total * DEPTH_SHARE) break;
    gp += r[3];
    war += r[4] / 100;
  }
  const rate = gp ? Math.max(DEPTH_RATE_MIN, Math.min(DEPTH_RATE_MAX, war / gp)) : 0;
  m.set(k, rate);
  return rate;
}

/**
 * Depth correction (WAR) for one team-season, given the rows that arrived and departed.
 * Arrivals push depth players out (−rate × games); departures open games for them (+rate × games).
 */
export function depthCorrection(ix: DataIndex, team: string, season: number, arrived: number[], departed: number[]): number {
  let c = 0;
  for (const i of arrived) {
    const r = ix.ds.rows[i];
    c -= depthRate(ix, team, season, posGroup(ix.ds.players[r[0]]?.pos)) * r[3];
  }
  for (const i of departed) {
    const r = ix.ds.rows[i];
    c += depthRate(ix, team, season, posGroup(ix.ds.players[r[0]]?.pos)) * r[3];
  }
  return c;
}

export interface DeadlineModel {
  /** [standing percentile (0 = best, 1 = worst), average net in-season WAR] at each quintile's centre. */
  curve: [number, number][];
  samples: number;
}

const deadlineMemo = new WeakMap<DataIndex, DeadlineModel>();
export const DEADLINE_BINS = 5;

/**
 * Measure in-season trading by standing. For every player who changed teams during a season, the WAR he
 * produced after the move counts as a gain for the buyer and a loss for the seller. Teams are grouped
 * into fifths of the league by final points%, and the curve holds each fifth's average net WAR
 * (good teams net a little, bad teams shed the most).
 */
export function deadlineModel(ix: DataIndex): DeadlineModel {
  const cached = deadlineMemo.get(ix);
  if (cached) return cached;
  const sums = Array.from({ length: DEADLINE_BINS }, () => ({ n: 0, net: 0 }));
  for (const s of ix.ds.seasons) {
    const net = new Map<string, number>();
    const seen = new Set<number>();
    for (const t of ix.standings.get(s.id) ?? []) {
      for (const i of ix.rowsByTeamSeason.get(`${t.t}|${s.id}`) ?? []) {
        const pid = ix.ds.rows[i][0];
        if (seen.has(pid)) continue;
        seen.add(pid);
        const mine = (ix.rowsByPlayer.get(pid) ?? []).filter((j) => ix.ds.rows[j][1] === s.id).map((j) => ix.ds.rows[j]);
        for (let k = 1; k < mine.length; k++) {
          if (mine[k - 1][2] === mine[k][2]) continue;
          const w = mine[k][4] / 100;
          net.set(mine[k][2], (net.get(mine[k][2]) ?? 0) + w);
          net.set(mine[k - 1][2], (net.get(mine[k - 1][2]) ?? 0) - w);
        }
      }
    }
    const st = [...(ix.standings.get(s.id) ?? [])].sort((a, b) => b.pts / b.gp - a.pts / a.gp);
    st.forEach((t, i) => {
      const b = Math.min(DEADLINE_BINS - 1, Math.floor((i / st.length) * DEADLINE_BINS));
      sums[b].n++;
      sums[b].net += net.get(t.t) ?? 0;
    });
  }
  const curve = sums.map((b, i) => [(i + 0.5) / DEADLINE_BINS, b.n ? b.net / b.n : 0] as [number, number]);
  const model = { curve, samples: sums.reduce((a, b) => a + b.n, 0) };
  deadlineMemo.set(ix, model);
  return model;
}

/** Expected net in-season WAR at a standing percentile (linear between quintile centres, flat beyond). */
export function deadlineNet(m: DeadlineModel, p: number): number {
  const c = m.curve;
  if (p <= c[0][0]) return c[0][1];
  for (let i = 1; i < c.length; i++) {
    if (p <= c[i][0]) {
      const [x0, y0] = c[i - 1];
      const [x1, y1] = c[i];
      return y0 + ((y1 - y0) * (p - x0)) / (x1 - x0);
    }
  }
  return c[c.length - 1][1];
}

/** Standing percentile (0 = best) of each team by points%. Ties share the better rank. */
export function percentiles(rows: { t: string; pts: number; gp: number }[]): Map<string, number> {
  const pp = rows.map((t) => ({ t: t.t, v: t.pts / Math.max(1, 2 * t.gp) }));
  return new Map(pp.map((x) => [x.t, (pp.filter((y) => y.v > x.v).length + 0.5) / pp.length]));
}

export interface StandingKey {
  playoffs: boolean;
  pts: number;
}

export interface DraftValueModel {
  /** value[slot] = expected WAR a pick at that overall slot gives its drafting franchise over ten seasons. */
  value: number[];
  /** Share of that WAR arriving in each season after the draft (index 0 = the season that starts that fall). */
  timing: number[];
}

const valueMemo = new WeakMap<DataIndex, DraftValueModel>();
export const DRAFT_WINDOW = 10;
const LAST_COMPLETE_DRAFT_OFFSET = DRAFT_WINDOW + 1;

/**
 * Expected value of each first-round slot, measured from every draft with a complete ten-year window:
 * WAR produced for the drafting franchise in the ten seasons after the draft. The raw average is noisy
 * (one Giroux at #22), so it is smoothed with a window that widens down the board and forced to never
 * increase with the slot number.
 */
export function draftValueModel(ix: DataIndex): DraftValueModel {
  const cached = valueMemo.get(ix);
  if (cached) return cached;
  const lastYear = Math.floor(ix.seasonIds.at(-1)! / 10000) - LAST_COMPLETE_DRAFT_OFFSET + 1;
  const sums = new Map<number, { n: number; w: number }>();
  const timing = new Array(DRAFT_WINDOW).fill(0);
  for (const d of ix.ds.draft) {
    const [year, , overall, team, pid] = d;
    if (year > lastYear) continue;
    const fr = franchiseOf(ix, team);
    let total = 0;
    for (const i of pid ? (ix.rowsByPlayer.get(pid) ?? []) : []) {
      const r = ix.ds.rows[i];
      const off = Math.floor(r[1] / 10000) - year;
      if (off < 0 || off >= DRAFT_WINDOW || franchiseOf(ix, r[2]) !== fr) continue;
      total += r[4] / 100;
      timing[off] += r[4] / 100;
    }
    const e = sums.get(overall) ?? { n: 0, w: 0 };
    e.n++;
    e.w += total;
    sums.set(overall, e);
  }
  const maxSlot = Math.max(...sums.keys());
  const raw = Array.from({ length: maxSlot + 1 }, (_, k) => (sums.get(k)?.n ? sums.get(k)!.w / sums.get(k)!.n : 0));
  const value = raw.map((_, k) => {
    if (k === 0) return 0;
    const h = Math.floor(k / 5); // ±0 at the top of the board, wider further down
    let w = 0;
    let n = 0;
    for (let j = Math.max(1, k - h); j <= Math.min(maxSlot, k + h); j++) {
      w += raw[j];
      n++;
    }
    return n ? w / n : 0;
  });
  for (let k = 2; k < value.length; k++) value[k] = Math.min(value[k], value[k - 1]);
  const tsum = timing.reduce((a, b) => a + b, 0) || 1;
  const model = { value, timing: timing.map((t) => t / tsum) };
  valueMemo.set(ix, model);
  return model;
}

export interface SlotShift {
  year: number;
  holder: string; // team that held (and used) the pick
  from: number;
  to: number;
}

/**
 * Re-order the first round of the draft that follows `season` from alternate standings.
 *
 * Draft order is approximated as non-playoff teams first, then by points. Lottery luck is preserved
 * positionally: owners are sorted by actual and by alternate standing, and the team in position i of
 * the alternate sort gets the slot that position i actually received. Traded picks move with their owner's
 * standing, but the value goes to the team that held the pick.
 */
export function redraftFirstRound(ix: DataIndex, season: number, actual: Map<string, StandingKey>, alt: Map<string, StandingKey>): SlotShift[] {
  const year = Math.floor(season / 10000) + 1;
  const picks = ix.ds.draft.filter((d) => d[0] === year && d[1] === 1);
  if (!picks.length) return [];
  const owners = picks.map((d) => {
    const hist = d[7] ? d[7].split("-")[0] : d[3];
    const fr = franchiseOf(ix, hist) >= 0 ? franchiseOf(ix, hist) : franchiseOf(ix, d[3]);
    return { slot: d[2], holder: d[3], owner: abbrFor(ix, fr, season) };
  });
  if (owners.some((o) => !o.owner || !actual.has(o.owner))) return [];
  // An owner with two first-rounders in one draft makes the mapping ambiguous: leave that draft alone.
  if (new Set(owners.map((o) => o.owner)).size !== owners.length) return [];

  const cmp = (m: Map<string, StandingKey>) => (a: (typeof owners)[number], b: (typeof owners)[number]) => {
    const x = m.get(a.owner!)!;
    const y = m.get(b.owner!)!;
    return Number(x.playoffs) - Number(y.playoffs) || x.pts - y.pts || a.slot - b.slot;
  };
  const byActual = [...owners].sort(cmp(actual));
  const ascending = owners.map((o) => o.slot).sort((a, b) => a - b);
  // Lottery winners and forfeited picks sit far from where the standings alone would put them. That luck
  // (or penalty) belongs to the team, so it keeps its slot as long as it stays on the same side of the
  // playoff line. Everyone else is re-ordered around those anchors.
  const anchored = new Set(
    byActual
      .filter((o, i) => Math.abs(o.slot - ascending[i]) >= ANCHOR_GAP && actual.get(o.owner!)!.playoffs === alt.get(o.owner!)!.playoffs)
      .map((o) => o.owner),
  );
  const freeSlots = byActual.filter((o) => !anchored.has(o.owner)).map((o) => o.slot);
  return [...owners]
    .filter((o) => !anchored.has(o.owner))
    .sort(cmp(alt))
    .map((o, i) => ({ year, holder: o.holder, from: o.slot, to: freeSlots[i] }))
    .filter((x) => x.from !== x.to);
}

/** A pick this many slots from its standings position is treated as lottery luck or a penalty. */
export const ANCHOR_GAP = 3;
