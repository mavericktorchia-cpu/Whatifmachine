/**
 * Downloads raw NHL data into ./data-raw (cached; re-runs only fetch what is missing).
 *
 * Sources (all public NHL endpoints):
 *  - api.nhle.com/stats/rest   team list, skater & goalie season summaries
 *  - api-web.nhle.com/v1       end-of-season standings, playoff brackets, player landing pages
 *  - records.nhl.com/site/api  every NHL draft pick
 */
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const RAW = join(process.cwd(), "data-raw");
export const FIRST_SEASON = 19791980;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson(url: string, tries = 5): Promise<unknown> {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": "whatifmachine-data/0.1" } });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (i === tries - 1) throw new Error(`${url}: ${(err as Error).message}`);
      await sleep(1000 * 2 ** i);
    }
  }
  return null;
}

async function cached(name: string, url: string): Promise<unknown> {
  const file = join(RAW, name);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  const data = await getJson(url);
  writeFileSync(file, JSON.stringify(data));
  return data;
}

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

async function main() {
  for (const d of ["", "standings", "skaters", "goalies", "playoffs", "landing"]) mkdirSync(join(RAW, d), { recursive: true });

  await cached("teams.json", "https://api.nhle.com/stats/rest/en/team");
  await cached("draft.json", "https://records.nhl.com/site/api/draft?limit=-1");
  const ss = (await getJson("https://api-web.nhle.com/v1/standings-season")) as {
    seasons: { id: number; standingsEnd: string }[];
  };
  const today = new Date().toISOString().slice(0, 10);
  // Only completed regular seasons (standings end date in the past, and not today's live table).
  const seasons = ss.seasons.filter((s) => s.id >= FIRST_SEASON && s.standingsEnd < today);
  writeFileSync(join(RAW, "seasons.json"), JSON.stringify(seasons));
  console.log(`seasons: ${seasons.length} (${seasons[0].id}..${seasons.at(-1)!.id})`);

  await pool(seasons, 4, async (s) => {
    const q = `cayenneExp=seasonId=${s.id}%20and%20gameTypeId=2`;
    await cached(`standings/${s.id}.json`, `https://api-web.nhle.com/v1/standings/${s.standingsEnd}`);
    await cached(`skaters/${s.id}.json`, `https://api.nhle.com/stats/rest/en/skater/summary?isAggregate=false&isGame=false&limit=-1&${q}`);
    await cached(`goalies/${s.id}.json`, `https://api.nhle.com/stats/rest/en/goalie/summary?isAggregate=false&isGame=false&limit=-1&${q}`);
    await cached(`playoffs/${s.id}.json`, `https://api-web.nhle.com/v1/playoff-series/carousel/${s.id}/`);
  });

  // Players who changed teams mid-season need per-team splits, which only the landing page has.
  // Fetch those for anyone with a meaningful career (others are split evenly in build-data).
  const career = new Map<number, number>();
  const splitters = new Set<number>();
  for (const s of seasons) {
    for (const kind of ["skaters", "goalies"]) {
      const rows = (JSON.parse(readFileSync(join(RAW, kind, `${s.id}.json`), "utf8")) as { data: { playerId: number; gamesPlayed: number; teamAbbrevs: string }[] }).data;
      for (const r of rows) {
        career.set(r.playerId, (career.get(r.playerId) ?? 0) + r.gamesPlayed);
        if (r.teamAbbrevs.includes(",")) splitters.add(r.playerId);
      }
    }
  }
  const need = [...splitters].filter((id) => (career.get(id) ?? 0) >= 120);
  console.log(`landing pages needed: ${need.length}`);
  let done = 0;
  await pool(need, 8, async (id) => {
    await cached(`landing/${id}.json`, `https://api-web.nhle.com/v1/player/${id}/landing`);
    if (++done % 250 === 0) console.log(`  ${done}/${need.length}`);
  });
  console.log("raw data ready");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
