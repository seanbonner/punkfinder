// Whole-wallet liveness: the wallet's most recent OUTBOUND (owner-signed)
// transaction, from a whole-chain source (Blockscout — keyless, CORS-enabled).
//
// The punk indexer's lastActiveAt only sees punk-related transactions, so it
// under-reports liveness for wallets active outside punks (e.g. it returns null
// for a wallet whose only signed tx wasn't a punk move). This is the real
// "is anyone home" signal (spec §5): any signed tx counts. Incoming transfers
// don't — those aren't the owner acting — so we look only at outbound.
const cache = new Map();

export async function resolveActivity(address) {
  if (!address) return null;
  const key = address.toLowerCase();
  if (cache.has(key)) return cache.get(key);

  let result = null;
  try {
    const res = await fetch(`https://eth.blockscout.com/api/v2/addresses/${address}/transactions?filter=from`);
    if (res.ok) {
      const d = await res.json();
      const last = d.items?.[0]?.timestamp; // newest-first
      result = { lastOutboundAt: last ? Math.floor(new Date(last).getTime() / 1000) : null };
    }
  } catch {
    // source unavailable — leave null (unknown)
  }
  cache.set(key, result);
  return result;
}
