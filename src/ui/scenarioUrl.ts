import type { Change } from "../engine/scenario";
import { ALL_RESPONSES, type ResponseOptions } from "../engine/responses";

const KEYS = ["draftOrder", "depth", "deadline"] as const;

/** Scenarios live in the URL hash so a timeline can be shared by link. */
export function readScenario(): { changes: Change[]; seed: number; responses: ResponseOptions } {
  try {
    const h = new URLSearchParams(window.location.hash.slice(1));
    const raw = h.get("s");
    const changes = raw ? (JSON.parse(decodeURIComponent(atob(raw))) as Change[]) : [];
    const r = h.get("r");
    const responses = r === null ? ALL_RESPONSES : (Object.fromEntries(KEYS.map((k, i) => [k, r[i] === "1"])) as unknown as ResponseOptions);
    return { changes: Array.isArray(changes) ? changes : [], seed: Number(h.get("seed")) || 1, responses };
  } catch {
    return { changes: [], seed: 1, responses: ALL_RESPONSES };
  }
}

export function writeScenario(changes: Change[], seed: number, responses: ResponseOptions) {
  const h = new URLSearchParams();
  if (changes.length) h.set("s", btoa(encodeURIComponent(JSON.stringify(changes))));
  if (seed !== 1) h.set("seed", String(seed));
  const r = KEYS.map((k) => (responses[k] ? "1" : "0")).join("");
  if (r !== "111") h.set("r", r);
  const next = h.toString();
  window.history.replaceState(null, "", next ? `#${next}` : window.location.pathname + window.location.search);
}
