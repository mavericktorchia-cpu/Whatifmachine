import { useEffect, useMemo, useState } from "react";
import type { CapModel } from "../engine/cap";
import type { DataIndex } from "../engine/dataIndex";
import { roster, type ResponseNote, type TeamSeasonResult, type WarComponents } from "../engine/timeline";
import type { Computed } from "./App";
import { FranchiseChart } from "./Chart";
import { GmMeters } from "./GmMeters";
import { fmtSeason, money, pct, playerName, signed, teamName, tone } from "./format";

interface Props {
  ix: DataIndex;
  cap: CapModel;
  computed: Computed;
  busy: boolean;
  hasChanges: boolean;
  gmMeters: Record<string, number>;
  onGmMeter: (name: string, meter: number | null) => void;
}

export function Results({ ix, cap, computed, busy, hasChanges, gmMeters, onGmMeter }: Props) {
  const { summary, timeline } = computed;
  const [fr, setFr] = useState<number | null>(null);
  const [season, setSeason] = useState<number | null>(null);

  // Default focus: the most affected franchise.
  useEffect(() => {
    if (!summary.length) {
      setFr(null);
      return;
    }
    if (fr === null || !summary.some((s) => s.franchise === fr)) setFr(summary[0].franchise);
  }, [summary, fr]);

  const rows = fr !== null ? (timeline.byFranchise.get(fr) ?? []) : [];
  const changedRows = rows.filter((r) => r.deltaWar !== 0 || r.madePlayoffs !== r.altMadePlayoffs || Math.abs(r.altCupOdds - r.baseCupOdds) >= 0.005);
  useEffect(() => {
    if (season !== null && rows.some((r) => r.season === season)) return;
    setSeason(changedRows[0]?.season ?? null);
  }, [fr, computed]);

  if (!hasChanges) return <RealHistory ix={ix} computed={computed} />;

  const flips = timeline.seasons.filter((s) => s.altChampion !== s.actualChampion);
  const focus = summary.find((s) => s.franchise === fr);

  return (
    <div className={`results-inner ${busy ? "busy" : ""}`}>
      {busy && <div className="busy-tag">Simulating…</div>}

      <div className="card">
        <h2>Ripple effect</h2>
        <p className="muted small">Every franchise whose roster or Stanley Cup odds moved. Expected Cups add up each season's simulated championship probability.</p>
        <div className="scroll-x">
          <table className="tbl ripple">
            <thead>
              <tr>
                <th>Franchise</th>
                <th className="num">Seasons</th>
                <th className="num">Δ WAR</th>
                <th className="num">Δ Points</th>
                <th className="num">Δ Playoffs</th>
                <th className="num">Δ Exp. Cups</th>
                <th className="num">Cups (real → alt)</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((s) => (
                <tr key={s.franchise} className={`clickable ${s.franchise === fr ? "sel" : ""}`} onClick={() => setFr(s.franchise)}>
                  <td>
                    <span className="badge">{s.team}</span> {s.name}
                    {s.seasonsAffected === 0 && <span className="muted small"> · {Math.abs(s.deltaWar) >= 0.5 ? "league response" : "rival"}</span>}
                  </td>
                  <td className="num">{s.seasonsAffected || "—"}</td>
                  <td className={`num ${tone(s.deltaWar, 0.05)}`}>
                    {signed(s.deltaWar)}
                    <Breakdown c={s.components} />
                  </td>
                  <td className={`num ${tone(s.deltaPts, 0.5)}`}>{signed(s.deltaPts, 0)}</td>
                  <td className={`num ${tone(s.deltaPlayoffs)}`}>{s.deltaPlayoffs ? signed(s.deltaPlayoffs, 0) : "—"}</td>
                  <td className={`num ${tone(s.deltaExpectedCups, 0.005)}`}>{signed(s.deltaExpectedCups, 2)}</td>
                  <td className={`num ${tone(s.altCups - s.actualCups)}`}>
                    {s.actualCups} → <strong>{s.altCups}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Alternate Stanley Cup champions</h2>
        {flips.length ? (
          <div className="champs">
            {flips.map((s) => (
              <div key={s.season} className="champ">
                <div className="muted small">{fmtSeason(s.season)}</div>
                <div className="strike">{teamName(ix, s.actualChampion)}</div>
                <div className="alt">🏆 {teamName(ix, s.altChampion)}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">History holds: in this draw, every real champion still lifts the Cup. Re-roll the timeline to sample another history.</p>
        )}
        <p className="muted small">
          One sampled history, anchored to real events: each real champion keeps the Cup with probability min(1, new odds ÷ old odds); otherwise the title goes to a team whose odds rose.
        </p>
      </div>

      {focus && (
        <div className="card">
          <div className="row-between">
            <h2>
              <span className="badge lg">{focus.team}</span> {focus.name}: season by season
            </h2>
          </div>
          <FranchiseChart rows={rows} selected={season} onSelect={setSeason} />
          <GmMeters ix={ix} franchise={focus.franchise} rows={changedRows} overrides={gmMeters} onChange={onGmMeter} />
          <DraftNotes ix={ix} notes={computed.timeline.notes.filter((n) => ix.ds.teams[n.team]?.franchise === focus.franchise)} />
          <div className="scroll-x">
            <table className="tbl seasons">
              <thead>
                <tr>
                  <th>Season</th>
                  <th className="num">Δ WAR</th>
                  <th className="num">Points</th>
                  <th className="num">Rank</th>
                  <th>Playoffs</th>
                  <th>GM</th>
                  <th className="num">Cup odds</th>
                  <th className="num" title="Change in cap commitments (cap era)">Δ Cap</th>
                  <th>Moves</th>
                </tr>
              </thead>
              <tbody>
                {changedRows.map((r) => (
                  <SeasonRow key={r.season} ix={ix} r={r} selected={r.season === season} onSelect={() => setSeason(r.season)} champ={timeline.seasons.find((s) => s.season === r.season)?.altChampion === r.team} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {focus && season !== null && <SeasonDetail ix={ix} cap={cap} computed={computed} team={rows.find((r) => r.season === season)!} />}
    </div>
  );
}

/** Where a WAR change came from: the user's own moves vs. each league response. */
function Breakdown({ c }: { c: WarComponents }) {
  const parts = (
    [
      ["you", c.direct],
      ["draft", c.draft],
      ["depth", c.depth],
      ["deadline", c.deadline],
    ] as [string, number][]
  ).filter(([, v]) => Math.abs(v) >= 0.05);
  if (parts.length <= 1 && Math.abs(c.direct) >= 0.05) return null;
  if (!parts.length) return null;
  return (
    <div className="breakdown">
      {parts.map(([k, v]) => (
        <span key={k}>
          {k} {signed(v)}
        </span>
      ))}
    </div>
  );
}

function DraftNotes({ ix, notes }: { ix: DataIndex; notes: ResponseNote[] }) {
  if (!notes.length) return null;
  const top = [...notes].sort((a, b) => Math.abs(b.war) - Math.abs(a.war)).slice(0, 6);
  return (
    <div className="draft-notes">
      <div className="muted small">Draft position changes ({teamName(ix, notes[0].team)})</div>
      <ul>
        {top
          .sort((a, b) => a.season - b.season)
          .map((n) => (
            <li key={n.text} className={`small ${tone(n.war, 0.05)}`}>
              {n.text}
            </li>
          ))}
      </ul>
    </div>
  );
}

function playoffLabel(made: boolean) {
  return made ? "In" : "Out";
}

function SeasonRow({ ix, r, selected, onSelect, champ }: { ix: DataIndex; r: TeamSeasonResult; selected: boolean; onSelect: () => void; champ: boolean }) {
  const s = ix.season.get(r.season)!;
  const dPts = r.altPts - r.actualPts;
  return (
    <tr className={`clickable ${selected ? "sel" : ""}`} onClick={onSelect}>
      <td>
        {fmtSeason(r.season)} {r.team !== ix.ds.teams[r.team]?.name && <span className="muted small">{r.team}</span>}
      </td>
      <td className={`num ${tone(r.deltaWar, 0.05)}`}>
        {signed(r.deltaWar)}
        <Breakdown c={r.components} />
      </td>
      <td className="num">
        {r.actualPts} → <strong>{Math.round(r.altPts)}</strong> <span className={`small ${tone(dPts, 0.5)}`}>({signed(dPts, 0)})</span>
      </td>
      <td className="num">
        {r.actualRank} → <strong>{r.altRank}</strong>
      </td>
      <td>
        <span className={r.madePlayoffs !== r.altMadePlayoffs ? (r.altMadePlayoffs ? "up" : "down") : "muted"}>
          {playoffLabel(r.madePlayoffs)} → {playoffLabel(r.altMadePlayoffs)}
        </span>
      </td>
      <td className="small">
        {r.gm ?? "—"} {r.gm && <span className={`pill sm ${r.gmMeter >= 60 ? "good" : r.gmMeter < 40 ? "bad" : ""}`}>{r.gmMeter}</span>}
      </td>
      <td className="num">
        {pct(r.baseCupOdds)} → <strong className={tone(r.altCupOdds - r.baseCupOdds, 0.003)}>{pct(r.altCupOdds)}</strong>
        {r.wonCup && <span title="Won the Cup in real history"> 🏆</span>}
        {champ && !r.wonCup && <span title="Champion in this alternate history"> ✨🏆</span>}
        {r.wonCup && !champ && <span title="Loses the Cup in this alternate history"> ✗</span>}
      </td>
      <td className={`num ${r.capDelta ? tone(-r.capDelta, 0.05) : "muted"}`}>{r.capDelta === null ? "n/a" : s.capCeiling ? signed(r.capDelta, 2) : ""}</td>
      <td className="small">
        {r.arrivals.filter((p) => !r.healthy.includes(p)).map((p) => (
          <span key={p} className="chip in">
            +{playerName(ix, p)}
          </span>
        ))}
        {r.healthy.map((p) => (
          <span key={`h${p}`} className="chip heal">
            ✚{playerName(ix, p)}
          </span>
        ))}
        {r.departures.map((p) => (
          <span key={p} className="chip out">
            −{playerName(ix, p)}
          </span>
        ))}
      </td>
    </tr>
  );
}

function SeasonDetail({ ix, cap, computed, team }: { ix: DataIndex; cap: CapModel; computed: Computed; team: TeamSeasonResult }) {
  const s = ix.season.get(team.season)!;
  const ros = roster(ix, computed.timeline.overrides, team.team, team.season)
    .map((x) => ({ ...x, r: ix.ds.rows[x.i], hit: cap.capHit(ix.ds.rows[x.i][0], team.season) }))
    .sort((a, b) => b.r[4] - a.r[4]);
  const seasonRes = computed.timeline.seasons.find((x) => x.season === team.season)!;
  const groupKey = s.format === "overall16" || s.format === "overall4" ? null : s.format === "division4" || s.format === "bye12" ? "div" : "conf";
  const healthy = computed.applied.flatMap((a) => a.extras ?? []).filter((e) => e.team === team.team && e.season === team.season);
  const myGroup = groupKey ? ix.standings.get(team.season)!.find((t) => t.t === team.team)?.[groupKey] : null;
  const table = seasonRes.teams
    .filter((t) => !groupKey || ix.standings.get(team.season)!.find((x) => x.t === t.team)?.[groupKey] === myGroup)
    .sort((a, b) => b.altPts - a.altPts);
  const committed = ros.filter((x) => x.status !== "departed").reduce((acc, x) => acc + (x.hit?.aav ?? 0) * Math.min(1, x.r[3] / 82), 0);

  return (
    <div className="grid-detail">
      <div className="card">
        <h2>
          {fmtSeason(team.season)} {teamName(ix, team.team)}: alternate roster
        </h2>
        <p className="muted small">
          Sorted by sWAR. Team ΔWAR {signed(team.deltaWar)} → {signed(team.altPts - team.actualPts, 0)} standings points.
          {s.capCeiling && ` Cap ceiling ${money(s.capCeiling)}; Δ commitments ${signed(team.capDelta ?? 0, 2)}M.`}
        </p>
        <div className="scroll-y">
          <table className="tbl compact">
            <thead>
              <tr>
                <th>Player</th>
                <th className="num">GP</th>
                <th className="num">{"Pts/Sv%"}</th>
                <th className="num">WAR</th>
                {s.capCeiling && <th className="num">Cap hit</th>}
              </tr>
            </thead>
            <tbody>
              {healthy.map((e) => (
                <tr key={`h${e.pid}`} className="arrived">
                  <td>
                    <span className="chip heal">HEALTHY</span> {ix.ds.players[e.pid]?.n} <span className="muted small">extra games</span>
                  </td>
                  <td className="num">+{e.gp}</td>
                  <td className="num muted">—</td>
                  <td className="num up">+{e.war.toFixed(2)}</td>
                  {s.capCeiling && <td className="num muted">—</td>}
                </tr>
              ))}
              {ros.map((x) => {
                const p = ix.ds.players[x.r[0]];
                return (
                  <tr key={x.i} className={x.status}>
                    <td>
                      {x.status === "arrived" && <span className="chip in">IN</span>}
                      {x.status === "departed" && <span className="chip out">OUT</span>} {p?.n} <span className="muted small">{p?.pos}</span>
                    </td>
                    <td className="num">{x.r[3]}</td>
                    <td className="num muted">{p?.pos === "G" ? (x.r[5] ? `.${x.r[5]}` : "—") : x.r[5]}</td>
                    <td className="num">{(x.r[4] / 100).toFixed(2)}</td>
                    {s.capCeiling && <td className="num muted">{x.hit ? `${x.hit.aav.toFixed(2)}${x.hit.estimated ? "*" : ""}` : "—"}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {s.capCeiling && (
          <p className="muted small">
            * modelled cap hit. Tracked players on this roster: ~{money(committed)} prorated, against a {money(s.capCeiling)} ceiling. Rosters list only players with NHL games that season, so cap totals are partial.
          </p>
        )}
      </div>
      <div className="card">
        <h2>Alternate standings</h2>
        <p className="muted small">{groupKey ? `${groupKey === "div" ? "Division" : "Conference"} · ` : "League · "}playoff field re-seeded from alternate points</p>
        <table className="tbl compact">
          <thead>
            <tr>
              <th>#</th>
              <th>Team</th>
              <th className="num">Pts</th>
              <th className="num">Δ</th>
              <th className="num">Cup</th>
            </tr>
          </thead>
          <tbody>
            {table.map((t, i) => (
              <tr key={t.team} className={`${t.team === team.team ? "sel" : ""} ${t.altMadePlayoffs ? "" : "out-po"}`}>
                <td className="muted">{i + 1}</td>
                <td>
                  <span className="badge">{t.team}</span>
                  {t.altMadePlayoffs !== t.madePlayoffs && <span className={t.altMadePlayoffs ? "up small" : "down small"}>{t.altMadePlayoffs ? " ▲ in" : " ▼ out"}</span>}
                  {seasonRes.altChampion === t.team && " 🏆"}
                </td>
                <td className="num">{Math.round(t.altPts)}</td>
                <td className={`num small ${tone(t.altPts - t.actualPts, 0.5)}`}>{Math.abs(t.altPts - t.actualPts) >= 0.5 ? signed(t.altPts - t.actualPts, 0) : ""}</td>
                <td className="num">{pct(t.altCupOdds, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RealHistory({ ix, computed }: { ix: DataIndex; computed: Computed }) {
  const rows = useMemo(
    () =>
      [...computed.timeline.seasons].reverse().map((s) => {
        const champ = s.teams.find((t) => t.team === s.actualChampion);
        const fav = [...s.teams].sort((a, b) => b.baseCupOdds - a.baseCupOdds)[0];
        return { s, champ, fav };
      }),
    [computed],
  );
  return (
    <div className="card">
      <h2>Real history, as the model sees it</h2>
      <p className="muted small">
        Before you change anything: each season's real champion, the model's pre-playoff Cup odds for that champion (from regular-season goal differential and the playoff
        format of the day), and the model's favourite. Undo a trade on the left to see how it changes.
      </p>
      <div className="scroll-y tall">
        <table className="tbl compact">
          <thead>
            <tr>
              <th>Season</th>
              <th>Champion</th>
              <th className="num">Model odds</th>
              <th>Model favourite</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ s, champ, fav }) => (
              <tr key={s.season}>
                <td>{fmtSeason(s.season)}</td>
                <td>
                  <span className="badge">{s.actualChampion}</span> {teamName(ix, s.actualChampion)}
                </td>
                <td className="num">{champ ? pct(champ.baseCupOdds) : "—"}</td>
                <td>
                  <span className="badge">{fav.team}</span> <span className="muted small">{pct(fav.baseCupOdds, 0)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
