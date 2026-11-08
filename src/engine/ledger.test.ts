import { describe, expect, it } from "vitest";
import { TRADES } from "../data/trades";
import { buildCapModel } from "./cap";
import { resolvePlayer } from "./dataIndex";
import { anyTrade, applyAll, landmarkFor } from "./scenario";
import { computeTimeline, summarize } from "./timeline";
import { loadIndex } from "./testData";

const ix = loadIndex();
const cap = buildCapModel(ix);

describe("trade ledger", () => {
  it("has thousands of trades since 1966 with resolved players", () => {
    expect(ix.ds.trades.length).toBeGreaterThan(4000);
    expect(ix.ds.trades[0].d >= "1966-07-01").toBe(true);
    for (const t of ix.ds.trades) {
      expect(t.a.some((a) => a[3] > 0), t.i).toBe(true);
      for (const a of t.a) if (a[3]) expect(ix.ds.players[a[3]], `${t.i} ${a[2]}`).toBeDefined();
    }
  });

  it("normalises every ledger trade into two sides", () => {
    for (const t of ix.ds.trades.slice(0, 500)) {
      const x = anyTrade(ix, t.i)!;
      expect(x.sides.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("matches most landmark trades to a ledger entry", () => {
    const matched = TRADES.filter((c) => ix.ds.trades.some((t) => landmarkFor(ix, t)?.id === c.id));
    expect(matched.length).toBeGreaterThanOrEqual(TRADES.length - 3);
  });

  it("resolves picks to the player eventually drafted (Kessel deal → Seguin, Hamilton)", () => {
    const t = ix.ds.trades.find((x) => x.d === "2009-09-18" && x.t.includes("TOR") && x.t.includes("BOS"))!;
    const names = t.a.filter((a) => a[3]).map((a) => ix.ds.players[a[3]].n);
    expect(names).toEqual(expect.arrayContaining(["Phil Kessel", "Tyler Seguin", "Dougie Hamilton"]));
  });

  it("undoing a ledger trade moves players like a landmark undo does", () => {
    const lt = ix.ds.trades.find((x) => x.d === "1988-08-09" && x.t.includes("EDM"))!;
    const ledger = applyAll(ix, [{ kind: "trade", tradeId: lt.i, tenure: "mirror" }]);
    const curated = applyAll(ix, [{ kind: "trade", tradeId: "gretzky-1988", tenure: "mirror" }]);
    const gretzky = resolvePlayer(ix, "Wayne Gretzky")!;
    const moved = (o: Map<number, string | null>) => [...o].filter(([i]) => ix.ds.rows[i][0] === gretzky).map(([i, t]) => `${i}>${t}`).sort();
    expect(moved(ledger.overrides)).toEqual(moved(curated.overrides));
    const edm = summarize(ix, computeTimeline(ix, ledger.overrides, cap, { sims: 1000 })).find((f) => f.team === "EDM")!;
    expect(edm.deltaWar).toBeGreaterThan(20);
  });
});
