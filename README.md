# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/26516515111/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/26516515111/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

**Token Launch Radar** — an entry for the make.fun bounty **token-radar-01** ("Build the best token launch radar").
It reads the sealed DefiLlama snapshot, ranks the protocols that record no token yet by an
implied launch value, and hands in a static dashboard a reader can actually use: the board,
a detail view for every protocol with its value breakdown, and the steps to farm it.

## The model

Implied value = TVL × category multiple × momentum × maturity, all from the snapshot:

- **Category multiple** — the median market-cap/TVL of the protocols in the same category
  whose token already trades in this snapshot, with the peer count kept and shown.
- **Momentum** — the protocol's 7-day TVL growth, clamped so one hot week cannot dominate.
- **Maturity** — how long the protocol has run with no token, capped at six years.

Wrapped, staked and bridged products of tokens that already trade (WBTC and its kin) are
screened out by the watchlist's own rules — category, name shape, exchange prefixes —
applied to every candidate, not just the ones above the floor. No hardcoded names, no
network, no wall clock (ages are measured against the snapshot's `as_of`): two runs of the
program write byte-identical output.

## Layout

- `main.ts` — the entrypoint the grader runs (Node 22, standard library only)
- `lib/model.ts` — snapshot parsing, the derivative screen, the value model, farm plans,
  and a self-check of the board against the gate's rules before anything is written
- `vendor/makefun-board.ts` — make.fun's dossier library, byte for byte as the kit ships it
- `dashboard/` — the static page: sortable, filterable board, per-protocol detail with the
  full value multiplication and a five-step farm plan (set up, core loop, widen, stay
  eligible, launch readiness), every step with a cost or a duration
- `screenshots/` — the board, a protocol's detail view, and a filtered view

## Run it

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input <dir holding snapshot.json>
```

Writes `board.json`, `data.js`, `dashboard/`, `screenshots/` and `dossier.json` into `out/`.

## Reading the board honestly

A protocol here *records* no token in the sealed snapshot; that is not proof it has none.
An implied value is this radar's own model of what a launch would be worth if the
protocol's record stayed as it is — not a prediction that a token will launch, and not a
promise of what it would trade at.

---

<sub>Entered on [make.fun](https://make.fun/?ref=q3qqdzz9&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
