import { useMemo, useState } from "react";
import { TRADES } from "../data/trades";
import { seasonForDate } from "../data/league";
import type { DataIndex } from "../engine/dataIndex";
import { resolveTrade, type Change, type Tenure } from "../engine/scenario";
import { teamName } from "./format";
import { TenureToggle } from "./ScenarioList";

interface Props {
  ix: DataIndex;
  changes: Change[];
  careerWar: Map<number, number>;
  onAdd: (c: Change) => void;
  onRemove: (i: number) => void;
}

/** WAR each side actually banked from the trade: seasons the player spent with the receiving club. */
function bankedWar(ix: DataIndex, pid: number | null, team: string, fromSeason: number): number {
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

export function TradesPanel({ ix, changes, onAdd, onRemove }: Props) {
  const [tenure, setTenure] = useState<Tenure>("mirror");
  const [q, setQ] = useState("");
  const resolved = useMemo(
    () =>
      TRADES.map((t) => {
        const season = seasonForDate(t.date);
        const sides = resolveTrade(ix, t).map((s) => ({
          ...s,
          assets: s.assets.map((a) => ({ ...a, war: bankedWar(ix, a.pid, s.team, season) })),
        }));
        return { t, sides };
      }),
    [ix],
  );
  const filtered = resolved.filter(({ t, sides }) => {
    if (!q) return true;
    const hay = [t.title, t.blurb, ...sides.flatMap((s) => [s.team, teamName(ix, s.team), ...s.assets.map((a) => a.name)])].join(" ").toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  return (
    <div className="panel">
      <div className="panel-controls">
        <input className="search" placeholder="Search trades, teams or players…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="row-between small">
          <span className="muted">When undone, players stay:</span>
          <TenureToggle value={tenure} onChange={setTenure} />
        </div>
      </div>
      {filtered.map(({ t, sides }) => {
        const idx = changes.findIndex((c) => c.kind === "trade" && c.tradeId === t.id);
        const totals = sides.map((s) => s.assets.reduce((x, a) => x + a.war, 0));
        return (
          <article key={t.id} className={`card trade ${idx >= 0 ? "active" : ""}`}>
            <header>
              <h3>{t.title}</h3>
              <time className="muted small">{new Date(t.date + "T12:00:00").toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</time>
            </header>
            <p className="blurb">{t.blurb}</p>
            <div className="sides">
              {sides.map((s, k) => (
                <div key={s.team} className="side">
                  <div className="side-head">
                    <span className="badge">{s.team}</span> got
                    <span className={`war ${totals[k] >= totals[1 - k] ? "win" : ""}`}>{totals[k].toFixed(1)} WAR</span>
                  </div>
                  <ul>
                    {s.assets.map((a) => (
                      <li key={a.name}>
                        <span>
                          {a.name}
                          {a.via && <em className="muted"> · {a.via}</em>}
                        </span>
                        <span className="num muted">{a.war.toFixed(1)}</span>
                      </li>
                    ))}
                    {t.sides[k].extras?.map((e) => (
                      <li key={e} className="muted small">
                        + {e}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="row-between">
              <span className="muted small">WAR banked with the acquiring club</span>
              {idx >= 0 ? (
                <button className="secondary" onClick={() => onRemove(idx)}>
                  ✓ Undone — restore
                </button>
              ) : (
                <button className="primary" onClick={() => onAdd({ kind: "trade", tradeId: t.id, tenure })}>
                  ↺ Undo this trade
                </button>
              )}
            </div>
          </article>
        );
      })}
      {!filtered.length && <p className="muted">No trades match “{q}”.</p>}
      <p className="muted small">The NHL publishes no machine-readable trade ledger, so landmark trades are curated. Use “Custom move” for any other transaction.</p>
    </div>
  );
}
