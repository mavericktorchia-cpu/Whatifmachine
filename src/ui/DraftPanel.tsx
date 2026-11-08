import { useMemo, useState } from "react";
import type { DataIndex } from "../engine/dataIndex";
import type { Change, Tenure } from "../engine/scenario";
import type { DraftRow } from "../engine/types";
import { TenureToggle } from "./ScenarioList";

interface Props {
  ix: DataIndex;
  careerWar: Map<number, number>;
  onAdd: (c: Change) => void;
}

export function DraftPanel({ ix, careerWar, onAdd }: Props) {
  const years = useMemo(() => [...new Set(ix.ds.draft.map((d) => d[0]))].filter((y) => y <= ix.seasonIds.at(-1)! / 10000).reverse(), [ix]);
  const [year, setYear] = useState(2003);
  const [rounds, setRounds] = useState(2);
  const [sel, setSel] = useState<DraftRow | null>(null);
  const [tenure, setTenure] = useState<Tenure>("mirror");

  const picks = useMemo(() => ix.ds.draft.filter((d) => d[0] === year), [ix, year]);
  const w = (d: DraftRow) => (d[4] ? (careerWar.get(d[4]) ?? 0) : 0);
  // Hindsight rank: where each player would go if the draft were redone by career WAR.
  const hindsight = useMemo(() => {
    const order = [...picks].filter((d) => d[4]).sort((a, b) => w(b) - w(a));
    return new Map(order.map((d, i) => [d[2], i + 1]));
  }, [picks, careerWar]);
  const shown = picks.filter((d) => d[1] <= rounds);
  const alternatives = sel ? picks.filter((d) => d[4] && d[2] !== sel[2]).sort((a, b) => w(b) - w(a)).slice(0, 25) : [];

  return (
    <div className="panel">
      <div className="panel-controls">
        <div className="row-between">
          <label>
            Draft{" "}
            <select
              value={year}
              onChange={(e) => {
                setYear(Number(e.target.value));
                setSel(null);
              }}
            >
              {years.map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
          </label>
          <label>
            Show rounds{" "}
            <select value={rounds} onChange={(e) => setRounds(Number(e.target.value))}>
              {[1, 2, 3, 5, 12].map((r) => (
                <option key={r} value={r}>
                  {r === 12 ? "all" : `1–${r}`}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="muted small">Pick a selection to replace, then choose who the team takes instead. The two players swap their tenures with their drafting teams.</p>
      </div>

      {sel && (
        <div className="card redo">
          <div className="row-between">
            <h3>
              {year} #{sel[2]} · <span className="badge">{sel[3]}</span> took {sel[5]}
            </h3>
            <button className="x" onClick={() => setSel(null)} aria-label="Close">
              ×
            </button>
          </div>
          <div className="row-between small">
            <span className="muted">Players stay:</span>
            <TenureToggle value={tenure} onChange={setTenure} />
          </div>
          <table className="tbl compact">
            <thead>
              <tr>
                <th>Instead take…</th>
                <th>Went</th>
                <th className="num">WAR</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {alternatives.map((d) => (
                <tr key={d[2]}>
                  <td>
                    {d[5]} <span className="muted small">{d[6]}</span>
                  </td>
                  <td className="muted small">
                    #{d[2]} {d[3]}
                  </td>
                  <td className="num">{w(d).toFixed(1)}</td>
                  <td>
                    <button
                      className="primary sm"
                      onClick={() => {
                        onAdd({ kind: "draft", year, overall: sel[2], altPid: d[4], tenure });
                        setSel(null);
                      }}
                    >
                      Draft
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <table className="tbl draft">
        <thead>
          <tr>
            <th className="num">#</th>
            <th>Team</th>
            <th>Player</th>
            <th className="num" title="Career sWAR">WAR</th>
            <th className="num" title="Where he'd go in a redraft by career WAR">Redo</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((d) => {
            const h = hindsight.get(d[2]);
            const steal = h !== undefined && h < d[2] - 15;
            const bust = d[1] === 1 && (h === undefined || h > d[2] + 25);
            return (
              <tr key={d[2]} className={`clickable ${sel?.[2] === d[2] ? "sel" : ""}`} onClick={() => setSel(d)}>
                <td className="num muted">{d[2]}</td>
                <td>
                  <span className="badge">{d[3]}</span>
                </td>
                <td>
                  {d[5]} <span className="muted small">{d[6]}</span>
                  {d[7] && d[7].includes("-") && <span className="muted small" title={`Pick history: ${d[7]}`}> ⇄</span>}
                </td>
                <td className="num">{d[4] ? w(d).toFixed(1) : <span className="muted">—</span>}</td>
                <td className={`num ${steal ? "up" : bust ? "down" : "muted"}`}>{h ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
