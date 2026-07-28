// Server-side identity enrichment via our Pages Function at
// /api/identity/{address}: OpenSea account (username/website/socials) + ENS
// text records (twitter/github/url, email already stripped server-side).
// Degrades to null when the function isn't running (plain `eleventy --serve`).
// In-memory cache per page session.
const cache = new Map();

export async function resolveProfile(address) {
  if (!address) return null;
  const key = address.toLowerCase();
  if (cache.has(key)) return cache.get(key);

  let result = null;
  try {
    const res = await fetch(`/api/identity/${address}`);
    if (res.ok) result = await res.json(); // { opensea, ens }
  } catch {
    // no function available
  }
  cache.set(key, result);
  return result;
}
