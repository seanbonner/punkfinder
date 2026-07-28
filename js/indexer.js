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
