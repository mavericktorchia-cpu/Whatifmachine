# 🏒 What-If Machine

An interactive "what if?" machine for NHL history. Undo a landmark trade or redo a draft pick, and the
machine replays every season from **1979-80 to 2025-26**. It recomputes roster WAR, standings, playoff
fields, cap commitments and simulated **Stanley Cup odds** for every franchise the change touches.

- **Landmark trades**: 23 curated deals (Gretzky, Lindros, Hasek, Roy, Kessel, Seguin, Hall-for-Larsson,
  Subban-for-Weber, Eichel, Tkachuk…). Undo one and every player goes back to the club that traded him,
  including players later drafted with traded picks.
- **Redo a draft**: every NHL draft since 1979 (11,000+ picks, from the NHL records API). Each pick shows
  career WAR and a hindsight "redo" rank. Replace any selection with another player from the same draft,
  and the two players swap their tenures with their drafting teams.
- **Custom move**: send any player to any franchise from any season, for N seasons or the rest of his
  career.
- **Stack changes**: changes apply in order. A later change sees the earlier ones; for example, once the
  Kessel trade is undone, Seguin is in Toronto, so "undo Seguin to Dallas" leaves him alone and says so.
- **Ripple effect**: per franchise, the change in WAR, standings points, playoff appearances and
  expected Cups, plus a season-by-season chart, alternate rosters with cap hits, and alternate standings.
- **Alternate champions**: one sampled alternate history, tied to real history (see below). Re-roll it, and
  share the whole scenario: it lives in the URL.

## Live site

Deployed to GitHub Pages by `.github/workflows/pages.yml` on every push:
**https://mavericktorchia-cpu.github.io/Whatifmachine/** (one-time setup: repo *Settings → Pages → Source: GitHub Actions*).

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # engine tests against the real dataset
npm run build      # static site in dist/ (deploy anywhere)
```

The processed dataset is committed (`public/data/nhl.json`, about 2.6 MB), so no network access is needed
to run the app. To refresh it from the NHL's public APIs:

```bash
npm run data       # data:fetch (cached in ./data-raw) + data:build
```

## How it works

### Data (`scripts/`)
| Source | Used for |
|---|---|
| `api.nhle.com/stats/rest` | skater and goalie season summaries, team/franchise list |
| `api-web.nhle.com/v1/standings/{date}` | final regular-season standings (with conferences and divisions) |
| `api-web.nhle.com/v1/playoff-series/carousel` | real Stanley Cup champions |
| `api-web.nhle.com/v1/player/{id}/landing` | per-team splits for players traded mid-season |
| `records.nhl.com/site/api/draft` | every draft pick, including pick-trade history |

Relocated franchises are tracked by franchise ID (Quebec→Colorado, Hartford→Carolina, Winnipeg→Phoenix→Arizona,
Minnesota→Dallas, Atlanta→Winnipeg), so a player "sent back" to the Nordiques in 1996 lands on the Avalanche.

### sWAR, a box-score WAR (`src/engine/war.ts`)
Tracking-based WAR models don't exist before about 2007, so the machine uses a simple stat-based estimate
that can be computed for every season back to 1979:

- **Skater offense**: goals created `k·(G + ½A)`, scaled so league totals match league goals, minus a
  replacement level (50% of the league-average rate for forwards or defencemen).
- **Skater defense**: the team's shot suppression against a replacement-level team, shared by ice time
  (by GP and position before TOI was tracked), plus a small relative plus-minus term.
- **Goalies**: `0.75 × shots against × (sv% − (league sv% − .006))`.
- **Goals per win** = 2 × league goals per team-game (the derivative of the Pythagorean expectation).

Sanity checks are in the tests: Gretzky has the highest career sWAR, Crosby is in the top 10, and team
sWAR correlates with standings points (r > 0.8).

### Alternate timeline (`src/engine/scenario.ts`, `timeline.ts`)
- **Tenure model.** *Same tenure* (default): a returned player stays exactly as many seasons as he
  actually spent with his new club, then his real career resumes. *Lifer*: he never leaves.
- **Standings.** Each WAR moved is worth 2 standings points and `goalsPerWin` goals of differential.
  Everyone else's season is unchanged, as with any WAR model, where the added player displaces a
  replacement-level one.
- **Playoffs.** The field is re-seeded from the alternate standings using the format of that era: top 16
  overall (1980-81), division brackets (1982-93, plus 2020-21), conference top 8 with re-seeding
  (1994-2013; the 2020 bubble is approximated this way), and the wild-card format (2014-). Series are
  simulated with a single-game logistic on goal differential per game (+1.0 GD/game ≈ 70% to win a game),
  4,000 times per season. The alternate run reuses the base run's random draws, so odds move only where
  rosters changed.
- **Alternate champions.** Each real champion keeps the Cup with probability `min(1, newOdds/oldOdds)`.
  Otherwise the title goes to a team whose odds rose, chosen in proportion to the increase. History only
  changes as much as the new odds require.
- **Cap.** In the cap era (2005-06 onward), curated AAVs are used for players in the landmark trades.
  Everyone else gets a modelled cap hit: an entry-level deal for a drafted player's first three seasons,
  then league minimum + recent WAR × market $/WAR, capped at 20% of the ceiling. Modelled values are marked
  with `*`.

### League responses (`src/engine/responses.ts`)
Three second-order effects run after your changes. Each can be switched off under **League responses**,
and every WAR change is broken down into *you / draft / depth / deadline*.

- **Draft order.** After each changed season, the next draft's first round is re-ordered from the
  alternate standings: non-playoff teams first, then by points. The team gains or loses the historical
  value difference between its old and new slot, spread over the next ten seasons. That value comes from
  every draft with a complete ten-year window: about 19.5 WAR for the #1 pick to its drafting team, 4.8
  at #10 and 1.9 at #30 (smoothed so it never rises down the board). Expected value is used rather than
  "whoever really went at that slot", because neighbouring picks can differ wildly (Giroux went 22nd).
  - Lottery winners and forfeited picks (3+ slots from their standings position) keep their slot.
  - The effect is first-order: only standings moved by your changes re-order a draft, never earlier draft
    adjustments, so it can't snowball.
- **Depth chart.** An arriving player takes games from the bottom quarter of his new team's depth chart at
  his position (F/D/G), not from a replacement-level call-up. Those players' WAR per game (clamped to
  −0.02…+0.03) is subtracted; a departure gives it back.
- **Deadline moves.** Every mid-season team change since 1979 is grouped by fifths of the final standings.
  Best to worst, each fifth nets about +0.15, +0.19, +0.16, −0.09 and −0.43 WAR in-season: bad teams sell
  more than good teams buy. When a team's alternate standing moves, it gets the difference between the
  curve at its new and old standing (changes under 0.05 WAR are ignored).

## Limitations

- sWAR is an approximation. Use it to compare players, not as an official figure.
- Trades are curated, because the NHL has no public trade ledger. Picks that never produced an NHL player,
  cash and future considerations are listed but carry no value.
- League responses are averages, not predictions of specific moves. Free-agent signings, cap-forced
  moves and player development in a different environment are not modelled.
- Coverage starts in 1979-80, the first season after the WHA merger. The 2004-05 lockout season doesn't
  exist.

## Project layout

```
scripts/fetch-data.ts   download raw NHL data (cached)
scripts/build-data.ts   compute sWAR and emit public/data/nhl.json
src/data/               curated trades + contracts, cap ceilings, playoff formats
src/engine/             pure TypeScript engine (WAR, scenarios, playoff sim, cap) + tests
src/ui/                 React UI
```
