import type { Change } from "../engine/scenario";
import { ALL_RESPONSES, type ResponseOptions } from "../engine/responses";

const KEYS = ["draftOrder", "depth", "deadline"] as const;

/** Scenarios live in the URL hash so a timeline can be shared by link. */
export interface ScenarioState {
  changes: Change[];
  seed: number;
  responses: ResponseOptions;
  gmMeters: Record<string, number>;
}

export function readScenario(): ScenarioState {
  try {
    const h = new URLSearchParams(window.location.hash.slice(1));
    const raw = h.get("s");
    const changes = raw ? (JSON.parse(decodeURIComponent(atob(raw))) as Change[]) : [];
    const r = h.get("r");
    const responses = r === null ? ALL_RESPONSES : (Object.fromEntries(KEYS.map((k, i) => [k, r[i] === "1"])) as unknown as ResponseOptions);
    const g = h.get("g");
    const gmMeters = g ? (JSON.parse(decodeURIComponent(atob(g))) as Record<string, number>) : {};
    return { changes: Array.isArray(changes) ? changes : [], seed: Number(h.get("seed")) || 1, responses, gmMeters };
  } catch {
    return { changes: [], seed: 1, responses: ALL_RESPONSES, gmMeters: {} };
  }
}

export function writeScenario({ changes, seed, responses, gmMeters }: ScenarioState) {
  const h = new URLSearchParams();
  if (changes.length) h.set("s", btoa(encodeURIComponent(JSON.stringify(changes))));
  if (seed !== 1) h.set("seed", String(seed));
  const r = KEYS.map((k) => (responses[k] ? "1" : "0")).join("");
  if (r !== "111") h.set("r", r);
  if (Object.keys(gmMeters).length) h.set("g", btoa(encodeURIComponent(JSON.stringify(gmMeters))));
  const next = h.toString();
  window.history.replaceState(null, "", next ? `#${next}` : window.location.pathname + window.location.search);
}
