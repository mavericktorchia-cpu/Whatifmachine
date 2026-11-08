import type { TeamSeasonResult } from "../engine/timeline";
import { fmtSeason, pct } from "./format";

interface Props {
  rows: TeamSeasonResult[];
  selected: number | null;
  onSelect: (season: number) => void;
}

/** Points% (actual vs alternate) as lines, Cup odds as paired bars, over the affected window. */
export function FranchiseChart({ rows, selected, onSelect }: Props) {
  const idx = rows.map((r, i) => (r.deltaWar !== 0 || Math.abs(r.altCupOdds - r.baseCupOdds) > 0.005 ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return null;
  const lo = Math.max(0, idx[0] - 2);
  const hi = Math.min(rows.length - 1, idx.at(-1)! + 2);
  const win = rows.slice(lo, hi + 1);

  const W = 760;
  const H = 260;
  const padL = 40;
  const padR = 12;
  const topH = 150;
  const barTop = 175;
  const barH = 60;
  const step = (W - padL - padR) / Math.max(1, win.length);
  const x = (i: number) => padL + step * (i + 0.5);
  const ppct = (r: TeamSeasonResult, alt: boolean) => (alt ? r.altPts : r.actualPts) / Math.max(1, 2 * r.gp);
  const vals = win.flatMap((r) => [ppct(r, false), ppct(r, true)]);
  const yMin = Math.max(0, Math.floor((Math.min(...vals) - 0.03) * 20) / 20);
  const yMax = Math.min(1, Math.ceil((Math.max(...vals) + 0.03) * 20) / 20);
  const y = (v: number) => 10 + (topH - 10) * (1 - (v - yMin) / Math.max(0.01, yMax - yMin));
  const maxOdds = Math.max(0.05, ...win.flatMap((r) => [r.baseCupOdds, r.altCupOdds]));
  const bh = (p: number) => (p / maxOdds) * barH;
  const line = (alt: boolean) => win.map((r, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(ppct(r, alt)).toFixed(1)}`).join("");
  const ticks = [yMin, (yMin + yMax) / 2, yMax];
  const labelEvery = Math.ceil(win.length / 12);

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H + 20}`} role="img" aria-label="Points percentage and Stanley Cup odds, real versus alternate">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} className="grid" />
            <text x={padL - 6} y={y(t) + 4} className="axis" textAnchor="end">
              {t.toFixed(2).slice(1)}
            </text>
          </g>
        ))}
        {win.map((r, i) =>
          r.season === selected ? <rect key="sel" x={x(i) - step / 2} y={4} width={step} height={H - 4} className="selband" /> : null,
        )}
        <path d={line(false)} className="ln real" />
        <path d={line(true)} className="ln alt" />
        {win.map((r, i) => (
          <g key={r.season}>
            <circle cx={x(i)} cy={y(ppct(r, false))} r={3} className="dot real" />
            <circle cx={x(i)} cy={y(ppct(r, true))} r={3.5} className="dot alt" />
            <rect x={x(i) - step * 0.32} y={barTop + barH - bh(r.baseCupOdds)} width={step * 0.3} height={bh(r.baseCupOdds)} className="bar real" />
            <rect x={x(i) + step * 0.02} y={barTop + barH - bh(r.altCupOdds)} width={step * 0.3} height={bh(r.altCupOdds)} className="bar alt" />
            {r.wonCup && (
              <text x={x(i)} y={barTop - 4} textAnchor="middle" className="axis">
                🏆
              </text>
            )}
            {i % labelEvery === 0 && (
              <text x={x(i)} y={H + 14} textAnchor="middle" className="axis">
                {fmtSeason(r.season).slice(2)}
              </text>
            )}
            <rect x={x(i) - step / 2} y={0} width={step} height={H + 20} fill="transparent" style={{ cursor: "pointer" }} onClick={() => onSelect(r.season)}>
              <title>
                {`${fmtSeason(r.season)}: ${r.actualPts} → ${Math.round(r.altPts)} pts · Cup ${pct(r.baseCupOdds)} → ${pct(r.altCupOdds)}`}
              </title>
            </rect>
          </g>
        ))}
        <text x={padL} y={barTop + barH + 2} className="axis" textAnchor="end" dx={-6}>
          0%
        </text>
        <text x={padL} y={barTop + 8} className="axis" textAnchor="end" dx={-6}>
          {pct(maxOdds, 0)}
        </text>
      </svg>
      <figcaption className="legend small">
        <span>
          <i className="sw real" /> Real
        </span>
        <span>
          <i className="sw alt" /> Alternate
        </span>
        <span className="muted">Lines: points % · Bars: Stanley Cup odds · Click a season for its roster</span>
      </figcaption>
    </figure>
  );
}
