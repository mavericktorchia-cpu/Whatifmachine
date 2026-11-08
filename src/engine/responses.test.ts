import { describe, expect, it } from "vitest";
import { buildCapModel } from "./cap";
import { resolvePlayer } from "./dataIndex";
import { ALL_RESPONSES, NO_RESPONSES, deadlineModel, deadlineNet, depthRate, draftValueModel, redraftFirstRound, type StandingKey } from "./responses";
import { applyAll } from "./scenario";
import { computeTimeline, summarize } from "./timeline";
import { loadIndex } from "./testData";

const ix = loadIndex();
const cap = buildCapModel(ix);
const sims = 1500;

describe("draft value", () => {
  it("is measured from history and never rises down the board", () => {
    const { value, timing } = draftValueModel(ix);
    expect(value[1]).toBeGreaterThan(12);
    expect(value[1]).toBeGreaterThan(value[10]);
    expect(value[10]).toBeGreaterThan(value[30]);
    for (let k = 2; k < value.length; k++) expect(value[k]).toBeLessThanOrEqual(value[k - 1]);
    expect(timing.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    // Most of a pick's value arrives three to seven seasons later.
    expect(timing[4]).toBeGreaterThan(timing[0]);
  });

  it("re-orders the first round from alternate standings", () => {
    const season = 20152016; // 2016 draft
    const st = ix.standings.get(season)!;
    const actual = new Map<string, StandingKey>(st.map((t) => [t.t, { playoffs: false, pts: t.pts }]));
    const same = redraftFirstRound(ix, season, actual, actual);
    expect(same).toEqual([]);
    // Make the worst team excellent: it should lose its high pick.
    const worst = [...st].sort((a, b) => a.pts - b.pts)[0].t;
    const alt = new Map(actual);
    alt.set(worst, { playoffs: false, pts: 200 });
    const shifts = redraftFirstRound(ix, season, actual, alt);
    expect(shifts.length).toBeGreaterThan(0);
    const mine = shifts.find((s) => s.holder === worst);
    if (mine) expect(mine.to).toBeGreaterThan(mine.from);
  });

  it("keeps lottery luck with the lottery winner (Carolina, 2018 #2)", () => {
    const { overrides } = applyAll(ix, [{ kind: "trade", tradeId: "hall-larsson-2016", tenure: "mirror" }]);
    const tl = computeTimeline(ix, overrides, cap, { sims });
    expect(tl.notes.some((n) => n.team === "CAR" && n.text.startsWith("2018") && n.war < -5)).toBe(false);
  });

  it("doesn't snowball: draft effects stay a fraction of the direct change", () => {
    const { overrides } = applyAll(ix, [{ kind: "trade", tradeId: "iginla-1995", tenure: "mirror" }]);
    const tl = computeTimeline(ix, overrides, cap, { sims });
    let direct = 0;
    let draft = 0;
    for (const s of tl.seasons) for (const t of s.teams) {
      direct += Math.abs(t.components.direct);
      draft += Math.abs(t.components.draft);
    }
    expect(draft).toBeLessThan(direct);
  });
});

describe("depth displacement", () => {
  it("shrinks the gain from adding a player", () => {
    const { overrides } = applyAll(ix, [{ kind: "trade", tradeId: "gretzky-1988", tenure: "mirror" }]);
    const off = summarize(ix, computeTimeline(ix, overrides, cap, { sims, responses: NO_RESPONSES }));
    const on = summarize(ix, computeTimeline(ix, overrides, cap, { sims, responses: { ...NO_RESPONSES, depth: true } }));
    const edm = (x: typeof on) => x.find((f) => f.team === "EDM")!;
    expect(edm(on).components.depth).toBeLessThan(0);
    expect(edm(on).deltaWar).toBeLessThan(edm(off).deltaWar);
    expect(edm(on).deltaWar).toBeGreaterThan(0.6 * edm(off).deltaWar);
  });

  it("depth rates are clamped per game", () => {
    for (const g of ["F", "D", "G"]) {
      const r = depthRate(ix, "EDM", 19881989, g);
      expect(r).toBeGreaterThanOrEqual(-0.02);
      expect(r).toBeLessThanOrEqual(0.03);
    }
  });
});

describe("deadline behaviour", () => {
  it("bad teams sell more than good teams buy", () => {
    const m = deadlineModel(ix);
    expect(m.samples).toBeGreaterThan(1000);
    expect(m.curve[0][1]).toBeGreaterThan(0);
    expect(m.curve.at(-1)![1]).toBeLessThan(0);
    expect(Math.abs(m.curve.at(-1)![1])).toBeGreaterThan(m.curve[0][1]);
    expect(deadlineNet(m, 0)).toBe(m.curve[0][1]);
    expect(deadlineNet(m, 1)).toBe(m.curve.at(-1)![1]);
  });

  it("a team pushed down the standings sells", () => {
    const tor = ix.ds.teams.TOR.franchise;
    const crosby = resolvePlayer(ix, "Sidney Crosby")!;
    // Crosby to Toronto for three seasons: Pittsburgh drops and should pick up a selling adjustment.
    const { overrides } = applyAll(ix, [{ kind: "move", pid: crosby, season: 20052006, toFranchise: tor, years: 3 }]);
    const tl = computeTimeline(ix, overrides, cap, { sims, responses: { ...NO_RESPONSES, deadline: true } });
    const pit = tl.seasons.find((s) => s.season === 20062007)!.teams.find((t) => t.team === "PIT")!;
    expect(pit.components.deadline).toBeLessThanOrEqual(0);
  });
});

describe("responses off", () => {
  it("reproduces the plain WAR model", () => {
    const { overrides } = applyAll(ix, [{ kind: "trade", tradeId: "gretzky-1988", tenure: "mirror" }]);
    const tl = computeTimeline(ix, overrides, cap, { sims, responses: NO_RESPONSES });
    for (const s of tl.seasons) for (const t of s.teams) {
      expect(t.components.draft).toBe(0);
      expect(t.components.depth).toBe(0);
      expect(t.components.deadline).toBe(0);
    }
    expect(tl.notes).toEqual([]);
  });

  it("an empty scenario changes nothing even with every response on", () => {
    const tl = computeTimeline(ix, new Map(), cap, { sims, responses: ALL_RESPONSES });
    expect(tl.seasons.every((s) => !s.changed)).toBe(true);
    expect(summarize(ix, tl)).toEqual([]);
  });
});
