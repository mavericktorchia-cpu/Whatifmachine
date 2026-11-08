import type { ResponseOptions } from "../engine/responses";
import type { Timeline } from "../engine/timeline";
import { signed } from "./format";

interface Props {
  value: ResponseOptions;
  onChange: (v: ResponseOptions) => void;
  timeline: Timeline | null;
}

const ITEMS: { key: keyof ResponseOptions; comp: "draft" | "depth" | "deadline"; label: string; help: string }[] = [
  {
    key: "draftOrder",
    comp: "draft",
    label: "Draft order",
    help: "A team that finishes differently picks in a different first-round slot. It gains or loses that slot's historical value, spread over the next ten seasons.",
  },
  {
    key: "depth",
    comp: "depth",
    label: "Depth chart",
    help: "An arriving player takes games from the team's depth players at his position, not from a replacement-level call-up. A departure gives those games back.",
  },
  {
    key: "deadline",
    comp: "deadline",
    label: "Deadline moves",
    help: "Bad teams sell during the season and good teams buy a little. When a team's standing moves, it trades like a team at its new standing.",
  },
];

export function ResponsesPanel({ value, onChange, timeline }: Props) {
  const totals = { draft: 0, depth: 0, deadline: 0 };
  if (timeline) for (const s of timeline.seasons) for (const t of s.teams) for (const k of ["draft", "depth", "deadline"] as const) totals[k] += Math.abs(t.components[k]);
  return (
    <details className="card responses">
      <summary>
        <span>
          <strong>League responses</strong> <span className="muted small">how other teams react</span>
        </span>
        <span className="muted small">{ITEMS.filter((i) => value[i.key]).length}/3 on</span>
      </summary>
      <div className="resp-list">
        {ITEMS.map((it) => (
          <label key={it.key} className="resp">
            <input type="checkbox" id={`resp-${it.key}`} checked={value[it.key]} onChange={(e) => onChange({ ...value, [it.key]: e.target.checked })} />
            <span>
              <strong>{it.label}</strong>
              {timeline && value[it.key] && totals[it.comp] > 0.05 && <span className="muted small"> · moved {totals[it.comp].toFixed(1)} WAR league-wide</span>}
              <span className="muted small block-text">{it.help}</span>
            </span>
          </label>
        ))}
      </div>
      {timeline && (
        <p className="muted small">
          Measured from every mid-season move since 1966, each fifth of the standings nets, best to worst:{" "}
          {timeline.deadline.curve.map(([, w]) => signed(w, 2)).join(" · ")} WAR. A #1 pick is worth {timeline.draftValue.value[1].toFixed(1)} WAR to the team that makes
          it; #10, {timeline.draftValue.value[10].toFixed(1)}; #30, {timeline.draftValue.value[30].toFixed(1)}. Draft and deadline responses are scaled by each GM's
          activity meter, which you can adjust in the team view.
        </p>
      )}
    </details>
  );
}
