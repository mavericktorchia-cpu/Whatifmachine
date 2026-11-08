import { useMemo, useState } from "react";
import { INJURIES } from "../data/injuries";
import { careerGp, normName, resolvePlayer, type DataIndex } from "../engine/dataIndex";
import { DEFAULT_AVAILABILITY, projectHealthy } from "../engine/injuries";
import type { Change } from "../engine/scenario";
import { fmtSeason } from "./format";

interface Props {
  ix: DataIndex;
  changes: Change[];
  careerWar: Map<number, number>;
  onAdd: (c: Change) => void;
  onRemove: (i: number) => void;
}

const span = (from: number, to: number) => (from === to ? fmtSeason(from) : `${fmtSeason(from)} – ${fmtSeason(to)}`);

export function InjuryPanel({ ix, changes, careerWar, onAdd, onRemove }: Props) {
  const presets = useMemo(
    () =>
      INJURIES.map((p) => {
        const pid = resolvePlayer(ix, p.player, p.team ? [p.team] : [], p.from);
        const proj = pid ? projectHealthy(ix, { pid, from: p.from, to: p.to, team: p.team }) : null;
        const actual = proj?.seasons.reduce((a, s) => a + s.actualWar, 0) ?? 0;
        const healthy = proj?.seasons.reduce((a, s) => a + s.war, 0) ?? 0;
        const actualGp = proj?.seasons.reduce((a, s) => a + s.actualGp, 0) ?? 0;
        const healthyGp = proj?.seasons.reduce((a, s) => a + s.gp, 0) ?? 0;
        return { p, pid, proj, actual, healthy, actualGp, healthyGp };
      }),
    [ix],
  );

  return (
    <div className="panel">
      <p className="muted small">
        A healthy player keeps producing at his pre-injury rate, adjusted by a league aging curve measured from the data. He never does worse than he really did. The extra games
        push his team's depth players out of the lineup.
      </p>
      {presets.map(({ p, pid, actual, healthy, actualGp, healthyGp }) => {
        if (!pid) return null;
        const idx = changes.findIndex((c) => c.kind === "injury" && c.presetId === p.id);
        return (
          <article key={p.id} className={`card trade ${idx >= 0 ? "active" : ""}`}>
            <header>
              <h3>{p.title}</h3>
              <span className="muted small">{span(p.from, p.to)}</span>
            </header>
            <p className="blurb">{p.blurb}</p>
            <div className="health-compare">
              <div>
                <span className="muted small">Real</span>
                <strong>{actual.toFixed(1)} WAR</strong>
                <span className="muted small">{actualGp} GP</span>
              </div>
              <div className="arrow">→</div>
              <div>
                <span className="muted small">Healthy</span>
                <strong className="up">{healthy.toFixed(1)} WAR</strong>
                <span className="muted small">{healthyGp} GP</span>
              </div>
            </div>
            <div className="row-between">
              <span className="muted small">{p.team ? `Stays with ${ix.ds.teams[p.team]?.name ?? p.team}` : "Plays where he really played"}</span>
              {idx >= 0 ? (
                <button className="secondary" onClick={() => onRemove(idx)}>
                  ✓ Healthy — restore
                </button>
              ) : (
                <button className="primary" onClick={() => onAdd({ kind: "injury", pid, from: p.from, to: p.to, team: p.team, presetId: p.id })}>
                  ✚ Keep him healthy
                </button>
              )}
            </div>
          </article>
        );
      })}
      <CustomInjury ix={ix} careerWar={careerWar} onAdd={onAdd} />
    </div>
  );
}

function CustomInjury({ ix, careerWar, onAdd }: { ix: DataIndex; careerWar: Map<number, number>; onAdd: (c: Change) => void }) {
  const [q, setQ] = useState("");
  const [pid, setPid] = useState<number | null>(null);
  const [from, setFrom] = useState<number | null>(null);
  const [to, setTo] = useState<number | null>(null);
  const [avail, setAvail] = useState(Math.round(DEFAULT_AVAILABILITY * 100));
  const [stay, setStay] = useState(true);

  const matches = useMemo(() => {
    const n = normName(q);
    if (n.length < 3 || pid) return [];
    const out: number[] = [];
    for (const [name, ids] of ix.playersByName) if (name.includes(n)) out.push(...ids);
    return out.sort((a, b) => (careerWar.get(b) ?? 0) - (careerWar.get(a) ?? 0)).slice(0, 10);
  }, [q, ix, careerWar, pid]);

  const born = pid ? ix.ds.players[pid]?.b : undefined;
  const rows = pid ? (ix.rowsByPlayer.get(pid) ?? []).map((i) => ix.ds.rows[i]) : [];
  const first = rows[0]?.[1];
  const options = pid && first ? ix.seasonIds.filter((s) => s >= first && (!born || Math.floor(s / 10000) - born <= 40)) : [];
  const teamAt = (s: number | null) => (s ? (rows.filter((r) => r[1] <= s).at(-1)?.[2] ?? null) : null);
  const stayTeam = teamAt(from);
  const proj = pid && from && to ? projectHealthy(ix, { pid, from, to, availability: avail / 100, team: stay && stayTeam ? stayTeam : undefined }) : null;

  return (
    <div className="card form">
      <h3>Heal anyone</h3>
      <label className="block">
        Player
        <input
          id="injury-player"
          className="search"
          placeholder="e.g. Tim Kerr"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPid(null);
          }}
        />
      </label>
      {matches.length > 0 && (
        <ul className="suggest">
          {matches.map((p) => (
            <li key={p}>
              <button
                onClick={() => {
                  setPid(p);
                  setQ(ix.ds.players[p].n);
                  const rs = (ix.rowsByPlayer.get(p) ?? []).map((i) => ix.ds.rows[i]);
                  // Default window: the first season he missed a big chunk of games, to the season he turned 35.
                  const sched = (s: number) => Math.max(...(ix.standings.get(s) ?? []).map((t) => t.gp), 1);
                  const totals = new Map<number, number>();
                  for (const r of rs) totals.set(r[1], (totals.get(r[1]) ?? 0) + r[3]);
                  const hurt = [...totals.entries()].find(([s, gp], k) => k > 0 && gp < 0.6 * sched(s))?.[0] ?? rs.at(-1)![1];
                  const b = ix.ds.players[p].b;
                  const end = b ? Math.min(ix.seasonIds.at(-1)!, (b + 35) * 10000 + b + 36) : hurt;
                  setFrom(hurt);
                  setTo(Math.max(hurt, ix.seasonIds.filter((s) => s <= end).at(-1) ?? hurt));
                }}
              >
                <span>
                  {ix.ds.players[p].n} <span className="muted small">{ix.ds.players[p].pos}</span>
                </span>
                <span className="muted small">
                  {careerGp(ix, p)} GP · {(careerWar.get(p) ?? 0).toFixed(1)} WAR
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {pid && (
        <>
          <div className="grid2">
            <label className="block">
              Healthy from
              <select id="injury-from" value={from ?? ""} onChange={(e) => setFrom(Number(e.target.value))}>
                {options.map((s) => (
                  <option key={s} value={s}>
                    {fmtSeason(s)}
                    {born ? ` (age ${Math.floor(s / 10000) - born})` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              Through
              <select id="injury-to" value={to ?? ""} onChange={(e) => setTo(Number(e.target.value))}>
                {options
                  .filter((s) => !from || s >= from)
                  .map((s) => (
                    <option key={s} value={s}>
                      {fmtSeason(s)}
                      {born ? ` (age ${Math.floor(s / 10000) - born})` : ""}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <label className="block">
            Games played when healthy: {avail}%
            <input id="injury-avail" type="range" min={70} max={100} value={avail} onChange={(e) => setAvail(Number(e.target.value))} />
          </label>
          {stayTeam && (
            <label className="resp">
              <input id="injury-stay" type="checkbox" checked={stay} onChange={(e) => setStay(e.target.checked)} />
              <span className="small">Stays with the {ix.ds.teams[stayTeam]?.name} for the whole window</span>
            </label>
          )}
          {proj && (
            <p className="small">
              Baseline {(proj.baselineRate * 82).toFixed(1)} WAR per 82 games at age {proj.baselineAge.toFixed(0)} →{" "}
              <strong className="up">+{proj.extras.reduce((a, e) => a + e.war, 0).toFixed(1)} WAR</strong> over {proj.extras.length} season{proj.extras.length === 1 ? "" : "s"}.
            </p>
          )}
          <button
            className="primary"
            disabled={!from || !to || !proj}
            onClick={() => from && to && onAdd({ kind: "injury", pid, from, to, availability: avail / 100, team: stay && stayTeam ? stayTeam : undefined })}
          >
            Add to timeline
          </button>
        </>
      )}
    </div>
  );
}
