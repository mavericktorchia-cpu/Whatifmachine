import type { DataIndex } from "../engine/dataIndex";
import { deadlineMultiplier, draftMultiplier, gmModel, meterLabel } from "../engine/gm";
import type { TeamSeasonResult } from "../engine/timeline";

interface Props {
  ix: DataIndex;
  franchise: number;
  rows: TeamSeasonResult[];
  overrides: Record<string, number>;
  onChange: (name: string, meter: number | null) => void;
}

const year = (d: string | null) => (d ? d.slice(0, 4) : "now");

/** Activity meters of the GMs who ran this franchise during the affected seasons, with overrides. */
export function GmMeters({ ix, franchise, rows, overrides, onChange }: Props) {
  const model = gmModel(ix);
  const names = [...new Set(rows.map((r) => r.gm).filter((g): g is string => !!g))];
  if (!names.length) return null;
  return (
    <div className="gm-meters">
      <div className="row-between">
        <h3>GM activity meters</h3>
        <span className="muted small">Lower = more likely to make a move that makes less sense</span>
      </div>
      {names.map((name) => {
        const s = model.scores.get(name);
        const measured = s?.meter ?? 50;
        const meter = overrides[name] ?? measured;
        const tenure = s?.tenures.filter((t) => t.franchise === franchise) ?? [];
        return (
          <div key={name} className="gm">
            <div className="row-between">
              <strong>{name}</strong>
              <span className="muted small">{tenure.map((t) => `${year(t.from)}–${year(t.to)}`).join(", ")}</span>
            </div>
            <div className="meter-row">
              <input
                id={`gm-${name}`}
                type="range"
                min={1}
                max={99}
                value={meter}
                aria-label={`${name} activity meter`}
                onChange={(e) => onChange(name, Number(e.target.value))}
                style={{ ["--fill" as string]: `${meter}%` }}
                className="meter"
              />
              <span className="meter-val">{meter}</span>
              <span className={`pill ${meter >= 60 ? "good" : meter < 40 ? "bad" : ""}`}>{meterLabel(meter)}</span>
              {overrides[name] !== undefined && (
                <button className="link small" onClick={() => onChange(name, null)}>
                  reset to {measured}
                </button>
              )}
            </div>
            <div className="muted small">
              {s?.deadline !== null && s?.deadline !== undefined
                ? `Deadline moves matched his team's standing ${s.deadline >= 0 ? "" : "in reverse "}(score ${s.deadline.toFixed(2)} over ${s.deadlineSeasons} seasons). `
                : "No deadline record. "}
              {s?.draftRatio !== null && s?.draftRatio !== undefined ? `Top-two-round picks returned ${s.draftRatio.toFixed(2)}× that draft's typical value (${s.picks} picks). ` : "No complete drafts. "}
              In this timeline: deadline response ×{deadlineMultiplier(meter).toFixed(1)}, draft-slot value ×{draftMultiplier(meter).toFixed(1)}.
            </div>
          </div>
        );
      })}
    </div>
  );
}
