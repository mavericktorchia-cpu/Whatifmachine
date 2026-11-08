import { describe, expect, it } from "vitest";
import { TRADES } from "../data/trades";
import { playoffFormat, seasonForDate } from "../data/league";
import { abbrFor, careerWar, franchiseOf, resolvePlayer } from "./dataIndex";
import { buildCapModel } from "./cap";
import { buildField, gameWinProb, seriesWinProb, type PlayoffTeam } from "./playoffs";
import { mulberry32 } from "./rng";
import { applyAll, resolveTrade } from "./scenario";
import { coupleChampion, computeTimeline, roster, summarize } from "./timeline";
import { computeSeasonWar } from "./war";
import { loadIndex } from "./testData";

const ix = loadIndex();
const cap = buildCapModel(ix);

describe("dataset", () => {
  it("covers 1966-67 through the latest completed season with a champion for each", () => {
    expect(ix.seasonIds[0]).toBe(19661967);
    expect(ix.seasonIds).not.toContain(20042005); // lockout
    for (const s of ix.ds.seasons) expect(s.champion, s.label).toBeTruthy();
    expect(ix.season.get(19881989)!.champion).toBe("CGY");
  });

  it("maps relocated franchises across eras", () => {
    const que = franchiseOf(ix, "QUE");
    expect(franchiseOf(ix, "COL")).toBe(que);
    expect(abbrFor(ix, que, 19921993)).toBe("QUE");
    expect(abbrFor(ix, que, 19961997)).toBe("COL");
    expect(franchiseOf(ix, "WIN")).toBe(franchiseOf(ix, "ARI"));
  });

  it("produces sensible WAR leaders", () => {
    const gretzky = resolvePlayer(ix, "Wayne Gretzky")!;
    expect(careerWar(ix, gretzky)).toBeGreaterThan(90);
    const career = new Map<number, number>();
    for (const r of ix.ds.rows) career.set(r[0], (career.get(r[0]) ?? 0) + r[4]);
    const top10 = [...career.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([p]) => ix.ds.players[p].n);
    expect(top10).toContain("Wayne Gretzky");
    expect(top10).toContain("Sidney Crosby");
  });

  it("team WAR tracks standings points", () => {
    const s = 20222023;
    const st = ix.standings.get(s)!;
    const tw = new Map<string, number>();
    for (const r of ix.ds.rows) if (r[1] === s) tw.set(r[2], (tw.get(r[2]) ?? 0) + r[4] / 100);
    const xs = st.map((t) => tw.get(t.t) ?? 0);
    const ys = st.map((t) => t.pts);
    const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    const mx = mean(xs), my = mean(ys);
    const cov = xs.reduce((s2, x, i) => s2 + (x - mx) * (ys[i] - my), 0);
    const r = cov / Math.sqrt(xs.reduce((s2, x) => s2 + (x - mx) ** 2, 0) * ys.reduce((s2, y) => s2 + (y - my) ** 2, 0));
    expect(r).toBeGreaterThan(0.8);
  });
});

describe("curated trades", () => {
  it.each(TRADES.map((t) => [t.id, t] as const))("%s resolves every asset to a player of the right teams", (_id, t) => {
    const season = seasonForDate(t.date);
    for (const side of resolveTrade(ix, t)) {
      for (const a of side.assets) {
        expect(a.pid, `${t.id}: ${a.name}`).not.toBeNull();
        const fr = franchiseOf(ix, side.team);
        const played = (ix.rowsByPlayer.get(a.pid!) ?? []).some((i) => ix.ds.rows[i][1] >= season && franchiseOf(ix, ix.ds.rows[i][2]) === fr);
        expect(played, `${t.id}: ${a.name} never played for ${side.team} after the trade`).toBe(true);
      }
    }
  });

  it("undoing the Gretzky trade sends his Kings seasons back to Edmonton", () => {
    const { overrides, applied } = applyAll(ix, [{ kind: "trade", tradeId: "gretzky-1988", tenure: "mirror" }]);
    expect(applied[0].warnings).toEqual([]);
    const gretzky = resolvePlayer(ix, "Wayne Gretzky")!;
    const moved = [...overrides].filter(([i]) => ix.ds.rows[i][0] === gretzky);
    expect(moved.length).toBeGreaterThanOrEqual(7); // 1988-89 .. 1995-96 (part)
    expect(moved.every(([, to]) => to === "EDM")).toBe(true);
    // Blues/Rangers years untouched in mirror mode
    const nyr = (ix.rowsByPlayer.get(gretzky) ?? []).find((i) => ix.ds.rows[i][2] === "NYR")!;
    expect(overrides.has(nyr)).toBe(false);

    const tl = computeTimeline(ix, overrides, cap, { sims: 1500 });
    const edm89 = tl.seasons.find((s) => s.season === 19881989)!.teams.find((t) => t.team === "EDM")!;
    expect(edm89.altPts).toBeGreaterThan(edm89.actualPts);
    expect(edm89.altCupOdds).toBeGreaterThan(edm89.baseCupOdds);
    const sum = summarize(ix, tl);
    const edm = sum.find((f) => f.team === "EDM")!;
    const lak = sum.find((f) => f.team === "LAK")!;
    expect(edm.deltaWar).toBeGreaterThan(0);
    expect(lak.deltaWar).toBeLessThan(0);
    expect(edm.deltaExpectedCups).toBeGreaterThan(0);
  });

  it("career tenure keeps a player with his original club for good", () => {
    const { overrides } = applyAll(ix, [{ kind: "trade", tradeId: "hall-larsson-2016", tenure: "career" }]);
    const hall = resolvePlayer(ix, "Taylor Hall", ["EDM", "NJD"], 20162017)!;
    const after = (ix.rowsByPlayer.get(hall) ?? []).filter((i) => ix.ds.rows[i][1] >= 20162017);
    expect(after.every((i) => overrides.get(i) === "EDM")).toBe(true);
  });

  it("picks follow the drafted player (Kessel trade returns Seguin to Toronto)", () => {
    const { overrides } = applyAll(ix, [{ kind: "trade", tradeId: "kessel-2009", tenure: "mirror" }]);
    const seguin = resolvePlayer(ix, "Tyler Seguin")!;
    const bosYears = (ix.rowsByPlayer.get(seguin) ?? []).filter((i) => ix.ds.rows[i][2] === "BOS");
    expect(bosYears.length).toBe(3);
    expect(bosYears.every((i) => overrides.get(i) === "TOR")).toBe(true);
  });

  it("stacked changes compose (undo Kessel, then undo Seguin-to-Dallas)", () => {
    const { overrides, applied } = applyAll(ix, [
      { kind: "trade", tradeId: "kessel-2009", tenure: "mirror" },
      { kind: "trade", tradeId: "seguin-2013", tenure: "mirror" },
    ]);
    // Seguin is in Toronto in the alternate timeline, so Boston no longer has him to trade.
    const seguinMoves = applied[1].moves.filter((m) => m.pid === resolvePlayer(ix, "Tyler Seguin"));
    expect(seguinMoves).toEqual([]);
    expect(overrides.size).toBeGreaterThan(0);
  });
});

describe("draft redo", () => {
  it("swaps the two players' tenures with their drafting teams", () => {
    const pick = ix.ds.draft.find((d) => d[0] === 2010 && d[2] === 1)!; // Taylor Hall, EDM
    const seguin = resolvePlayer(ix, "Tyler Seguin")!;
    const { overrides, applied } = applyAll(ix, [{ kind: "draft", year: 2010, overall: 1, altPid: seguin, tenure: "mirror" }]);
    expect(applied[0].warnings).toEqual([]);
    const segRows = (ix.rowsByPlayer.get(seguin) ?? []).filter((i) => ix.ds.rows[i][2] === "BOS");
    expect(segRows.every((i) => overrides.get(i) === "EDM")).toBe(true);
    const hallRows = (ix.rowsByPlayer.get(pick[4]) ?? []).filter((i) => ix.ds.rows[i][2] === "EDM");
    expect(hallRows.every((i) => overrides.get(i) === "BOS")).toBe(true);
  });

  it("rejects an alternate from a different draft", () => {
    const mcdavid = resolvePlayer(ix, "Connor McDavid")!;
    const { applied } = applyAll(ix, [{ kind: "draft", year: 2010, overall: 1, altPid: mcdavid, tenure: "mirror" }]);
    expect(applied[0].warnings.length).toBeGreaterThan(0);
  });
});

describe("custom move and roster", () => {
  it("moves a player for N seasons and shows him on the new roster", () => {
    const crosby = resolvePlayer(ix, "Sidney Crosby")!;
    const tor = franchiseOf(ix, "TOR");
    const { overrides } = applyAll(ix, [{ kind: "move", pid: crosby, season: 20052006, toFranchise: tor, years: 3 }]);
    expect(overrides.size).toBe(3);
    const r = roster(ix, overrides, "TOR", 20062007);
    expect(r.some((x) => x.status === "arrived" && ix.ds.rows[x.i][0] === crosby)).toBe(true);
    const p = roster(ix, overrides, "PIT", 20062007);
    expect(p.some((x) => x.status === "departed" && ix.ds.rows[x.i][0] === crosby)).toBe(true);
  });
});

describe("playoff model", () => {
  it("series math", () => {
    expect(seriesWinProb(0.5)).toBeCloseTo(0.5, 10);
    expect(seriesWinProb(0.6)).toBeCloseTo(0.71, 2);
    expect(gameWinProb(1, 0)).toBeCloseTo(0.7, 1);
  });

  it("builds a 16-team field in every format with the right qualifiers", () => {
    for (const sid of [19661967, 19701971, 19761977, 19801981, 19881989, 19981999, 20152016, 20202021, 20252026]) {
      const st = ix.standings.get(sid)!;
      const teams: PlayoffTeam[] = st.map((t) => ({ t: t.t, conf: t.conf, div: t.div, pts: t.pts, w: t.w, rating: (t.gf - t.ga) / t.gp }));
      const f = buildField(playoffFormat(sid), teams);
      expect(f.qualified.size, String(sid)).toBe(sid === 19661967 ? 4 : sid <= 19731974 ? 8 : sid <= 19781979 ? 12 : 16);
      const champ = f.run(mulberry32(7));
      expect(f.qualified.has(champ)).toBe(true);
    }
  });

  it("coupling keeps the real champion when odds are unchanged", () => {
    const odds = new Map([["A", 0.3], ["B", 0.7]]);
    for (let u = 0; u < 1; u += 0.1) expect(coupleChampion("A", odds, odds, u, 0.5)).toBe("A");
    const alt = new Map([["A", 0.0], ["B", 1]]);
    expect(coupleChampion("A", odds, alt, 0.01, 0.5)).toBe("B");
  });
});

describe("cap model", () => {
  it("uses known contracts and estimates the rest within CBA bounds", () => {
    const weber = resolvePlayer(ix, "Shea Weber")!;
    expect(cap.capHit(weber, 20172018)).toEqual({ aav: 7.857, estimated: false });
    expect(cap.capHit(weber, 19981999)).toBeNull();
    const mcd = resolvePlayer(ix, "Connor McDavid")!;
    const est = cap.capHit(mcd, 20222023)!;
    expect(est.estimated).toBe(true);
    expect(est.aav).toBeLessThanOrEqual(0.2 * 82.5 + 1e-9);
  });
});

describe("WAR model", () => {
  it("credits a better goalie and a more productive skater", () => {
    const teams = [{ t: "A", gp: 82, gf: 250, ga: 250 }, { t: "B", gp: 82, gf: 250, ga: 250 }];
    const res = computeSeasonWar(
      teams,
      [
        { pid: 1, team: "A", pos: "C", gp: 82, g: 40, a: 50, pm: 10, toi: null },
        { pid: 2, team: "B", pos: "C", gp: 82, g: 10, a: 15, pm: -10, toi: null },
      ],
      [
        { pid: 3, team: "A", gp: 60, sa: 1800, ga: 150, toi: 0 },
        { pid: 4, team: "B", gp: 60, sa: 1800, ga: 190, toi: 0 },
      ],
    );
    const w = new Map(res.map((r) => [r.pid, r.war]));
    expect(w.get(1)!).toBeGreaterThan(w.get(2)!);
    expect(w.get(3)!).toBeGreaterThan(w.get(4)!);
  });
});
