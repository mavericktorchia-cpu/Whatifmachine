import { useEffect, useMemo, useState } from "react";
import { buildCapModel, type CapModel } from "../engine/cap";
import { buildIndex, type DataIndex } from "../engine/dataIndex";
import { applyAll, type AppliedChange, type Change, type Overrides } from "../engine/scenario";
import { computeTimeline, summarize, type FranchiseSummary, type Timeline } from "../engine/timeline";
import type { Dataset } from "../engine/types";
import { CustomPanel } from "./CustomPanel";
import { DraftPanel } from "./DraftPanel";
import { InjuryPanel } from "./InjuryPanel";
import { Results } from "./Results";
import { ScenarioList } from "./ScenarioList";
import { ResponsesPanel } from "./ResponsesPanel";
import type { ResponseOptions } from "../engine/responses";
import { TradesPanel } from "./TradesPanel";
import { readScenario, writeScenario } from "./scenarioUrl";

export interface Computed {
  overrides: Overrides;
  applied: AppliedChange[];
  timeline: Timeline;
  summary: FranchiseSummary[];
}

type Tab = "trades" | "draft" | "injury" | "custom";

export function App() {
  const [ix, setIx] = useState<DataIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const initial = useMemo(readScenario, []);
  const [changes, setChanges] = useState<Change[]>(initial.changes);
  const [seed, setSeed] = useState(initial.seed);
  const [responses, setResponses] = useState<ResponseOptions>(initial.responses);
  const [gmMeters, setGmMeters] = useState<Record<string, number>>(initial.gmMeters);
  const [tab, setTab] = useState<Tab>("trades");
  const [computed, setComputed] = useState<Computed | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("data/nhl.json")
      .then((r) => {
        if (!r.ok) throw new Error(`Could not load data (${r.status})`);
        return r.json() as Promise<Dataset>;
      })
      .then((ds) => setIx(buildIndex(ds)))
      .catch((e: Error) => setError(e.message));
  }, []);

  const cap: CapModel | null = useMemo(() => (ix ? buildCapModel(ix) : null), [ix]);

  const careerWar = useMemo(() => {
    const m = new Map<number, number>();
    if (ix) for (const r of ix.ds.rows) m.set(r[0], (m.get(r[0]) ?? 0) + r[4] / 100);
    return m;
  }, [ix]);

  useEffect(() => {
    writeScenario({ changes, seed, responses, gmMeters });
    if (!ix || !cap) return;
    setBusy(true);
    // Let the "simulating" state paint before the (synchronous) Monte Carlo runs.
    const h = window.setTimeout(() => {
      const { overrides, extras, applied } = applyAll(ix, changes);
      const timeline = computeTimeline(ix, overrides, cap, { seed, responses, extras, gmMeters });
      setComputed({ overrides, applied, timeline, summary: summarize(ix, timeline) });
      setBusy(false);
    }, 20);
    return () => window.clearTimeout(h);
  }, [ix, cap, changes, seed, responses, gmMeters]);

  const add = (c: Change) => setChanges((cs) => [...cs, c]);
  const remove = (k: number) => setChanges((cs) => cs.filter((_, i) => i !== k));
  const replace = (k: number, c: Change) => setChanges((cs) => cs.map((x, i) => (i === k ? c : x)));

  if (error) return <div className="splash error">{error}</div>;
  if (!ix || !cap) return <div className="splash">Loading NHL history since 1966…</div>;

  return (
    <div className="app">
      <header className="top">
        <div>
          <h1>
            What-If <span>Machine</span>
          </h1>
          <p className="sub">
            Undo a trade, redo a draft pick or heal an injury, and the machine replays NHL history from {ix.ds.seasons[0].label} to {ix.ds.seasons.at(-1)!.label}:
            roster WAR, standings, cap commitments and simulated Stanley Cup odds.
          </p>
        </div>
        <div className="top-actions">
          <button className="ghost" onClick={() => setSeed((s) => s + 1)} title="Draw a different alternate history from the same odds">
            🎲 Re-roll timeline <small>#{seed}</small>
          </button>
          <button className="ghost" onClick={() => navigator.clipboard?.writeText(window.location.href).catch(() => undefined)} disabled={!changes.length} title="Copy a link to this scenario">
            🔗 Copy link
          </button>
        </div>
      </header>

      <main className="layout">
        <aside className="builder">
          <ScenarioList ix={ix} changes={changes} applied={computed?.applied ?? []} onRemove={remove} onReplace={replace} onClear={() => setChanges([])} />
          <ResponsesPanel value={responses} onChange={setResponses} timeline={computed?.timeline ?? null} />
          <nav className="tabs" role="tablist">
            {(
              [
                ["trades", "Trades"],
                ["draft", "Redo a draft"],
                ["injury", "Undo an injury"],
                ["custom", "Custom move"],
              ] as [Tab, string][]
            ).map(([k, label]) => (
              <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
                {label}
              </button>
            ))}
          </nav>
          {tab === "trades" && <TradesPanel ix={ix} changes={changes} careerWar={careerWar} onAdd={add} onRemove={remove} />}
          {tab === "draft" && <DraftPanel ix={ix} careerWar={careerWar} onAdd={add} />}
          {tab === "injury" && <InjuryPanel ix={ix} changes={changes} careerWar={careerWar} onAdd={add} onRemove={remove} />}
          {tab === "custom" && <CustomPanel ix={ix} careerWar={careerWar} onAdd={add} />}
        </aside>

        <section className="results">{computed ? <Results ix={ix} cap={cap} computed={computed} busy={busy} hasChanges={changes.length > 0} gmMeters={gmMeters} onGmMeter={(name, v) => setGmMeters((m) => { const next = { ...m }; if (v === null) delete next[name]; else next[name] = v; return next; })} /> : <div className="card">Simulating…</div>}</section>
      </main>

      <footer className="foot">
        Data: NHL public stats, standings, playoff and draft APIs (generated {ix.ds.generatedAt.slice(0, 10)}). WAR here is a box-score estimate
        ("sWAR"), not an official stat; pre-cap salaries and most cap hits are modelled. See the README for the methodology.
      </footer>
    </div>
  );
}
