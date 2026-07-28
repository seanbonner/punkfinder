// Cloudflare Pages Function — the first server-side piece. Proxies OpenSea's
// v2 Accounts endpoint so the API key stays server-side (never in the browser),
// and returns only the public-safe, self-published bits: username, linked
// socials (X/Twitter, etc.), and website. No email, no private data (spec §7).
//
// Key comes from env.OPENSEA_API_KEY — set in .dev.vars locally, as a Pages
// secret in production. Edge-cached via cache-control; D1 cache is a later step.

export async function onRequestGet({ params, env }) {
  const address = String(params.address || "").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(address)) return json({ error: "bad address" }, 400);
  if (!env.OPENSEA_API_KEY) return json({ error: "not configured" }, 501);

  try {
    const res = await fetch(`https://api.opensea.io/api/v2/accounts/${address}`, {
      headers: { "x-api-key": env.OPENSEA_API_KEY, accept: "application/json" },
    });
    if (res.status === 404) return json({ account: null }, 200, 86400);
    if (!res.ok) return json({ error: `opensea ${res.status}` }, 502);

    const d = await res.json();
    const socials = Array.isArray(d.social_media_accounts)
      ? d.social_media_accounts
          .map((s) => ({ platform: s.platform, username: s.username }))
          .filter((s) => s.platform && s.username)
      : [];
    const hasAny = d.username || d.website || socials.length;
    const account = hasAny
      ? { username: d.username || null, website: d.website || null, socials }
      : null;
    return json({ account }, 200, 86400);
  } catch {
    return json({ error: "fetch failed" }, 502);
  }
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
