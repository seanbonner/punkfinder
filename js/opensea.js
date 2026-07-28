// OpenSea account (username + linked socials incl. X) via our own Pages
// Function at /api/account/{address}, which holds the API key server-side.
// Degrades to null when the function isn't running (e.g. a plain `eleventy
// --serve` with no wrangler) or the wallet has no OpenSea profile. In-memory
// cache per page session.
const cache = new Map();

export async function resolveOpenSea(address) {
  if (!address) return null;
  const key = address.toLowerCase();
  if (cache.has(key)) return cache.get(key);

  let result = null;
  try {
    const res = await fetch(`/api/account/${address}`);
    if (res.ok) {
      const d = await res.json();
      result = d.account || null;
    }
  } catch {
    // no function available — treat as "no OpenSea profile"
  }
  cache.set(key, result);
  return result;
}
