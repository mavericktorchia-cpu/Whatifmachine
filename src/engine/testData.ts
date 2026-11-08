import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildIndex, type DataIndex } from "./dataIndex";
import type { Dataset } from "./types";

let cached: DataIndex | null = null;
export function loadIndex(): DataIndex {
  if (!cached) cached = buildIndex(JSON.parse(readFileSync(join(process.cwd(), "public/data/nhl.json"), "utf8")) as Dataset);
  return cached;
}
