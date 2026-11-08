import type { DataIndex } from "../engine/dataIndex";
import type { AppliedChange, Change, Tenure } from "../engine/scenario";

interface Props {
  ix?: DataIndex;
  changes: Change[];
  applied: AppliedChange[];
  onRemove: (i: number) => void;
  onReplace: (i: number, c: Change) => void;
  onClear: () => void;
}

export function TenureToggle({ value, onChange }: { value: Tenure; onChange: (t: Tenure) => void }) {
  return (
    <div className="seg" role="radiogroup" aria-label="Tenure model">
      <button role="radio" aria-checked={value === "mirror"} className={value === "mirror" ? "on" : ""} onClick={() => onChange("mirror")} title="Stays as many seasons as he actually spent with his new club, then his real career resumes">
        Same tenure
      </button>
      <button role="radio" aria-checked={value === "career"} className={value === "career" ? "on" : ""} onClick={() => onChange("career")} title="Never leaves: the rest of his career belongs to the original club">
        Lifer
      </button>
    </div>
  );
}

export function ScenarioList({ changes, applied, onRemove, onReplace, onClear }: Props) {
  if (!changes.length) {
    return (
      <div className="card scenario empty">
        <h2>Your alternate timeline</h2>
        <p>No changes yet: this is real history. Undo a trade, redo a draft pick, or move any player. Changes stack, applied in order.</p>
      </div>
    );
  }
  return (
    <div className="card scenario">
      <div className="row-between">
        <h2>Your alternate timeline</h2>
        <button className="link" onClick={onClear}>
          Reset to real history
        </button>
      </div>
      <ol>
        {changes.map((c, i) => {
          const a = applied[i];
          const title = a?.title ?? "…";
          const moved = new Set(a?.moves.map((m) => m.pid)).size;
          return (
            <li key={i}>
              <div className="row-between">
                <strong>{title}</strong>
                <button className="x" aria-label="Remove change" onClick={() => onRemove(i)}>
                  ×
                </button>
              </div>
              <div className="muted small">
                {c.kind === "injury" && a
                  ? `+${(a.extras ?? []).reduce((x, e) => x + e.war, 0).toFixed(1)} WAR and +${(a.extras ?? []).reduce((x, e) => x + e.gp, 0)} games over ${new Set((a.extras ?? []).map((e) => e.season)).size} seasons`
                  : c.kind === "move" && a
                    ? a.moves.map((m) => `${m.from} → ${m.to ?? "out"} (${m.seasons.length} season${m.seasons.length > 1 ? "s" : ""})`).join(", ")
                    : `${moved} player${moved === 1 ? "" : "s"} rerouted`}
              </div>
              {(c.kind === "trade" || c.kind === "draft") && <TenureToggle value={c.tenure} onChange={(t) => onReplace(i, { ...c, tenure: t })} />}
              {a?.warnings.map((w) => (
                <div key={w} className="warn small">
                  ⚠ {w}
                </div>
              ))}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
