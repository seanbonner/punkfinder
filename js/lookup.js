// Lookup page: enter a punk number, render a V1 + V2 "dossier" report live from
// the indexer. Reskinned to the .pf-* class contract in docs/DESIGN-SPEC.md.
// Data layer (ownership, custody, liveness, ENS, known-contract leads) is live;
// full §6 status verdicts fill in later. Status pill uses the canonical
// vocabulary keys (reachable/active/dormant/lost/vault/heldna/inst/burned/lead).

import { fetchPunk, fetchAccountStats, fetchClaim } from "/js/indexer.js";
import { getCodeInfo } from "/js/rpc.js";
import { knownFor } from "/js/known.js";
import { resolveEns } from "/js/ens.js";

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
function statusFor({ stats, isContract, ens }, known) {
  if (known) return { key: "known", label: `Held — ${known.label}` };
  if (isContract === true) return { key: "known", label: "Held — contract" };
  const last = stats?.lastActiveAt;
  const age = last != null ? Date.now() / 1000 - last : Infinity;
  const recent = age <= DORMANT_AFTER;
  if (ens) return { key: recent ? "reachable" : "known", label: recent ? "Reachable" : "Reachable — quiet" };
  if (recent) return { key: "active", label: "Active — anonymous" };
  if (age > 5 * YEAR) return { key: "lost", label: "Long inactive" };
  return { key: "inactive", label: "Inactive" };
}

// Signs-of-life evidence prose that sits under the status pill.
function signsProse({ stats, isContract, is7702 }, known) {
  if (known && known.category === "lending")
    return `Held by ${esc(known.label)}, a contract — transaction-based liveness doesn't apply here. See the lead below.`;
  if (isContract === true)
    return "Holder is a contract (smart-contract wallet or protocol), not an EOA — plain-transaction activity isn't a reliable liveness signal. Follow it on evm.now.";
  const smart = is7702 ? "Smart-account wallet (EIP-7702). " : "";
  const first = yyyymm(stats?.firstSeenAt);
  const when = stats?.lastActiveAt ? relTime(stats.lastActiveAt) : null;
  if (!when) return `${smart}No signed transactions on record${first ? `; wallet first seen ${first}` : ""}.`;
  const state = Date.now() / 1000 - stats.lastActiveAt > DORMANT_AFTER ? "Dormant" : "Active";
  return `${smart}${state} — last signed transaction ${when}${first ? `; first seen ${first}` : ""}.`;
}

// Custody chain steps: raw market owner (wrapper/vault) → beneficial holder.
function custodySteps(token) {
  const ownerLink = evmLink(token.owner);
  if (token.is_wrapped) {
    const name = WRAPPER_NAMES[token.wrapper] || token.wrapper || "wrapper";
    return [
      { kind: `Wrapped · ${esc(name)}`, value: evmLink(token.native_owner), tag: "wrapper" },
      { kind: "Wrapped-token holder", value: ownerLink },
    ];
  }
  if (token.native_owner && token.owner.toLowerCase() !== token.native_owner.toLowerCase()) {
    return [
      { kind: "Vault / stash", value: evmLink(token.native_owner) },
      { kind: "Beneficial owner", value: ownerLink },
    ];
  }
  return [{ kind: "Held wallet", value: ownerLink, tag: "direct" }];
}

function tokenPanel(kind, token, enrich) {
  const contractLine = `<div class="pf-panel-contract">${short(CONTRACTS[kind])}</div>`;
  if (!token || isZero(token.owner)) {
    return `<article class="pf-panel">
      <header class="pf-panel-head"><h2 class="pf-panel-label">${kind} Token</h2>${contractLine}</header>
      <p class="pf-signs">No ${kind} record on file for this id${token ? " (no holder)" : ""}.</p>
    </article>`;
  }

  const { ens, isContract, is7702, contractName } = enrich;
  const known = knownFor(token.owner, { codeHash: enrich.codeHash, contractName });

  // Evidence accumulator — each ref() appends a source and returns its number.
  const ev = [];
  const ref = (source) => (ev.push(source), `<sup class="pf-ref">${ev.length}</sup>`);

  const holderRef = ref(`${evmLink(token.owner, `evm.now/address/${short(token.owner)}`)} · ownership + activity via indexer`);

  // Identity row
  let identity;
  if (ens) {
    const av = ens.avatar
      ? `<img class="pf-ens-avatar" src="${esc(ens.avatar)}" alt="" width="16" height="16" onerror="this.style.display='none'">`
      : "";
    const ensRef = ref(`ENS reverse record · ${esc(ens.name)}`);
    identity = `${av}${esc(ens.name)}<span class="pf-tag">ENS</span>${ensRef}`;
    if (known) identity += `<span class="pf-sub">${esc(known.label)}<span class="pf-tag">curated</span></span>`;
  } else if (known) {
    const kRef = ref(`Curated label · ${esc(known.label)}${contractName ? ` (${esc(contractName)})` : ""}`);
    identity = `${esc(known.label)}<span class="pf-tag">curated</span>${kRef}<span class="pf-sub">No ENS on this address.</span>`;
  } else {
    const note = isContract ? "contract, no ENS" : is7702 ? "smart account, no ENS" : "no ENS, no curated label";
    identity = `— ${note}<span class="pf-tag">on-chain</span>`;
  }

  // Status + signs + optional lead
  const st = statusFor(enrich, known);
  const signsRef = ref("Indexer /accounts/stats · whole-wallet lastActiveAt");
  const lead = known
    ? `<aside class="pf-lead"><div class="pf-lead-label">Lead · ${esc(known.label)}</div><p>${esc(known.note)} <a href="${esc(known.url)}" target="_blank" rel="noopener">${esc(hostOf(known.url))} ↗</a></p></aside>`
    : "";

  const custody = custodySteps(token)
    .map(
      (s) =>
        `<li><span class="pf-kind">${s.kind}</span>${s.value}${s.tag ? ` <span class="pf-tag">${s.tag}</span>` : ""}</li>`
    )
    .join("");

  const evidence = ev.map((s) => `<li>${s}</li>`).join("");

  return `<article class="pf-panel">
    <header class="pf-panel-head"><h2 class="pf-panel-label">${kind} Token</h2>${contractLine}</header>

    <div class="pf-row">
      <div class="pf-row-label">Holder</div>
      <div class="pf-row-value">${evmLink(token.owner)}<span class="pf-tag">indexer</span>${holderRef}</div>
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
  </article>`;
}

function caseHead(id, v1, v2) {
  let custody = "—";
  if (v1 && v2 && !isZero(v1.owner) && !isZero(v2.owner)) {
    custody = v1.owner.toLowerCase() === v2.owner.toLowerCase() ? "SAME CUSTODY (paired)" : "SPLIT CUSTODY";
  }
  return `<section class="pf-case-head">
    <img class="pf-punk-img" src="${S.imageBase}${id}/image?transparent=true&bg=f0efeb" alt="CryptoPunk #${id}" width="88" height="88">
    <div class="pf-case-title">
      <div class="pf-case-eyebrow">Case #${id} · CryptoPunk · V1 + V2</div>
      <h1 class="pf-case-id">Punk ${id}</h1>
    </div>
    <div class="pf-case-meta">
      V1 &amp; V2 <strong>${custody}</strong><br>
      Last checked <strong>${today()}</strong><br>
      Source <strong>LIVE INDEXER</strong>
    </div>
  </section>`;
}

function claimLine(claim) {
  if (!claim || !claim.at) return "";
  const date = new Date(claim.at * 1000).toISOString().slice(0, 10);
  const by = claim.by && !isZero(claim.by) ? ` · originally claimed by ${evmLink(claim.by)}` : "";
  return `<div class="pf-claim">Claimed <strong>${date}</strong>${by}</div>`;
}

function linkOuts(id, v2Owner) {
  const links = [
    [`${S.cryptopunksDetailsBase}${id}`, `cryptopunks.app/${id}`],
    [`${S.punksMarketBase}${id}`, `punks.market/${id}`],
    [`${S.openseaItemBase}${CONTRACTS.V2}/${id}`, `opensea/${id}`],
  ];
  if (v2Owner && !isZero(v2Owner)) links.push([`${S.evmNowAddressBase}${v2Owner}`, "evm.now/holder"]);
  return `<nav class="pf-linkouts" aria-label="Open in">${links
    .map(([href, label]) => `<a href="${href}" target="_blank" rel="noopener">${esc(label)}<span class="pf-arrow">↗</span></a>`)
    .join("")}</nav>`;
}

async function enrichOwners(v1, v2) {
  const owners = [...new Set([v1?.owner, v2?.owner].filter((a) => a && !isZero(a)).map((a) => a.toLowerCase()))];
  const by = {};
  await Promise.all(
    owners.map(async (a) => {
      const [stats, codeInfo, ens] = await Promise.all([
        fetchAccountStats(a).catch(() => null),
        getCodeInfo(a).catch(() => null),
        resolveEns(a).catch(() => null),
      ]);
      by[a] = {
        stats,
        isContract: codeInfo?.isContract ?? null,
        codeHash: codeInfo?.codeHash ?? null,
        contractName: codeInfo?.contractName ?? null,
        is7702: codeInfo?.is7702 ?? false,
        ens,
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
    const [enrichFor, claim] = await Promise.all([enrichOwners(v1, v2), fetchClaim(id).catch(() => null)]);
    out.innerHTML =
      caseHead(id, v1, v2) +
      claimLine(claim) +
      `<section class="pf-panels">${tokenPanel("V2", v2, enrichFor(v2))}${tokenPanel("V1", v1, enrichFor(v1))}</section>` +
      linkOuts(id, v2?.owner || v1?.owner);
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
