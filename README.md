# 🏒 What-If Machine

An interactive "what if?" machine for NHL history. Undo a landmark trade, redo a draft pick or heal a
career-altering injury, and the machine replays every season from **1966-67 to 2025-26**. It recomputes roster WAR, standings, playoff
fields, cap commitments and simulated **Stanley Cup odds** for every franchise the change touches.

- **Every trade since 1966**: about 5,000 trades from a scraped ledger (nhltradetracker.com through
  March 2025, capwages.com after), searchable by player, team and era, sortable by how lopsided they were.
  Players resolve to NHL ids, and picks resolve to the player eventually drafted with them.
- **Landmark trades**: 23 curated deals (Gretzky, Lindros, Hasek, Roy, Kessel, Seguin, Hall-for-Larsson,
  Subban-for-Weber, Eichel, Tkachuk…). Undo one and every player goes back to the club that traded him,
  including players later drafted with traded picks.
- **Redo a draft**: every NHL draft since 1979 (11,000+ picks, from the NHL records API). Each pick shows
  career WAR and a hindsight "redo" rank. Replace any selection with another player from the same draft,
  and the two players swap their tenures with their drafting teams.
- **Undo an injury**: eleven presets (Orr's knees, a healthy Lemieux, Bossy, Neely, LaFontaine, Bure,
  Lindros, Kariya, Forsberg, Crosby, Savard), or heal anyone for any window.
- **GM activity meters**: every general manager since 1966, scored 1-99 on how predictably they acted,
  with a slider to override.
- **Custom move**: send any player to any franchise from any season, for N seasons or the rest of his
  career.
- **Stack changes**: changes apply in order. A later change sees the earlier ones; for example, once the
  Kessel trade is undone, Seguin is in Toronto, so "undo Seguin to Dallas" leaves him alone and says so.
- **Ripple effect**: per franchise, the change in WAR, standings points, playoff appearances and
  expected Cups, plus a season-by-season chart, alternate rosters with cap hits, and alternate standings.
- **Alternate champions**: one sampled alternate history, tied to real history (see below). Re-roll it, and
  share the whole scenario: it lives in the URL.

## Live site

**https://whatifmachine.ca** (also https://mavericktorchia-cpu.github.io/Whatifmachine/, which redirects there
once the custom domain is set). `.github/workflows/pages.yml` deploys on every push.

Custom-domain setup (one time):
- **DNS at the registrar:** apex `A` records `185.199.108.153`, `185.199.109.153`, `185.199.110.153` and
  `185.199.111.153`; `AAAA` records `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`
  and `2606:50c0:8003::153`; `www` as a `CNAME` to `mavericktorchia-cpu.github.io`.
- **GitHub:** repo *Settings → Pages → Custom domain*: `whatifmachine.ca`, then *Enforce HTTPS* once the
  certificate is issued.

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
| `records.nhl.com/site/api/franchise-detail` | general manager tenures |
| `data-sources/trades/*.csv` | trade ledger scraped from nhltradetracker.com and capwages.com |

The trade ledger is converted by `scripts/trade-ledger.ts`. Teams are matched by name to a franchise and
season, and players by name, falling back to last name among each club's players around the trade date
(this catches "Steven"/"Steve" Reinprecht, "Ed"/"Eddie" Olczyk and the like). Picks resolve through:
- the player named in the pick ("1995 1st round pick (#13-Jean-Sebastien Giguere)", with typo
  tolerance);
- the original owner ("2025 3rd round pick (TOR)");
- the NHL draft records' pick history for bare picks ("2018 2nd round pick": the pick of that year and
  round that passed between those two clubs).

About 91% of traded players resolve. Most of the rest never played in the NHL.

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
  every draft with a complete ten-year window: about 17.2 WAR for the #1 pick to its drafting team, 4.0
  at #10 and 1.7 at #30 (smoothed so it never rises down the board). Expected value is used rather than
  "whoever really went at that slot", because neighbouring picks can differ wildly (Giroux went 22nd).
  - Lottery winners and forfeited picks (3+ slots from their standings position) keep their slot.
  - The effect is first-order: only standings moved by your changes re-order a draft, never earlier draft
    adjustments, so it can't snowball.
- **Depth chart.** An arriving player takes games from the bottom quarter of his new team's depth chart at
  his position (F/D/G), not from a replacement-level call-up. Those players' WAR per game (clamped to
  −0.02…+0.03) is subtracted; a departure gives it back.
- **Deadline moves.** Every mid-season team change since 1966 is grouped by fifths of the final standings.
  Best to worst, each fifth nets about +0.11, +0.15, +0.16, −0.05 and −0.40 WAR in-season: bad teams sell
  more than good teams buy. When a team's alternate standing moves, it gets the difference between the
  curve at its new and old standing (changes under 0.05 WAR are ignored).

### Injuries (`src/engine/injuries.ts`, `aging.ts`)
A healthy player keeps producing at his pre-injury rate: WAR per game over his last three healthy
seasons (40+ games, at least half the schedule), or his three best if there are none.
- **Aging.** That rate follows a league aging curve measured from the data with the delta method:
  every skater with 40+ games in consecutive seasons. It peaks at 26 and halves by 33.
- **Games played.** He plays 92% of his team's games (adjustable).
- **Never worse than reality.** If he really produced more in a season (Lemieux's 1995-96), that
  season stands.
- **Team.** Extra WAR and games go to his team, and the extra games displace depth players. Presets can
  keep him with one club (Orr stays a Bruin, so his Chicago games move to Boston).

### GM activity meter (`src/engine/gm.ts`)
GM tenures come from the NHL records API's franchise histories (318 tenures with exact dates). Each GM
is scored from his real record:
- **Deadline discipline.** How well his in-season trading matched his team's situation: the cosine
  between what the league curve expects at his standing and what he actually did.
- **Draft return.** WAR his first- and second-round picks gave the club over ten seasons, against what
  those slots returned in the same draft year.

Both are shrunk toward average for short tenures, standardised, and combined into a 1-99 meter (league
average 50). Lower means more likely to make a move that makes less sense. In a scenario:
- **Deadline response** is multiplied by `(meter − 25) / 25`: 50 is the league norm, 75+ reacts twice as
  hard, and below 25 the GM does the opposite of what the standings call for.
- **Draft-slot value** is multiplied by `meter / 50` (bounded 0.4-1.6).

The meter measures predictability, not greatness. Sam Pollock rates low because his dynasty Canadiens
often traded against their standings (dealing for future picks while contending). Any meter can be
overridden in the team view, and overrides travel with the share link.

## Limitations

- sWAR is an approximation. Use it to compare players, not as an official figure.
- The trade ledger is third-party scraped data and may contain errors. Picks that never produced an NHL
  player, cash and future considerations are listed but carry no value. Trades before 1966-67 aren't
  included.
- League responses are averages, not predictions of specific moves. Free-agent signings, cap-forced
  moves and player development in a different environment are not modelled.
- Coverage starts in 1966-67, the last Original Six season. WHA seasons aren't included, and the 2004-05
  lockout season doesn't exist.
- The 1974-79 preliminary-round format and the 2020 bubble are approximations.

## Project layout

```
scripts/fetch-data.ts   download raw NHL data (cached)
scripts/build-data.ts   compute sWAR and emit public/data/nhl.json
src/data/               curated trades + contracts, cap ceilings, playoff formats
src/engine/             pure TypeScript engine (WAR, scenarios, playoff sim, cap) + tests
src/ui/                 React UI
```
