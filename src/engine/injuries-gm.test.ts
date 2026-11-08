import { describe, expect, it } from "vitest";
import { INJURIES } from "../data/injuries";
import { agingCurve } from "./aging";
import { buildCapModel } from "./cap";
import { franchiseOf, resolvePlayer } from "./dataIndex";
import { deadlineMultiplier, draftMultiplier, gmForSeason, gmModel } from "./gm";
import { projectHealthy } from "./injuries";
import { NO_RESPONSES } from "./responses";
import { applyAll } from "./scenario";
import { computeTimeline, summarize } from "./timeline";
import { loadIndex } from "./testData";

const ix = loadIndex();
const cap = buildCapModel(ix);
const sims = 1500;

describe("aging curve", () => {
  it("rises to a mid-20s peak and declines after 30", () => {
    const a = agingCurve(ix);
    expect(a.peakAge).toBeGreaterThanOrEqual(24);
    expect(a.peakAge).toBeLessThanOrEqual(28);
    expect(a.factor(a.peakAge)).toBe(1);
    expect(a.factor(20)).toBeLessThan(1);
    expect(a.factor(34)).toBeLessThan(a.factor(30));
    expect(a.factor(30)).toBeLessThan(1);
  });
});

describe("injury presets", () => {
  it.each(INJURIES.map((p) => [p.id, p] as const))("%s resolves and projects extra production", (_id, p) => {
    const pid = resolvePlayer(ix, p.player, p.team ? [p.team] : [], p.from);
    expect(pid, p.player).not.toBeNull();
    const proj = projectHealthy(ix, { pid: pid!, from: p.from, to: p.to, team: p.team });
    expect(proj).not.toBeNull();
    expect(proj!.extras.reduce((a, e) => a + e.war, 0)).toBeGreaterThan(1);
  });

  it("a healthy Orr stays a Bruin and lifts Boston's Cup odds", () => {
    const orr = resolvePlayer(ix, "Bobby Orr")!;
    const { overrides, extras, applied } = applyAll(ix, [{ kind: "injury", pid: orr, from: 19751976, to: 19831984, team: "BOS" }]);
    expect(applied[0].warnings).toEqual([]);
    // His real Chicago games move to Boston.
    const chi = (ix.rowsByPlayer.get(orr) ?? []).filter((i) => ix.ds.rows[i][2] === "CHI");
    expect(chi.length).toBeGreaterThan(0);
    expect(chi.every((i) => overrides.get(i) === "BOS")).toBe(true);
    expect(extras.every((e) => e.team === "BOS")).toBe(true);
    const sum = summarize(ix, computeTimeline(ix, overrides, cap, { sims, extras }));
    const bos = sum.find((f) => f.team === "BOS")!;
    expect(bos.deltaWar).toBeGreaterThan(15);
    expect(bos.deltaExpectedCups).toBeGreaterThan(0.1);
  });

  it("never projects a season below what really happened", () => {
    const lem = resolvePlayer(ix, "Mario Lemieux")!;
    const proj = projectHealthy(ix, { pid: lem, from: 19901991, to: 20052006, team: "PIT" })!;
    for (const s of proj.seasons) expect(s.war).toBeGreaterThanOrEqual(s.actualWar - 1e-9);
    // 1995-96: he won the Art Ross; the real season stands.
    const s96 = proj.seasons.find((s) => s.season === 19951996)!;
    expect(s96.war).toBeCloseTo(s96.actualWar, 6);
    // The lost 1994-95 season and the 1997-2000 retirement are filled in.
    expect(proj.extras.some((e) => e.season === 19941995)).toBe(true);
    expect(proj.extras.some((e) => e.season === 19981999)).toBe(true);
  });

  it("extra games displace depth players", () => {
    const orr = resolvePlayer(ix, "Bobby Orr")!;
    const { overrides, extras } = applyAll(ix, [{ kind: "injury", pid: orr, from: 19751976, to: 19781979, team: "BOS" }]);
    const off = computeTimeline(ix, overrides, cap, { sims, extras, responses: NO_RESPONSES });
    const on = computeTimeline(ix, overrides, cap, { sims, extras, responses: { ...NO_RESPONSES, depth: true } });
    const bos = (tl: typeof on) => tl.seasons.find((s) => s.season === 19771978)!.teams.find((t) => t.team === "BOS")!;
    expect(bos(on).components.depth).toBeLessThan(0);
    expect(bos(on).deltaWar).toBeLessThan(bos(off).deltaWar);
  });
});

describe("GM activity meter", () => {
  it("knows who ran each club", () => {
    expect(gmForSeason(ix, "NJD", 19992000)).toBe("Lou Lamoriello");
    expect(gmForSeason(ix, "EDM", 19871988)).toBe("Glen Sather");
    expect(gmForSeason(ix, "DET", 20072008)).toBe("Ken Holland");
  });

  it("scores every GM 1-99 with a league average of 50", () => {
    const scores = [...gmModel(ix).scores.values()];
    expect(scores.length).toBeGreaterThan(150);
    for (const s of scores) {
      expect(s.meter).toBeGreaterThanOrEqual(1);
      expect(s.meter).toBeLessThanOrEqual(99);
    }
    const mean = scores.reduce((a, s) => a + s.meter, 0) / scores.length;
    expect(mean).toBeGreaterThan(45);
    expect(mean).toBeLessThan(55);
  });

  it("maps the meter onto responses: 50 is the league norm, below 25 reverses", () => {
    expect(deadlineMultiplier(50)).toBe(1);
    expect(deadlineMultiplier(10)).toBeLessThan(0);
    expect(deadlineMultiplier(99)).toBe(2);
    expect(draftMultiplier(50)).toBe(1);
    expect(draftMultiplier(1)).toBe(0.4);
  });

  it("user overrides change a team's deadline response", () => {
    const crosby = resolvePlayer(ix, "Sidney Crosby")!;
    const { overrides } = applyAll(ix, [{ kind: "move", pid: crosby, season: 20052006, toFranchise: franchiseOf(ix, "TOR"), years: 4 }]);
    const resp = { ...NO_RESPONSES, deadline: true };
    const gm = gmForSeason(ix, "PIT", 20072008)!;
    const base = computeTimeline(ix, overrides, cap, { sims, responses: resp });
    const wild = computeTimeline(ix, overrides, cap, { sims, responses: resp, gmMeters: { [gm]: 1 } });
    const pit = (tl: typeof base) => tl.seasons.find((s) => s.season === 20072008)!.teams.find((t) => t.team === "PIT")!;
    if (pit(base).components.deadline !== 0) expect(Math.sign(pit(wild).components.deadline)).toBe(-Math.sign(pit(base).components.deadline));
    expect(pit(wild).gmMeter).toBe(1);
  });
});
