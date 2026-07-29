// Lookup page: enter a punk number, render a V1 + V2 "dossier" report live from
// the indexer. Reskinned to the .pf-* class contract in docs/DESIGN-SPEC.md.
// Data layer (ownership, custody, liveness, ENS, known-contract leads) is live;
// full §6 status verdicts fill in later. Status pill uses the canonical
// vocabulary keys (reachable/active/dormant/lost/vault/heldna/inst/burned/lead).

import { fetchPunk, fetchClaim, fetchAcquired } from "/js/indexer.js";
import { resolveActivity } from "/js/activity.js";
import { getCodeInfo } from "/js/rpc.js";
import { knownFor } from "/js/known.js";
import { resolveEns } from "/js/ens.js";
import { resolveProfile } from "/js/identity.js";
import { getTraits } from "/js/traits.js";

const S = window.SITE;
const $ = (sel) => document.querySelector(sel);
const ZERO = "0x0000000000000000000000000000000000000000";
const YEAR = 365.25 * 24 * 3600;
const DORMANT_AFTER = 3 * YEAR; // spec §5: dormant = 3+ years no signed activity

// Canonical CryptoPunks market contracts, shown as the panel contract line.
const CONTRACTS = {
  V1: "0x6Ba6f2207e343923BA692e5Cae646Fb0F566DB8D",
  V2: "0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB",
};
// Every token state has an OpenSea page — pick the contract for its wrap state.
const WRAPPER_CONTRACTS = {
  wrapped_punks: "0xb7f7F6C52F2e2fdb1963Eab30438024864c313F6", // WrappedPunks (legacy, V2)
  cryptopunks_721: "0x000000000000003607fce1aC9E043a86675C5C2F", // CryptoPunks721 (modern, V2)
  v1_wrapper: "0x282BDD42f4eb70e7A9D9F40c8fEA0825B7f68C5D", // V1 Wrapper
};
const openseaContract = (kind, token) =>
  token.is_wrapped && WRAPPER_CONTRACTS[token.wrapper] ? WRAPPER_CONTRACTS[token.wrapper] : CONTRACTS[kind];
const WRAPPER_NAMES = {
  wrapped_punks: "WrappedPunks",
  cryptopunks_721: "CryptoPunks721",
  v1_wrapper: "V1 Wrapper",
};

const short = (a) => (a && a.length > 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a || "");
const isZero = (a) => !a || a.toLowerCase() === ZERO;
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const today = () => new Date().toISOString().slice(0, 10);
const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};
const yyyymm = (secs) => (secs ? new Date(secs * 1000).toISOString().slice(0, 7) : null);

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

const evmLink = (addr, text) =>
  isZero(addr) ? esc(text || short(addr)) : `<a href="${S.evmNowAddressBase}${addr}" target="_blank" rel="noopener">${esc(text || short(addr))}</a>`;

// Status pill (canonical vocabulary key + human label). Colored by activity/
// reachability, not good/bad: blue = reachable/recently active, grey = known
// but quiet, amber = inactive, red = long inactive. `listed` (wine) and the §6
// verdicts (vault/inst/burned) land with the market + status layers.
function statusFor({ activity, isContract, ens, os }, known) {
  if (known) return { key: "known", label: `Held — ${known.label}` };
  const name = ens?.name || os?.username;
  // A contract we can name (ENS / OpenSea) is a lead, not a dead end.
  if (isContract === true) {
    return name ? { key: "reachable", label: `Held — ${name}` } : { key: "known", label: "Held — contract" };
  }
  const last = activity?.lastOutboundAt;
  const age = last != null ? Date.now() / 1000 - last : Infinity;
  const recent = age <= DORMANT_AFTER;
  if (ens || os) return { key: recent ? "reachable" : "known", label: recent ? "Reachable" : "Reachable — quiet" };
  if (recent) return { key: "active", label: "Active — anonymous" };
  if (age > 5 * YEAR) return { key: "lost", label: "Long inactive" };
  return { key: "inactive", label: "Inactive" };
}

// Signs-of-life evidence prose that sits under the status pill.
function signsProse({ activity, isContract, is7702, ens, os }, known) {
  if (known && known.category === "lending")
    return `Held by ${esc(known.label)}, a contract — transaction-based liveness doesn't apply here. See the lead below.`;
  if (isContract === true) {
    const name = ens?.name || os?.username;
    if (name) {
      const v = os?.username && os?.verified ? " (verified on OpenSea)" : "";
      return `Held in the ${esc(name)} account${v} — a smart-contract wallet, so it's reachable through that identity rather than gauged by transactions.`;
    }
    return "Holder is a contract (smart-contract wallet or protocol), not an EOA — plain-transaction activity isn't a reliable liveness signal. Follow it on evm.now.";
  }
  const smart = is7702 ? "Smart-account wallet (EIP-7702). " : "";
  const last = activity?.lastOutboundAt;
  const when = last ? relTime(last) : null;
  if (!when) return `${smart}No outbound transactions signed by this wallet on record.`;
  const state = Date.now() / 1000 - last > DORMANT_AFTER ? "Dormant" : "Active";
  return `${smart}${state} — last signed transaction ${when} (whole-wallet, any activity).`;
}

// Custody chain steps: raw market owner (wrapper/vault) → beneficial holder.
function custodySteps(token) {
  const ownerLink = evmLink(token.owner);
  if (token.is_wrapped) {
    const name = WRAPPER_NAMES[token.wrapper] || token.wrapper || "wrapper";
    return [
      { kind: `Wrapped · ${esc(name)}`, value: evmLink(token.native_owner) },
      { kind: "Wrapped-token holder", value: ownerLink },
    ];
  }
  if (token.native_owner && token.owner.toLowerCase() !== token.native_owner.toLowerCase()) {
    return [
      { kind: "Vault / stash", value: evmLink(token.native_owner) },
      { kind: "Beneficial owner", value: ownerLink },
    ];
  }
  return [{ kind: "Held wallet", value: ownerLink }];
}

// Link-outs scoped to one token — V1 and V2 have different holders, contracts,
// and marketplace pages, so each panel gets its own row.
function panelLinks(kind, id, token) {
  const links = [];
  // OpenSea has a page for every state (native, wrapped, 721) — always link it,
  // and always last. punks.auction (per-punk offers) applies to either version.
  const opensea = [`${S.openseaItemBase}${openseaContract(kind, token)}/${id}`, "opensea"];
  const auction = [`${S.punksAuctionBase}${id}`, "punks.auction"];
  if (kind === "V2") {
    links.push([`${S.cryptopunksDetailsBase}${id}`, "cryptopunks.app"], [`${S.cryptopunksEthBase}${id}`, "cryptopunks.eth"], auction, opensea);
  } else {
    // punksmarket is V1-only.
    links.push([`${S.v1cryptopunksBase}${id}`, "v1cryptopunks"], [`${S.punksMarketBase}${id}`, "punksmarket"], auction, opensea);
  }
  // Rendered like the Evidence section — a labeled bulleted list, one per line.
  return `<footer class="pf-evidence pf-markets">
    <div class="pf-evidence-label">Markets</div>
    <ul>${links.map(([href, label]) => `<li><a href="${esc(href)}" target="_blank" rel="noopener">${esc(label)}</a></li>`).join("")}</ul>
  </footer>`;
}

function tokenPanel(kind, id, token, enrich, acquiredAt) {
  const contractLine = `<div class="pf-panel-contract">${short(CONTRACTS[kind])}</div>`;
  if (!token || isZero(token.owner)) {
    return `<article class="pf-panel">
      <header class="pf-panel-head"><h2 class="pf-panel-label">${kind} Token</h2>${contractLine}</header>
      <p class="pf-signs">No ${kind} record on file for this id${token ? " (no holder)" : ""}.</p>
    </article>`;
  }

  const { ens, os, ensRecords, contractName } = enrich;
  const known = knownFor(token.owner, { codeHash: enrich.codeHash, contractName });

  // Evidence accumulator — each ref() appends a { text, href } source and
  // returns its superscript number. Every evidence item is a link to its source.
  const ev = [];
  const ref = (text, href) => (ev.push({ text, href }), `<sup class="pf-ref">${ev.length}</sup>`);

  const holderRef = ref(`evm.now/address/${short(token.owner)} · ownership (indexer)`, `${S.evmNowAddressBase}${token.owner}`);

  // Identity row — show whatever identity we have (ENS, curated label, OpenSea),
  // best first with the rest as sub-lines. No provenance-tag boxes (the values
  // already link to their source), and no "no ENS" placeholder — if there's
  // nothing, say so plainly. Refs called in visual (top-to-bottom) order.
  const signals = [];
  if (ens) {
    const av = ens.avatar
      ? `<img class="pf-ens-avatar" src="${esc(ens.avatar)}" alt="" width="16" height="16" onerror="this.style.display='none'">`
      : "";
    signals.push(`${av}${esc(ens.name)}${ref(`ENS record · ${esc(ens.name)}`, `https://app.ens.domains/${encodeURIComponent(ens.name)}`)}`);
  }
  if (known)
    signals.push(
      `${esc(known.label)}${ref(`Curated label · ${esc(known.label)}${contractName ? ` (${esc(contractName)})` : ""}`, known.url || `${S.evmNowAddressBase}${token.owner}`)}`
    );
  if (os && os.username) {
    const profileUrl = `${S.openseaAccountBase}${token.owner}`;
    signals.push(
      `<a href="${esc(profileUrl)}" target="_blank" rel="noopener">${esc(os.username)}</a>${ref(`OpenSea profile · ${esc(os.username)}`, profileUrl)}`
    );
  }
  // X handle from the ENS com.twitter text record (self-published, on-chain).
  const xHandle = ensRecords?.twitter;
  if (xHandle)
    signals.push(
      `X <a href="https://x.com/${encodeURIComponent(xHandle)}" target="_blank" rel="noopener">@${esc(xHandle)}</a>${ref(`ENS com.twitter record · @${esc(xHandle)}`, `https://x.com/${encodeURIComponent(xHandle)}`)}`
    );
  const identity = signals.length
    ? signals[0] + signals.slice(1).map((s) => `<span class="pf-sub">${s}</span>`).join("")
    : `<span class="pf-none">no known on-chain identity</span>`;

  // Status + signs + optional lead
  const st = statusFor(enrich, known);
  const signsRef = ref(`evm.now/address/${short(token.owner)}/activity · last outbound tx`, `${S.evmNowAddressBase}${token.owner}/activity`);
  const lead = known
    ? `<aside class="pf-lead"><div class="pf-lead-label">Lead · ${esc(known.label)}</div><p>${esc(known.note)} <a href="${esc(known.url)}" target="_blank" rel="noopener">${esc(hostOf(known.url))} ↗</a></p></aside>`
    : "";

  const custody = custodySteps(token)
    .map(
      (s) =>
        `<li><span class="pf-kind">${s.kind}</span>${s.value}</li>`
    )
    .join("");

  const evidence = ev
    .map((e) => `<li>${e.href ? `<a href="${esc(e.href)}" target="_blank" rel="noopener">${e.text}</a>` : e.text}</li>`)
    .join("");

  return `<article class="pf-panel">
    <header class="pf-panel-head"><h2 class="pf-panel-label">${kind} Token</h2>${contractLine}</header>

    <div class="pf-row">
      <div class="pf-row-label">Holder</div>
      <div class="pf-row-value">${evmLink(token.owner)}${holderRef}${
        acquiredAt ? `<span class="pf-sub">held since ${new Date(acquiredAt * 1000).toISOString().slice(0, 10)}</span>` : ""
      }</div>
    </div>
    <div class="pf-row">
      <div class="pf-row-label">Identity</div>
      <div class="pf-row-value">${identity}</div>
    </div>
    <div class="pf-row">
      <div class="pf-row-label">Custody</div>
      <div class="pf-row-value"><ol class="pf-custody">${custody}</ol></div>
    </div>
    <div class="pf-row">
      <div class="pf-row-label">Status</div>
      <div class="pf-row-value">
        <div class="pf-status-block"><span class="pf-status pf-status--${st.key}">${esc(st.label)}</span></div>
        <p class="pf-signs"><strong>Signs of life:</strong> ${signsProse(enrich, known)}${signsRef}</p>
        ${lead}
      </div>
    </div>

    <footer class="pf-evidence">
      <div class="pf-evidence-label">Evidence</div>
      <ol>${evidence}</ol>
    </footer>

    ${panelLinks(kind, id, token)}
  </article>`;
}

function caseHead(id, v1, v2, traits, imgSrc) {
  let custody = "—";
  if (v1 && v2 && !isZero(v1.owner) && !isZero(v2.owner)) {
    custody = v1.owner.toLowerCase() === v2.owner.toLowerCase() ? "SAME CUSTODY (paired)" : "SPLIT CUSTODY";
  }
  const eyebrow = traits ? `Case #${id} · ${esc(traits.t)}` : `Case #${id} · CryptoPunk · V1 + V2`;
  const attrs =
    traits && traits.a?.length
      ? `<div class="pf-case-attrs">${traits.a.map((a) => `<span>${esc(a)}</span>`).join("")}</div>`
      : "";
  // Local render (PNG data URI); fall back to the cryptopunks.app image only if
  // the pixel bundle didn't load.
  const src = imgSrc || `${S.imageBase}${id}/image?transparent=true&bg=f0efeb`;
  return `<section class="pf-case-head">
    <img class="pf-punk-img" src="${src}" alt="CryptoPunk #${id}" width="88" height="88">
    <div class="pf-case-title">
      <div class="pf-case-eyebrow">${eyebrow}</div>
      <h1 class="pf-case-id">Punk ${id}</h1>
      ${attrs}
    </div>
    <div class="pf-case-meta">
      V1 &amp; V2 <strong>${custody}</strong><br>
      Last checked <strong>${today()}</strong><br>
      Source <strong>LIVE INDEXER</strong>
    </div>
  </section>`;
}

function claimLine(claim, claimerEns) {
  if (!claim || !claim.at) return "";
  const date = new Date(claim.at * 1000).toISOString().slice(0, 10);
  // Show the original claimer's ENS name when they have one, else the address.
  const by = claim.by && !isZero(claim.by) ? ` · originally claimed by ${evmLink(claim.by, claimerEns?.name)}` : "";
  return `<div class="pf-claim">Claimed <strong>${date}</strong>${by}</div>`;
}

async function enrichOwners(v1, v2) {
  const owners = [...new Set([v1?.owner, v2?.owner].filter((a) => a && !isZero(a)).map((a) => a.toLowerCase()))];
  const by = {};
  await Promise.all(
    owners.map(async (a) => {
      const [activity, codeInfo, ens, profile] = await Promise.all([
        resolveActivity(a).catch(() => null),
        getCodeInfo(a).catch(() => null),
        resolveEns(a).catch(() => null),
        resolveProfile(a).catch(() => null),
      ]);
      by[a] = {
        activity,
        isContract: codeInfo?.isContract ?? null,
        codeHash: codeInfo?.codeHash ?? null,
        contractName: codeInfo?.contractName ?? null,
        is7702: codeInfo?.is7702 ?? false,
        ens,
        os: profile?.opensea ?? null,
        ensRecords: profile?.ens ?? null,
      };
    })
  );
  return (t) => (t && t.owner && !isZero(t.owner) ? by[t.owner.toLowerCase()] : {});
}

async function render(id) {
  const out = $("#pf-results");
  if (!Number.isInteger(id) || id < 0 || id > 9999) {
    out.innerHTML = `<p class="pf-note"><strong>Enter a punk number, 0–9999.</strong> Wallet-address lookup is coming soon.</p>`;
    return;
  }
  out.innerHTML = `<p class="pf-loading">> resolving punk #${id}…</p>`;
  try {
    const { v1, v2 } = await fetchPunk(id);
    if (!v1 && !v2) {
      out.innerHTML = `<p class="pf-note"><strong>Case #${id} · not found.</strong> No V1 or V2 record for this id. Try another punk number, 0–9999.</p>`;
      return;
    }
    const [enrichFor, claim, traits, acquired] = await Promise.all([
      enrichOwners(v1, v2),
      fetchClaim(id).catch(() => null),
      getTraits(id).catch(() => null),
      fetchAcquired(id).catch(() => null),
    ]);
    const claimerEns = claim?.by && !isZero(claim.by) ? await resolveEns(claim.by).catch(() => null) : null;
    out.innerHTML =
      caseHead(id, v1, v2, traits) +
      claimLine(claim, claimerEns) +
      `<section class="pf-panels">${tokenPanel("V2", id, v2, enrichFor(v2), acquired?.v2)}${tokenPanel("V1", id, v1, enrichFor(v1), acquired?.v1)}</section>`;
    out.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (err) {
    out.innerHTML = `<p class="pf-note"><strong>Lookup failed.</strong> ${esc(err.message)}</p>`;
  }
}

function main() {
  const input = $("#pf-input");
  $("#lookup-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const raw = input.value.trim();
    const id = parseInt(raw, 10);
    history.replaceState(null, "", `?punk=${raw}`);
    render(id);
  });

  const param = new URLSearchParams(location.search).get("punk");
  if (param !== null) {
    const id = parseInt(param, 10);
    if (Number.isInteger(id) && id >= 0 && id <= 9999) {
      input.value = id;
      render(id);
    }
  }
}

main();
