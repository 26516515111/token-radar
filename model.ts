// lib/model.ts — the token launch radar's value model and board builder.
//
// Every figure derives from the sealed snapshot itself: no hardcoded protocol names, no
// network, no wall clock (ages are measured against the snapshot's own as_of date) and no
// randomness, so two runs of the program write byte-identical output.
//
// The model, in one paragraph: for each category, take the protocols whose token already
// trades and compute the median ratio of market cap to TVL — what the market actually pays
// for a dollar of TVL in that line of business, and how many traded peers stand behind the
// number. A pre-token protocol's implied value is its own TVL times its category's median
// multiple, adjusted for momentum (its seven-day TVL growth, clamped so one hot week
// cannot dominate) and for maturity (how long it has already run with no token, capped).
// The dashboard shows the whole multiplication for every row, so a reader can disagree
// with any single factor and still use the board.

export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

export interface Row {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
}

export interface RadarRow extends Row {
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  on_watchlist: boolean;
  multiple: number;
  peers: number;
  growth_factor: number;
  age_factor: number;
}

export interface Radar {
  as_of: string;
  floor_usd: number;
  rows: RadarRow[];
  watchlist_size: number;
  early_size: number;
  live_size: number;
  total_protocols: number;
  median_implied_usd: number;
  total_implied_usd: number;
  categories: number;
}

/** Parse and lightly validate the sealed snapshot. Throws on a malformed file. */
export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text) as Snapshot;
  if (!Array.isArray(raw.protocols) || !Array.isArray(raw.watchlist) || typeof raw.as_of !== 'string') {
    throw new Error('snapshot: expected protocols[], watchlist[] and as_of');
  }
  return raw;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

export interface Multiples {
  byCategory: Map<string, { multiple: number; peers: number }>;
  global: { multiple: number; peers: number };
}

/**
 * The market's own price for a dollar of TVL, per category: the median mcap/TVL ratio of
 * the category's token-bearing protocols, with the peer count kept so the dashboard can
 * show how much evidence stands behind each multiple. Categories with fewer than three
 * traded peers fall back to the global median. Multiples are clamped to a sane band.
 */
export function categoryMultiples(snapshot: Snapshot): Multiples {
  const ratios = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    all.push(ratio);
    const key = p.category ?? '(none)';
    const list = ratios.get(key);
    if (list === undefined) ratios.set(key, [ratio]);
    else list.push(ratio);
  }
  const global = { multiple: all.length > 0 ? clamp(median(all), 0.1, 10) : 1, peers: all.length };
  const byCategory = new Map<string, { multiple: number; peers: number }>();
  for (const [key, list] of ratios) {
    if (list.length >= 3) byCategory.set(key, { multiple: clamp(median(list), 0.1, 10), peers: list.length });
  }
  return { byCategory, global };
}

/** Whole days between two YYYY-MM-DD dates, UTC. */
function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

export interface ValueParts {
  value: number;
  growthFactor: number;
  ageFactor: number;
}

/**
 * One protocol's implied launch value, with its factors kept separate for the dashboard's
 * breakdown: TVL x category multiple x momentum x maturity, in whole dollars.
 */
export function impliedValue(p: Protocol, multiple: number, asOf: string): ValueParts {
  const growth = p.change_7d === null ? 0 : clamp(p.change_7d, -60, 120);
  const growthFactor = 1 + growth / 250;
  const ageYears = p.listed_at === null ? 0 : daysBetween(p.listed_at, asOf) / 365;
  const ageFactor = 1 + Math.min(ageYears, 6) * 0.035;
  const value = Math.max(1, Math.round(p.tvl_usd * multiple * growthFactor * ageFactor));
  return { value, growthFactor, ageFactor };
}

/** The core farming action for a category, used to make each plan concrete. */
function coreAction(category: string | null): string {
  switch (category) {
    case 'Dexs':
      return 'route your swaps through its pools on its busiest chain, favouring the pairs with the deepest liquidity';
    case 'Lending':
      return 'supply a core asset and keep a small, safely collateralised borrow open, so both sides of the market see your wallet';
    case 'Yield':
      return 'deposit into its flagship vault and leave the position untouched, so your share balance keeps compounding';
    case 'Risk Curators':
      return 'allocate to one of its curated vaults on its main chain and keep the allocation in place across rebalances';
    case 'RWA':
      return 'complete its onboarding once and hold one of its tokenised real-world positions in the same wallet';
    case 'Perps':
      return 'trade small, regular perpetual positions with tight risk limits rather than one large bet';
    case 'Options':
      return 'buy or write small options positions on a weekly rhythm instead of a single large trade';
    case 'CDP':
      return 'mint a modest amount of its stablecoin against collateral and keep the vault open and healthy';
    case 'Liquid Staking':
      return 'stake a modest amount through the protocol and hold the receipt token in the same wallet';
    case 'Bridge':
      return 'bridge a small amount to each chain it serves and bridge back a week later, keeping every hop in one wallet';
    default:
      return 'use its flagship product on its main chain the way a genuine user would, in small regular amounts';
  }
}

/** Position sizes scale with the protocol's size: farming a giant takes more than dust. */
function sizeBand(tvl: number): { first: string; session: string; monthly: string } {
  if (tvl >= 500_000_000) return { first: '$250-$500', session: '$200', monthly: '$25-$60' };
  if (tvl >= 100_000_000) return { first: '$100-$250', session: '$100', monthly: '$15-$40' };
  if (tvl >= 25_000_000) return { first: '$50-$100', session: '$50', monthly: '$10-$25' };
  return { first: '$25-$50', session: '$25', monthly: '$5-$15' };
}

/**
 * Five concrete farm steps for one protocol: set up, run the core loop, widen, stay
 * eligible, get ready to claim. Every step names a cost or a duration, because a plan
 * without either is a slogan. Amounts scale with the protocol's TVL band.
 */
export function farmSteps(p: Protocol): string[] {
  const chain = p.chains.length > 0 ? p.chains[0]! : 'its main chain';
  const second = p.chains.length > 1 ? p.chains[1]! : null;
  const size = sizeBand(p.tvl_usd);
  const since = p.listed_at === null ? 'DefiLlama tracks it' : `tracked since ${p.listed_at}`;
  const widen =
    second === null
      ? `After two weeks, add a second product line inside ${p.name} (a second pool, market or vault), so your history is not one repeated click; this takes about 20 minutes to set up.`
      : `After two weeks, repeat the same activity on ${second}, its second chain: cross-chain users are rarer, and the extra bridging costs about $5-$15 in fees.`;
  return [
    `Open ${p.name} on ${chain}, connect one wallet you will keep using, and make a first position of about ${size.first}. Budget under $5 for network fees on most chains, and keep the transaction hashes as your records.`,
    `${coreAction(p.category).charAt(0).toUpperCase()}${coreAction(p.category).slice(1)}; two or three sessions a week of about ${size.session} each is enough, and a month of this costs roughly ${size.monthly} in fees and slippage.`,
    `${widen}`,
    `Keep the cadence for at least 8-12 weeks (${since}); steady use over a season outweighs one busy week, and one honest wallet with real history beats five fresh wallets that a snapshot can flag.`,
    `Check ${p.name}'s official channels once a week for points, season or snapshot news; if a token or claim is announced, act from the same wallet in the first days of the window, and only ever follow links from the official account.`,
  ];
}

const BOARD_SIZE = 240;

/** Categories that are never a launch of their own: wrappers and venues of other tokens. */
const DERIVATIVE_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];
const VERSION_SUFFIX = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPER_WORD = /\b(wrapped|staked|staking)\b/i;

/**
 * A wrapped, staked or bridged product of a token that already trades is not a protocol
 * waiting on a launch: WBTC is Bitcoin on Ethereum, not a pre-token protocol. The snapshot
 * carries no parent field, so this applies the watchlist's own screen — category, name
 * shape and exchange prefixes — to every candidate, not just the ones above the floor.
 */
export function isDerivative(p: Protocol): boolean {
  if (p.category !== null && DERIVATIVE_CATEGORIES.has(p.category)) return true;
  if (VERSION_SUFFIX.test(p.name)) return true;
  if (WRAPPER_WORD.test(p.name)) return true;
  return EXCHANGE_PREFIXES.some((x) => p.name.startsWith(x));
}

/**
 * Build the board: every watchlist protocol, plus the largest genuine pre-token protocols
 * below the floor, ranked by implied value. Token-bearing protocols and wrapped or staked
 * products of traded tokens are set aside, never ranked: the radar exists for launches
 * that have not happened yet.
 */
export function buildRadar(snapshot: Snapshot): { board: Row[]; radar: Radar } {
  const { byCategory, global } = categoryMultiples(snapshot);
  const watch = new Set(snapshot.watchlist);
  const preToken = snapshot.protocols.filter((p) => p.gecko_id === null && p.symbol === null);
  const derivatives = preToken.filter(isDerivative);
  const live = snapshot.protocols.length - preToken.length + derivatives.length;

  const candidates = preToken.filter((p) => !isDerivative(p));
  const onList = candidates.filter((p) => watch.has(p.slug));
  const belowFloor = candidates
    .filter((p) => !watch.has(p.slug))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1));
  const chosen = [...onList, ...belowFloor.slice(0, Math.max(0, BOARD_SIZE - onList.length))];

  const scored = chosen.map((p) => {
    const priced = byCategory.get(p.category ?? '(none)') ?? global;
    const parts = impliedValue(p, priced.multiple, snapshot.as_of);
    return { p, multiple: priced.multiple, peers: priced.peers, parts };
  });
  scored.sort((a, b) => b.parts.value - a.parts.value || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : 1));

  const rows: RadarRow[] = scored.map((s, i) => ({
    slug: s.p.slug,
    name: s.p.name,
    rank: i + 1,
    implied_value_usd: s.parts.value,
    farm_steps: farmSteps(s.p),
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    listed_at: s.p.listed_at,
    on_watchlist: watch.has(s.p.slug),
    multiple: Math.round(s.multiple * 1000) / 1000,
    peers: s.peers,
    growth_factor: Math.round(s.parts.growthFactor * 1000) / 1000,
    age_factor: Math.round(s.parts.ageFactor * 1000) / 1000,
  }));
  const board: Row[] = rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    rank: r.rank,
    implied_value_usd: r.implied_value_usd,
    farm_steps: r.farm_steps,
  }));
  const values = rows.map((r) => r.implied_value_usd);
  const radar: Radar = {
    as_of: snapshot.as_of,
    floor_usd: snapshot.floor_usd,
    rows,
    watchlist_size: onList.length,
    early_size: rows.length - onList.length,
    live_size: live,
    total_protocols: snapshot.protocols.length,
    median_implied_usd: values.length > 0 ? Math.round(median(values)) : 0,
    total_implied_usd: values.reduce((a, b) => a + b, 0),
    categories: new Set(rows.map((r) => r.category ?? '(none)')).size,
  };
  return { board, radar };
}

/** The gate's board rules, checked before anything is written. Null when the board is valid. */
export function boardIssue(board: Row[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `board holds ${board.length} rows, outside 100..4000`;
  const slugs = new Set(snapshot.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  for (const row of board) {
    if (!slugs.has(row.slug)) return `row names a protocol the snapshot does not list: ${row.slug}`;
    if (seen.has(row.slug)) return `slug appears twice: ${row.slug}`;
    seen.add(row.slug);
    if (!Number.isInteger(row.implied_value_usd) || row.implied_value_usd <= 0) return `bad implied value on ${row.slug}`;
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) return `farm_steps count on ${row.slug}`;
    for (const step of row.farm_steps) {
      const len = step.trim().length;
      if (len < 20 || len > 600) return `farm step of ${len} characters on ${row.slug}`;
    }
  }
  for (const slug of snapshot.watchlist) {
    if (!seen.has(slug)) return `watchlist protocol missing from the board: ${slug}`;
  }
  const byRank = [...board].sort((a, b) => a.rank - b.rank);
  for (let i = 0; i < byRank.length; i++) {
    if (byRank[i]!.rank !== i + 1) return 'ranks are not exactly 1..N';
    if (i > 0 && byRank[i]!.implied_value_usd > byRank[i - 1]!.implied_value_usd) return 'implied value rises as rank ascends';
  }
  if (board.length > 1 && board.every((r) => r.implied_value_usd === board[0]!.implied_value_usd)) {
    return 'every implied value is the same: the board ranks nothing';
  }
  return null;
}

/** The dashboard's data, written beside the page as data.js. */
export function dataScript(radar: Radar): string {
  return `window.RADAR_DATA = ${JSON.stringify(radar)};\n`;
}
