import { useMemo, useState } from "react";
import { seasonForDate } from "../data/league";
import { normName, type DataIndex } from "../engine/dataIndex";
import { anyTrade, landmarkFor, tradeTitle, type AnyTrade, type Change, type Tenure } from "../engine/scenario";
import { bankedWar, teamName } from "./format";
import { TenureToggle } from "./ScenarioList";

interface Props {
  ix: DataIndex;
  changes: Change[];
  careerWar: Map<number, number>;
  onAdd: (c: Change) => void;
  onRemove: (i: number) => void;
  tenure: Tenure;
  setTenure: (t: Tenure) => void;
}

interface Row {
  t: AnyTrade;
  undoId: string; // landmark id when this ledger trade is a landmark, else the ledger id
  year: number;
  franchises: Set<number>;
  sideWar: number[];
  assetWar: number[][];
  swing: number;
  hay: string;
  title: string;
}

type Sort = "impact" | "newest" | "oldest";
const PAGE = 25;

export function LedgerTrades({ ix, changes, careerWar, onAdd, onRemove, tenure, setTenure }: Props) {
  const [q, setQ] = useState("");
  const [fr, setFr] = useState<number | "">("");
  const [from, setFrom] = useState(1966);
  const [to, setTo] = useState(Number(ix.ds.trades.at(-1)?.d.slice(0, 4) ?? 2026));
  const [sort, setSort] = useState<Sort>("impact");
  const [shown, setShown] = useState(PAGE);

  const rows = useMemo<Row[]>(
    () =>
      ix.ds.trades.map((lt) => {
        const t = anyTrade(ix, lt.i)!;
        const season = seasonForDate(t.date);
        const assetWar = t.sides.map((s) => s.assets.map((a) => (a.pid ? bankedWar(ix, a.pid, s.team, season) : 0)));
        const sideWar = assetWar.map((xs) => xs.reduce((a, b) => a + b, 0));
        const lm = landmarkFor(ix, lt);
        const names = t.sides.flatMap((s) => [s.team, teamName(ix, s.team), ...s.assets.map((a) => a.name)]);
        return {
          t,
          undoId: lm?.id ?? lt.i,
          year: Number(t.date.slice(0, 4)),
          franchises: new Set(t.sides.map((s) => ix.ds.teams[s.team]?.franchise)),
          sideWar,
          assetWar,
          swing: Math.abs((sideWar[0] ?? 0) - (sideWar[1] ?? 0)),
          hay: normName(names.join(" ")),
          title: tradeTitle(ix, t, careerWar),
        };
      }),
    [ix, careerWar],
  );

  const franchises = useMemo(() => {
    const latest = new Map<number, string>();
    for (const s of ix.ds.seasons) for (const t of ix.standings.get(s.id) ?? []) latest.set(ix.ds.teams[t.t].franchise, ix.ds.teams[t.t].name);
    return [...latest.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [ix]);

  const filtered = useMemo(() => {
    const nq = normName(q);
    const out = rows.filter((r) => r.year >= from && r.year <= to && (fr === "" || r.franchises.has(fr)) && (!nq || r.hay.includes(nq)));
    if (sort === "impact") out.sort((a, b) => b.swing - a.swing);
    else if (sort === "newest") out.sort((a, b) => b.t.date.localeCompare(a.t.date));
    else out.sort((a, b) => a.t.date.localeCompare(b.t.date));
    return out;
  }, [rows, q, fr, from, to, sort]);

  const years = useMemo(() => [...new Set(rows.map((r) => r.year))].sort((a, b) => a - b), [rows]);
  const reset = () => setShown(PAGE);

  return (
    <div className="panel-inner">
      <div className="panel-controls">
        <input
          id="ledger-q"
          className="search"
          placeholder="Search a player or team…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            reset();
          }}
        />
        <div className="filters">
          <select
            id="ledger-team"
            aria-label="Team"
            value={fr}
            onChange={(e) => {
              setFr(e.target.value === "" ? "" : Number(e.target.value));
              reset();
            }}
          >
            <option value="">All teams</option>
            {franchises.map(([f, n]) => (
              <option key={f} value={f}>
                {n}
              </option>
            ))}
          </select>
          <select
            id="ledger-from"
            aria-label="From year"
            value={from}
            onChange={(e) => {
              setFrom(Number(e.target.value));
              reset();
            }}
          >
            {years.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
          <span className="muted">to</span>
          <select
            id="ledger-to"
            aria-label="To year"
            value={to}
            onChange={(e) => {
              setTo(Number(e.target.value));
              reset();
            }}
          >
            {years.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
          <select id="ledger-sort" aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="impact">Most lopsided</option>
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
          </select>
        </div>
        <div className="row-between small">
          <span className="muted">
            {filtered.length.toLocaleString()} trade{filtered.length === 1 ? "" : "s"} · players stay:
          </span>
          <TenureToggle value={tenure} onChange={setTenure} />
        </div>
      </div>

      {filtered.slice(0, shown).map((r) => {
        const idx = changes.findIndex((c) => c.kind === "trade" && c.tradeId === r.undoId);
        const win = r.sideWar[0] >= (r.sideWar[1] ?? 0) ? 0 : 1;
        return (
          <article key={r.t.id} className={`card trade compact ${idx >= 0 ? "active" : ""}`}>
            <header>
              <h3>
                {r.t.landmark && <span className="pill good">Landmark</span>} {r.title}
              </h3>
              <time className="muted small">{r.t.date}</time>
            </header>
            <div className="sides">
              {r.t.sides.map((s, k) => (
                <div key={s.team} className="side">
                  <div className="side-head">
                    <span className="badge">{s.team}</span> got
                    <span className={`war ${k === win && r.swing > 0.5 ? "win" : ""}`}>{(r.sideWar[k] ?? 0).toFixed(1)} WAR</span>
                  </div>
                  <ul>
                    {s.assets.map((a, j) => (
                      <li key={j} className={a.pid ? "" : "muted small"}>
                        <span>
                          {a.pid ? a.name : a.via ?? a.name}
                          {a.pid && a.via && <em className="muted"> · {a.via.replace(/\s*\(.*$/, "")}</em>}
                        </span>
                        {a.pid ? <span className="num muted">{r.assetWar[k][j].toFixed(1)}</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="row-between">
              <span className="muted small">{r.t.sides.map((s) => teamName(ix, s.team)).join(" ↔ ")}</span>
              {idx >= 0 ? (
                <button className="secondary sm" onClick={() => onRemove(idx)}>
                  ✓ Undone — restore
                </button>
              ) : (
                <button className="primary sm" onClick={() => onAdd({ kind: "trade", tradeId: r.undoId, tenure })}>
                  ↺ Undo
                </button>
              )}
            </div>
          </article>
        );
      })}
      {filtered.length > shown && (
        <button className="ghost" onClick={() => setShown((n) => n + PAGE)}>
          Show {Math.min(PAGE, filtered.length - shown)} more
        </button>
      )}
      {!filtered.length && <p className="muted">No trades match.</p>}
      <p className="muted small">
        Trade ledger: nhltradetracker.com (to March 2025) and capwages.com (after). Picks are shown as the player eventually drafted with them; cash, future considerations and
        players who never played in the NHL carry no WAR.
      </p>
    </div>
  );
}
