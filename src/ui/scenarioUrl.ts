import type { Change } from "../engine/scenario";

/** Scenarios live in the URL hash so a timeline can be shared by link. */
export function readScenario(): { changes: Change[]; seed: number } {
  try {
    const h = new URLSearchParams(window.location.hash.slice(1));
    const raw = h.get("s");
    const changes = raw ? (JSON.parse(decodeURIComponent(atob(raw))) as Change[]) : [];
    return { changes: Array.isArray(changes) ? changes : [], seed: Number(h.get("seed")) || 1 };
  } catch {
    return { changes: [], seed: 1 };
  }
}

export function writeScenario(changes: Change[], seed: number) {
  const h = new URLSearchParams();
  if (changes.length) h.set("s", btoa(encodeURIComponent(JSON.stringify(changes))));
  if (seed !== 1) h.set("seed", String(seed));
  const next = h.toString();
  window.history.replaceState(null, "", next ? `#${next}` : window.location.pathname + window.location.search);
}
