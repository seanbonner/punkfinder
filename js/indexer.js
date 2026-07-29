// Live queries against the public punks indexer. No API key required, so the
// browser hits it directly — the whole lookup is client-side for now. Server
// (Pages Functions + D1) only enters the picture later for keyed enrichment
// (OpenSea, ENS caching). See build spec §2.

const INDEXER = window.SITE?.indexerUrl || "https://indexer.punksmarket.app";

async function gql(query, variables) {
  const res = await fetch(INDEXER, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Indexer returned ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  return json.data;
}

// One id, both tokens. `owner` is the indexer's beneficial holder (already
// pierced past wrappers); `native_owner` is the raw market owner (a wrapper
// contract when wrapped). See spec §2 reuse table.
const PUNK_QUERY = `
  query Punk($id: BigInt!) {
    punks(where: { punk_id: $id }) {
      items { punk_id owner native_owner native_standard is_wrapped wrapper }
    }
    v1Punks(where: { punk_id: $id }) {
      items { punk_id owner native_owner is_wrapped wrapper }
    }
  }
`;

export async function fetchPunk(id) {
  const data = await gql(PUNK_QUERY, { id: String(id) });
  return {
    v2: data.punks?.items?.[0] || null,
    v1: data.v1Punks?.items?.[0] || null,
  };
}

// Original claim: the first `assign` event on the V1 contract — when the punk
// was first claimed, and by whom. This is the deepest provenance point.
const CLAIM_QUERY = `
  query Claim($id: BigInt!) {
    events(where: { punk_id: $id, type: "assign", source: "cryptopunks_v1" }, orderBy: "timestamp", orderDirection: "asc", limit: 1) {
      items { to timestamp }
    }
  }
`;

export async function fetchClaim(id) {
  const data = await gql(CLAIM_QUERY, { id: String(id) });
  const it = data.events?.items?.[0];
  return it ? { at: Number(it.timestamp), by: it.to } : null;
}

// When the current holder acquired each token — the most recent ownership event
// (assign/transfer/sale) per version. A punk sitting still in an active wallet
// isn't lost; it's held, and this says since when.
const ACQUIRED_QUERY = `
  query Acquired($id: BigInt!) {
    v2: events(where: { punk_id: $id, type_in: ["assign","transfer","sale"], source_in: ["cryptopunks_v2","wrapped_punks","cryptopunks_721"] }, orderBy: "timestamp", orderDirection: "desc", limit: 1) { items { timestamp } }
    v1: events(where: { punk_id: $id, type_in: ["assign","transfer","sale"], source_in: ["cryptopunks_v1","v1_wrapper"] }, orderBy: "timestamp", orderDirection: "desc", limit: 1) { items { timestamp } }
  }
`;

export async function fetchAcquired(id) {
  const data = await gql(ACQUIRED_QUERY, { id: String(id) });
  const at = (x) => (x?.items?.[0]?.timestamp ? Number(x.items[0].timestamp) : null);
  return { v1: at(data.v1), v2: at(data.v2) };
}

// Total punks (V1 + V2) a wallet holds beneficially — for the "also holds N
// CryptoPunks" hint. Uses the indexer's totalCount on the owner filter.
const HOLDINGS_QUERY = `
  query Holdings($addr: String!) {
    punks(where: { owner: $addr }) { totalCount }
    v1Punks(where: { owner: $addr }) { totalCount }
  }
`;

// Counts are on the beneficial `owner`, so wrapped/vaulted/stashed punks are
// already included on the correct side (V1 vs V2).
export async function fetchHoldings(address) {
  const data = await gql(HOLDINGS_QUERY, { addr: address.toLowerCase() });
  return { v2: data.punks?.totalCount ?? 0, v1: data.v1Punks?.totalCount ?? 0 };
}

// Whole-wallet liveness. `lastActiveAt` tracks tx-from on the EOA — any signed
// transaction, not just punk activity (spec §5). The spend/earn aggregates in
// the same response ARE punk-scoped; we ignore them here.
export async function fetchAccountStats(address) {
  const url = new URL(`${INDEXER}/accounts/stats`);
  url.searchParams.set("addresses", address);
  url.searchParams.set("eoa", address);
  url.searchParams.set("scope", "v2");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Indexer stats returned ${res.status}`);
  const raw = await res.json();
  return {
    lastActiveAt: raw.lastActiveAt == null ? null : Number(raw.lastActiveAt),
    firstSeenAt: raw.firstSeenAt == null ? null : Number(raw.firstSeenAt),
  };
}
