// Lookup page: enter a punk number, render V1 + V2 live from the indexer.
// First slice — real ownership, custody, and a first-pass "signs of life" line.
// KB labels, ENS/OpenSea identity, and full §6 status verdicts come next.

import { fetchPunk, fetchAccountStats } from "/js/indexer.js";

const S = window.SITE;
const $ = (sel) => document.querySelector(sel);
const ZERO = "0x0000000000000000000000000000000000000000";
const YEAR = 365.25 * 24 * 3600;
const DORMANT_AFTER = 3 * YEAR; // spec §5: dormant = 3+ years no signed activity

const short = (a) => (a && a.length > 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a || "");
const isZero = (a) => !a || a.toLowerCase() === ZERO;
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function relTime(ts) {
  if (!ts) return null;
  const secs = Date.now() / 1000 - ts;
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const units = [["year", YEAR], ["month", 2629800], ["day", 86400], ["hour", 3600]];
  for (const [unit, size] of units) {
    if (secs >= size || unit === "hour") return rtf.format(-Math.round(secs / size), unit);
  }
  return "just now";
}

// First-pass liveness from whole-wallet lastActiveAt (spec §5). Not yet the
// full §6 verdict — no identity, market, or vault signals folded in.
function liveness(stats) {
  if (!stats || stats.lastActiveAt == null) {
    return { cls: "unknown", label: "No signed activity on record" };
  }
  const age = Date.now() / 1000 - stats.lastActiveAt;
  const when = relTime(stats.lastActiveAt);
  return age > DORMANT_AFTER
    ? { cls: "dormant", label: `Dormant — last signed tx ${when}` }
    : { cls: "active", label: `Active — last signed tx ${when}` };
}

function custody(token) {
  if (!token || isZero(token.owner)) return { label: "No holder on record", native: null };
  if (token.is_wrapped) return { label: `Wrapped (${esc(token.wrapper || "wrapper")})`, native: token.native_owner };
  if (token.native_owner && token.owner.toLowerCase() !== token.native_owner.toLowerCase()) {
    return { label: "Custodied (vault/stash)", native: token.native_owner };
  }
  return { label: "Held directly", native: null };
}

function linkOuts(kind, id, owner) {
  const links = [];
  if (kind === "V2") {
    links.push([`${S.cryptopunksDetailsBase}${id}`, "cryptopunks.app"]);
    links.push([`${S.punksMarketBase}${id}`, "punksmarket"]);
  } else {
    links.push([`${S.v1cryptopunksBase}${id}`, "v1cryptopunks"]);
    links.push([`${S.punksMarketBase}${id}`, "punksmarket"]);
  }
  if (!isZero(owner)) links.push([`${S.etherscanAddressBase}${owner}`, "holder on Etherscan"]);
  return links.map(([href, label]) => `<a href="${href}" target="_blank" rel="noopener">${label} →</a>`).join("");
}

function tokenPanel(kind, id, token, stats) {
  if (!token) {
    return `<section class="token"><h3>${kind}</h3><p class="token__none">No ${kind} record found for this id.</p></section>`;
  }
  const c = custody(token);
  const life = liveness(stats);
  const holder = short(token.owner);
  const holderLink = isZero(token.owner)
    ? esc(holder)
    : `<a href="${S.etherscanAddressBase}${token.owner}" target="_blank" rel="noopener">${esc(holder)}</a>`;
  return `
    <section class="token">
      <h3>${kind}</h3>
      <dl class="token__facts">
        <dt>Holder</dt><dd>${holderLink}</dd>
        <dt>Custody</dt><dd>${c.label}${c.native ? ` <span class="muted">· native ${esc(short(c.native))}</span>` : ""}</dd>
        <dt>Signs of life</dt><dd class="life life--${life.cls}">${esc(life.label)}</dd>
      </dl>
      <p class="token__links">${linkOuts(kind, id, token.owner)}</p>
    </section>`;
}

function pairingNote(v1, v2) {
  if (!v1 || !v2 || isZero(v1.owner) || isZero(v2.owner)) return "";
  const paired = v1.owner.toLowerCase() === v2.owner.toLowerCase();
  return paired
    ? `<p class="pairing pairing--paired">🤝 V1 and V2 are held by the same wallet.</p>`
    : `<p class="pairing">Separately held — V1 and V2 are in different wallets.</p>`;
}

async function render(id) {
  const out = $("#lookup-result");
  out.hidden = false;
  if (!Number.isInteger(id) || id < 0 || id > 9999) {
    out.innerHTML = `<p class="error">Punk number must be between 0 and 9999.</p>`;
    return;
  }
  out.innerHTML = `<p class="loading">Looking up punk #${id}…</p>`;
  try {
    const { v1, v2 } = await fetchPunk(id);

    // One stats fetch per distinct beneficial owner (liveness is whole-wallet).
    const owners = [...new Set([v1?.owner, v2?.owner].filter((a) => a && !isZero(a)).map((a) => a.toLowerCase()))];
    const statsByOwner = {};
    await Promise.all(
      owners.map(async (a) => {
        try {
          statsByOwner[a] = await fetchAccountStats(a);
        } catch {
          statsByOwner[a] = null;
        }
      })
    );
    const statsFor = (t) => (t && t.owner && !isZero(t.owner) ? statsByOwner[t.owner.toLowerCase()] : null);

    out.innerHTML = `
      <article class="result">
        <header class="result__head">
          <img class="result__img" src="${S.imageBase}${id}/image?transparent=true&bg=ffffff" alt="CryptoPunk #${id}" width="120" height="120">
          <div>
            <h2>Punk #${id}</h2>
            ${pairingNote(v1, v2)}
          </div>
        </header>
        <div class="result__tokens">
          ${tokenPanel("V2", id, v2, statsFor(v2))}
          ${tokenPanel("V1", id, v1, statsFor(v1))}
        </div>
        <p class="result__note">First-pass report — ownership and liveness are live from the indexer. Identity (ENS/OpenSea), market listings, and full status verdicts are coming.</p>
      </article>`;
    out.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (err) {
    out.innerHTML = `<p class="error">Lookup failed: ${esc(err.message)}</p>`;
  }
}

function main() {
  $("#lookup-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const id = parseInt($("#lookup-id").value, 10);
    history.replaceState(null, "", `?punk=${id}`);
    render(id);
  });

  const param = new URLSearchParams(location.search).get("punk");
  if (param !== null) {
    const id = parseInt(param, 10);
    if (Number.isInteger(id) && id >= 0 && id <= 9999) {
      $("#lookup-id").value = id;
      render(id);
    }
  }
}

main();
