import { useMemo, useState } from "react";
import { careerGp, normName, type DataIndex } from "../engine/dataIndex";
import type { Change } from "../engine/scenario";
import { fmtSeason } from "./format";

interface Props {
  ix: DataIndex;
  careerWar: Map<number, number>;
  onAdd: (c: Change) => void;
}

export function CustomPanel({ ix, careerWar, onAdd }: Props) {
  const [q, setQ] = useState("");
  const [pid, setPid] = useState<number | null>(null);
  const [season, setSeason] = useState<number | null>(null);
  const [franchise, setFranchise] = useState<number | null>(null);
  const [years, setYears] = useState<number | "career">(3);

  const matches = useMemo(() => {
    const n = normName(q);
    if (n.length < 3) return [];
    const out: number[] = [];
    for (const [name, ids] of ix.playersByName) if (name.includes(n)) out.push(...ids);
    return out.sort((a, b) => (careerWar.get(b) ?? 0) - (careerWar.get(a) ?? 0)).slice(0, 12);
  }, [q, ix, careerWar]);

  const seasons = pid ? [...new Set((ix.rowsByPlayer.get(pid) ?? []).map((i) => ix.ds.rows[i][1]))] : [];
  const teams = season ? [...(ix.standings.get(season) ?? [])].sort((a, b) => ix.ds.teams[a.t].name.localeCompare(ix.ds.teams[b.t].name)) : [];

  const pick = (p: number) => {
    setPid(p);
    setQ(ix.ds.players[p].n);
    const first = ix.ds.rows[(ix.rowsByPlayer.get(p) ?? [])[0]]?.[1] ?? null;
    setSeason(first);
    setFranchise(null);
  };

  return (
    <div className="panel">
      <div className="card form">
        <h3>Send any player anywhere</h3>
        <p className="muted small">Pick a player, the season the move happens and the destination. His WAR for those seasons leaves his real team(s) and joins the new one.</p>
        <label className="block">
          Player
          <input
            className="search"
            placeholder="e.g. Martin St. Louis"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPid(null);
            }}
          />
        </label>
        {!pid && matches.length > 0 && (
          <ul className="suggest">
            {matches.map((p) => {
              const rows = (ix.rowsByPlayer.get(p) ?? []).map((i) => ix.ds.rows[i]);
              return (
                <li key={p}>
                  <button onClick={() => pick(p)}>
                    <span>
                      {ix.ds.players[p].n} <span className="muted small">{ix.ds.players[p].pos}</span>
                    </span>
                    <span className="muted small">
                      {fmtSeason(rows[0][1]).slice(0, 4)}–{fmtSeason(rows.at(-1)![1]).slice(-2)} · {careerGp(ix, p)} GP · {(careerWar.get(p) ?? 0).toFixed(1)} WAR
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {pid && (
          <>
            <div className="grid2">
              <label className="block">
                Starting season
                <select value={season ?? ""} onChange={(e) => setSeason(Number(e.target.value))}>
                  {seasons.map((s) => {
                    const ts = (ix.rowsByPlayer.get(pid) ?? []).filter((i) => ix.ds.rows[i][1] === s).map((i) => ix.ds.rows[i][2]);
                    return (
                      <option key={s} value={s}>
                        {fmtSeason(s)} ({ts.join("/")})
                      </option>
                    );
                  })}
                </select>
              </label>
              <label className="block">
                For
                <select value={String(years)} onChange={(e) => setYears(e.target.value === "career" ? "career" : Number(e.target.value))}>
                  {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
                    <option key={n} value={n}>
                      {n} season{n > 1 ? "s" : ""}
                    </option>
                  ))}
                  <option value="career">rest of career</option>
                </select>
              </label>
            </div>
            <label className="block">
              Destination
              <select value={franchise ?? ""} onChange={(e) => setFranchise(Number(e.target.value))}>
                <option value="" disabled>
                  Choose a team…
                </option>
                {teams.map((t) => (
                  <option key={t.t} value={ix.ds.teams[t.t].franchise}>
                    {ix.ds.teams[t.t].name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="primary"
              disabled={!season || franchise === null}
              onClick={() => {
                if (season && franchise !== null) onAdd({ kind: "move", pid, season, toFranchise: franchise, years });
              }}
            >
              Add move to timeline
            </button>
          </>
        )}
      </div>
    </div>
  );
}
