// ENS reverse resolution: address -> primary name + avatar. Uses the ensideas
// public resolver (forward-verified, CORS-enabled) as a stopgap. Spec §5/§9
// moves this to a Pages Function using viem with a D1 cache; the interface here
// (resolveEns) stays the same when that swap happens. In-memory cache per page
// session so repeat holders don't refetch.
const cache = new Map();

export async function resolveEns(address) {
  if (!address) return null;
  const key = address.toLowerCase();
  if (cache.has(key)) return cache.get(key);

  let result = null;
  try {
    const res = await fetch(`https://api.ensideas.com/ens/resolve/${address}`);
    if (res.ok) {
      const d = await res.json();
      if (d && d.name) result = { name: d.name, avatar: d.avatar || null };
    }
  } catch {
    // network/resolver miss — treat as "no ENS", never block the report
  }
  cache.set(key, result);
  return result;
}
