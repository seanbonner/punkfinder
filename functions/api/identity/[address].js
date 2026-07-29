// Cloudflare Pages Function — server-side identity enrichment, keyed sources
// kept off the client. Returns only public-safe, self-published fields:
//   - opensea: username / website / linked socials (via OpenSea v2, API key)
//   - ens:     twitter / github / url text records (via ensdata.net)
//
// Email is deliberately NEVER extracted or returned — ensdata.net includes it
// in its payload, but we drop it here so it never reaches the browser or gets
// stored (spec §7 + house rule: don't fetch or surface contact info).
//
// The linked X handle comes from the ENS com.twitter record, not OpenSea:
// OpenSea's API almost never populates social_media_accounts, and its profile
// page renders socials client-side (not scrapable server-side). ENS text
// records are on-chain and reliable.
//
// Caching: a real result (or a genuine "no profile") caches for a day; a
// TRANSIENT failure (rate limit / upstream 5xx / network) caches only briefly,
// so one throttled call can't pin a false "no known identity" for a day.

export async function onRequestGet({ params, env }) {
  const address = String(params.address || "").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(address)) return json({ error: "bad address" }, 400);

  const [opensea, ens] = await Promise.all([fetchOpenSea(address, env), fetchEnsRecords(address)]);
  const transient = opensea.error || ens.error;
  return json({ opensea: opensea.data, ens: ens.data }, 200, transient ? 30 : 86400);
}

// Each fetcher returns { data, error }: error=true only for a transient failure
// (429 / 5xx / network); a 404 or empty payload is a genuine "nothing here".
async function fetchOpenSea(address, env) {
  if (!env.OPENSEA_API_KEY) return { data: null, error: false };
  try {
    const res = await fetch(`https://api.opensea.io/api/v2/accounts/${address}`, {
      headers: { "x-api-key": env.OPENSEA_API_KEY, accept: "application/json" },
    });
    if (res.status === 429 || res.status >= 500) return { data: null, error: true };
    if (!res.ok) return { data: null, error: false };
    const d = await res.json();
    const socials = Array.isArray(d.social_media_accounts)
      ? d.social_media_accounts.map((s) => ({ platform: s.platform, username: s.username })).filter((s) => s.platform && s.username)
      : [];
    const data =
      d.username || d.website || socials.length
        ? { username: d.username || null, website: d.website || null, verified: !!d.is_verified, socials }
        : null;
    return { data, error: false };
  } catch {
    return { data: null, error: true };
  }
}

async function fetchEnsRecords(address) {
  try {
    const res = await fetch(`https://ensdata.net/${address}`, { headers: { accept: "application/json" } });
    if (res.status === 429 || res.status >= 500) return { data: null, error: true };
    if (!res.ok) return { data: null, error: false };
    const d = await res.json();
    // ONLY self-published public handles/urls. Never email or contact fields.
    const twitter = cleanHandle(d.twitter, /(twitter|x)\.com/i);
    const github = cleanHandle(d.github, /github\.com/i);
    const url = typeof d.url === "string" && /^https?:\/\//.test(d.url) ? d.url : null;
    return { data: twitter || github || url ? { twitter, github, url } : null, error: false };
  } catch {
    return { data: null, error: true };
  }
}

function cleanHandle(v, hostRe) {
  if (!v || typeof v !== "string") return null;
  let h = v.trim().replace(/^@/, "");
  if (/^https?:\/\//i.test(h)) h = h.replace(new RegExp(`^https?://(www\\.)?${hostRe.source}/`, "i"), "").replace(/[/?#].*$/, "");
  return /^[A-Za-z0-9_.-]{1,40}$/.test(h) ? h : null;
}

function json(obj, status = 200, cacheSeconds = 0) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json",
      ...(cacheSeconds ? { "cache-control": `public, max-age=${cacheSeconds}` } : {}),
    },
  });
}
