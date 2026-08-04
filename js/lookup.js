// Lookup page: enter a punk number, render a V1 + V2 "dossier" report live from
// the indexer. Reskinned to the .pf-* class contract in docs/DESIGN-SPEC.md.
// Data layer (ownership, custody, liveness, ENS, known-contract leads) is live;
// full §6 status verdicts fill in later. Status pill uses the canonical
// vocabulary keys (reachable/active/dormant/lost/vault/heldna/inst/burned/lead).

import { fetchPunk, fetchClaim, fetchAcquired, fetchHoldings } from "/js/indexer.js";
import { resolveActivity } from "/js/activity.js";
import { getCodeInfo } from "/js/rpc.js";
import { knownFor } from "/js/known.js";
import { resolveEns } from "/js/ens.js";
import { resolveProfile } from "/js/identity.js";
import { getTraits } from "/js/traits.js";
import { fetchCurated } from "/js/curated.js";

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

// CryptoPunks anomalies: three "out of range" V1-only tokens claimed above
// 10,000 (incl. the max uint256). Burned punks are handled purely from the
// curated BurnedPunks list (by id), not by inspecting wallets.
const MAX_UINT256 = "115792089237316195423570985008687907853269984665640564039457584007913129639935";
const displayId = (id) => (String(id) === MAX_UINT256 ? "2²⁵⁶−1" : String(id));
const punkLink = (id, text) => `<a href="/?punk=${encodeURIComponent(id)}">${esc(text ?? id)}</a>`;
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
function statusFor({ activity, isContract, ens, os }, known, museum, vault, acquiredAt) {
  if (museum) return { key: "inst", label: `Held — ${museum.name}` };
  // A known vault overrides the activity tiers below — these wallets are built
  // to sit still, so dormancy here is deliberate custody, not a lost punk.
  if (vault) return { key: "vault", label: `Held — ${vault.label} · vaulted` };
  if (known) return { key: "known", label: `Held — ${known.label}` };
  const name = ens?.name || os?.username;
  // A contract we can name (ENS / OpenSea) is a lead, not a dead end.
  if (isContract === true) {
    return name ? { key: "reachable", label: `Held — ${name}` } : { key: "known", label: "Held — contract" };
  }
  const now = Date.now() / 1000;
  const last = activity?.lastOutboundAt;
  const recent = last != null && now - last <= DORMANT_AFTER;
  // A recent acquisition is proof of life on its own — a punk that just changed
  // hands isn't lost, whatever the wallet's own outbound history looks like.
  const acquiredRecently = acquiredAt != null && now - acquiredAt <= 2 * YEAR;
  // Reachable through an identity regardless of transaction cadence.
  if (ens || os) return { key: recent ? "reachable" : "known", label: recent ? "Reachable" : "Reachable — quiet" };
  // Never signed an outbound transaction — a receive-only / cold wallet, not the
  // same as a wallet that has gone quiet for years. Don't file it under "lost".
  if (last == null) return { key: "known", label: "Held — no outbound activity" };
  if (recent) return { key: "active", label: "Active — anonymous" };
  // Long-dormant, but a recent inbound rules out "possibly lost".
  if (now - last > 5 * YEAR && !acquiredRecently) return { key: "lost", label: "Long inactive" };
  return { key: "inactive", label: "Inactive" };
}

// Signs-of-life evidence prose that sits under the status pill.
function signsProse({ activity, isContract, is7702, ens, os }, known, museum, vault) {
  if (museum) {
    const custodian = ens?.name || os?.username;
    return `In the permanent collection of ${esc(museum.name)} — ${
      custodian ? `custodied on-chain by ${esc(custodian)}` : "custodied on-chain by a wallet with no public identity"
    }.`;
  }
  if (vault)
    return `Held in ${esc(vault.label)}, a known long-term vault. Wallets like this are built to sit still — the absence of outbound transactions is deliberate cold storage, not a sign the punk is lost or unreachable.`;
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
  if (!when)
    return `${smart}No outbound transactions signed by this wallet on record — typically a receive-only or cold wallet, not a sign the punk is lost.`;
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
  if (kind === "V2") {
    // punks.auction currently lists V2 only.
    links.push(
      [`${S.cryptopunksDetailsBase}${id}`, "cryptopunks.app"],
      [`${S.cryptopunksEthBase}${id}`, "cryptopunks.eth"],
      [`${S.punksAuctionBase}${id}`, "punks.auction"],
      opensea
    );
  } else {
    // punksmarket is V1-only.
    links.push([`${S.v1cryptopunksBase}${id}`, "v1cryptopunks"], [`${S.punksMarketBase}${id}`, "punksmarket"], opensea);
  }
  // Rendered like the Evidence section — a labeled bulleted list, one per line.
  return `<footer class="pf-evidence pf-markets">
    <div class="pf-evidence-label">Markets</div>
    <ul>${links.map(([href, label]) => `<li><a href="${esc(href)}" target="_blank" rel="noopener">${esc(label)}</a></li>`).join("")}</ul>
  </footer>`;
}

function tokenPanel(kind, id, token, enrich, acquiredAt, otherExists, curated) {
  const contractLine = `<div class="pf-panel-contract">${short(CONTRACTS[kind])}</div>`;
  const wrap = (inner) =>
    `<article class="pf-panel"><header class="pf-panel-head"><h2 class="pf-panel-label">${kind} Token</h2>${contractLine}</header>${inner}</article>`;

  // Burned — from the curated BurnedPunks list, keyed by punk id (the list is
  // the source of truth; update it there and it reflects here). Burns are of the
  // canonical V2 token.
  const burnedInfo = kind === "V2" ? curated?.burned?.[id] : null;
  if (burnedInfo) {
    const base = curated?.burnedBase || "https://burnedpunks.com/";
    const mus = curated?.museum?.[id]; // some burns are on display at a museum
    const musBase = curated?.museumBase || "https://museumpunks.com/";
    const intent = (burnedInfo.intent || "").trim();
    const burnLine = `${intent ? intent[0].toUpperCase() + intent.slice(1) + " burn" : "Burned"}${burnedInfo.by ? ` by ${esc(burnedInfo.by)}` : ""}.`;
    const museumLine = mus ? `<p class="pf-signs">On display at ${esc(mus.name)}.</p>` : "";
    const holder = token?.owner;
    const holderRow = holder
      ? `<div class="pf-row"><div class="pf-row-label">Holder</div><div class="pf-row-value">${evmLink(holder)}</div></div>`
      : "";
    const evItems = [];
    if (holder)
      evItems.push(`<li><a href="${S.evmNowAddressBase}${holder}" target="_blank" rel="noopener">evm.now/address/${short(holder)} · holder</a></li>`);
    evItems.push(`<li><a href="${esc(base + id)}" target="_blank" rel="noopener">burnedpunks.com/${esc(id)} · burn record</a></li>`);
    if (mus) evItems.push(`<li><a href="${esc(musBase + id)}" target="_blank" rel="noopener">museumpunks.com/${esc(id)} · museum record</a></li>`);
    return wrap(`
      ${holderRow}
      <div class="pf-row"><div class="pf-row-label">Status</div><div class="pf-row-value">
        <div class="pf-status-block"><span class="pf-status pf-status--burned">Burned</span></div>
        <p class="pf-signs">${burnLine}</p>
        ${museumLine}
      </div></div>
      <footer class="pf-evidence"><div class="pf-evidence-label">Evidence</div>
        <ol>${evItems.join("")}</ol>
      </footer>`);
  }

  // No record on this contract — the V1/V2 anomalies. Both facts are told on
  // either anomaly page, worded for the token you're looking at.
  if (!token) {
    const v2onlyIds = `${punkLink("1416")}, ${punkLink("1838")}, and ${punkLink("1841")}`;
    const v1onlyIds = `${punkLink("76623", "#76623")}, ${punkLink("9845944", "#9845944")}, and ${punkLink(MAX_UINT256)}`;
    if (otherExists && kind === "V1") {
      return wrap(
        `<p class="pf-signs">#${esc(displayId(id))} exists only on the canonical V2 contract. It was never claimed on the V1 contract so there is no V1 token for it. Only three punks are like this: ${v2onlyIds}.</p>` +
          `<p class="pf-signs">Separately, three tokens were claimed on the V1 contract above 10,000. These "out of range" claims have no associated punk and are not reflected on the V2 contract: ${v1onlyIds}.</p>`
      );
    }
    if (otherExists && kind === "V2") {
      return wrap(
        `<p class="pf-signs">#${esc(displayId(id))} is one of three tokens that were claimed on the V1 contract above 10,000. These "out of range" claims have no associated punk and are not reflected on the V2 contract: ${v1onlyIds}.</p>` +
          `<p class="pf-signs">The reverse also happens — three punks exist only on the canonical V2 contract, never claimed on V1: ${v2onlyIds}.</p>`
      );
    }
    return wrap(`<p class="pf-signs">No ${kind} record on file for this id.</p>`);
  }

  // Present but at the null address (an undocumented burn) — no active holder.
  if (isZero(token.owner)) {
    return wrap(
      `<p class="pf-signs">No active holder — this token sits at the null address. A documented burn would appear on <a href="https://burnedpunks.com/${esc(id)}" target="_blank" rel="noopener">burnedpunks.com</a>.</p>`
    );
  }

  const { ens, os, ensRecords, contractName } = enrich;
  const known = knownFor(token.owner, { codeHash: enrich.codeHash, contractName });
  // Museum holdings are the canonical V2 token (the punk-level banner adds the
  // link/story); mark the status institutional.
  const museum = kind === "V2" ? curated?.museum?.[id] : null;
  // Known vault wallet (from LostPunks' curated labels) — reframes dormancy as
  // deliberate custody. Applies to either version, keyed on the beneficial owner.
  const vault = curated?.vaults?.[token.owner?.toLowerCase()] || null;

  // Evidence accumulator — each ref() appends a { text, href } source and
  // returns its superscript number. Every evidence item is a link to its source.
  const ev = [];
  const ref = (text, href) => (ev.push({ text, href }), `<sup class="pf-ref">${ev.length}</sup>`);

  const holderRef = ref(`evm.now/address/${short(token.owner)} · ownership (indexer)`, `${S.evmNowAddressBase}${token.owner}`);

  // Identity row — for a museum piece it's the institution itself (the on-chain
  // custody wallet is noted in the signs line, not treated as the owner).
  // Otherwise show whatever we have (ENS, curated label, OpenSea), best first,
  // or say plainly there's nothing. No tag boxes; values link to their source.
  const museumBase = curated?.museumBase || "https://museumpunks.com/";
  let identity;
  if (museum) {
    identity = `${esc(museum.name)}${ref(`museumpunks.com/${id} · museum record`, `${museumBase}${id}`)}`;
  } else {
    const signals = [];
    if (ens) {
      const av = ens.avatar
        ? `<img class="pf-ens-avatar" src="${esc(ens.avatar)}" alt="" width="16" height="16" onerror="this.style.display='none'">`
        : "";
      signals.push(`${av}${esc(ens.name)}${ref(`ENS record · ${esc(ens.name)}`, `https://app.ens.domains/${encodeURIComponent(ens.name)}`)}`);
    }
    if (vault && (!ens || ens.name.toLowerCase() !== vault.label.toLowerCase()))
      signals.push(
        `${esc(vault.label)}${ref(`Curated vault label · ${esc(vault.label)}`, `${S.evmNowAddressBase}${token.owner}`)}`
      );
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
    const xHandle = ensRecords?.twitter;
    if (xHandle)
      signals.push(
        `X <a href="https://x.com/${encodeURIComponent(xHandle)}" target="_blank" rel="noopener">@${esc(xHandle)}</a>${ref(`ENS com.twitter record · @${esc(xHandle)}`, `https://x.com/${encodeURIComponent(xHandle)}`)}`
      );
    identity = signals.length
      ? signals[0] + signals.slice(1).map((s) => `<span class="pf-sub">${s}</span>`).join("")
      : `<span class="pf-none">no known on-chain identity</span>`;
  }

  // Status + signs + optional lead. Museum's source ref lives in Identity, so no
  // duplicate here.
  const st = statusFor(enrich, known, museum, vault, acquiredAt);
  const signsRef = museum
    ? ""
    : ref(`evm.now/address/${short(token.owner)}/activity · last outbound tx`, `${S.evmNowAddressBase}${token.owner}/activity`);
  // A Lead is an actionable next step (e.g. settle a Gondi loan) — only for
  // entries that carry a note + url. Pure identity labels (Larva Labs) skip it.
  const lead =
    known && known.note && known.url
      ? `<aside class="pf-lead"><div class="pf-lead-label">Lead · ${esc(known.label)}</div><p>${esc(known.note)} <a href="${esc(known.url)}" target="_blank" rel="noopener">${esc(hostOf(known.url))} ↗</a></p></aside>`
      : "";

  const steps = custodySteps(token);
  const custody = steps.map((s) => `<li><span class="pf-kind">${s.kind}</span>${s.value}</li>`).join("");
  // Custody only adds information when there's a wrapper/vault step — for a
  // directly-held punk it just repeats the Holder, so hide it.
  const custodyRow =
    steps.length > 1
      ? `<div class="pf-row"><div class="pf-row-label">Custody</div><div class="pf-row-value"><ol class="pf-custody">${custody}</ol></div></div>`
      : "";

  // "also holds N more CryptoPunks" — counted for THIS version, linked to the
  // matching marketplace (cryptopunks.app account for V2, v1cryptopunks for V1).
  const count = kind === "V2" ? enrich.holdings?.v2 ?? 0 : enrich.holdings?.v1 ?? 0;
  const acctUrl = kind === "V2" ? `${S.cryptopunksAccountBase}${token.owner}` : `${S.v1cryptopunksUserBase}${token.owner}`;
  const holdingsSub =
    count > 1
      ? `<span class="pf-sub">holds <a href="${acctUrl}" target="_blank" rel="noopener">${count} ${kind} CryptoPunks</a> in total</span>`
      : "";
  const heldSinceSub = acquiredAt
    ? `<span class="pf-sub">held since ${new Date(acquiredAt * 1000).toISOString().slice(0, 10)}</span>`
    : "";

  const evidence = ev
    .map((e) => `<li>${e.href ? `<a href="${esc(e.href)}" target="_blank" rel="noopener">${e.text}</a>` : e.text}</li>`)
    .join("");

  return `<article class="pf-panel">
    <header class="pf-panel-head"><h2 class="pf-panel-label">${kind} Token</h2>${contractLine}</header>

    <div class="pf-row">
      <div class="pf-row-label">Holder</div>
      <div class="pf-row-value">${evmLink(token.owner)}${holderRef}${heldSinceSub}${holdingsSub}</div>
    </div>
    <div class="pf-row">
      <div class="pf-row-label">Identity</div>
      <div class="pf-row-value">${identity}</div>
    </div>
    ${custodyRow}
    <div class="pf-row">
      <div class="pf-row-label">Status</div>
      <div class="pf-row-value">
        <div class="pf-status-block"><span class="pf-status pf-status--${st.key}">${esc(st.label)}</span></div>
        <p class="pf-signs"><strong>Signs of life:</strong> ${signsProse(enrich, known, museum, vault)}${signsRef}</p>
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

function caseHead(id, v1, v2, traits) {
  // Existence-based (a token record can exist while its holder is a burn/zero
  // address — that's burned, not "missing").
  const hasV1 = !!v1;
  const hasV2 = !!v2;
  const paired = hasV1 && hasV2 && !isZero(v1.owner) && !isZero(v2.owner) && v1.owner.toLowerCase() === v2.owner.toLowerCase();
  let custody = "—";
  if (hasV1 && hasV2) {
    custody = paired ? "PAIRED" : "SPLIT CUSTODY";
  } else if (hasV2) {
    custody = "V2 ONLY";
  } else if (hasV1) {
    custody = "V1 ONLY";
  }
  // A pink heart between V1 and V2 when the same wallet holds both.
  const amp = paired ? "💗" : "&amp;";
  const inRange = /^\d{1,4}$/.test(String(id)) && Number(id) <= 9999;
  const disp = esc(displayId(id));
  const eyebrow = traits ? `Case #${disp} · ${esc(traits.t)}` : `Case #${disp} · CryptoPunk`;
  const attrs =
    traits && traits.a?.length
      ? `<div class="pf-case-attrs">${traits.a.map((a) => `<span>${esc(a)}</span>`).join("")}</div>`
      : "";
  // Out-of-range V1-only tokens have no CryptoPunks image — use the placeholder.
  const img = inRange
    ? `<img class="pf-punk-img" src="${S.imageBase}${id}/image?transparent=true&bg=f0efeb" alt="CryptoPunk #${disp}" width="88" height="88">`
    : `<div class="pf-punk-img" aria-hidden="true">—</div>`;
  return `<section class="pf-case-head">
    ${img}
    <div class="pf-case-title">
      <div class="pf-case-eyebrow">${eyebrow}</div>
      <h1 class="pf-case-id">Punk ${disp}</h1>
      ${attrs}
    </div>
    <div class="pf-case-meta">
      V1 ${amp} V2 <strong>${custody}</strong><br>
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
      const [activity, codeInfo, ens, profile, holdings] = await Promise.all([
        resolveActivity(a).catch(() => null),
        getCodeInfo(a).catch(() => null),
        resolveEns(a).catch(() => null),
        resolveProfile(a).catch(() => null),
        fetchHoldings(a).catch(() => 0),
      ]);
      by[a] = {
        activity,
        holdings,
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

async function render(rawId) {
  const out = $("#pf-results");
  document.body.classList.remove("pf-home"); // leave the centered landing once a lookup runs
  const id = String(rawId).trim();
  if (!/^\d+$/.test(id)) {
    out.innerHTML = `<p class="pf-note"><strong>Enter a CryptoPunk number (0–9999).</strong> Wallet-address lookup is coming soon.</p>`;
    return;
  }
  // In range = a normal 0–9999 punk (has traits + an image). Out-of-range ids
  // are the V1-only "curio" tokens claimed above 10,000.
  const inRange = /^\d{1,4}$/.test(id) && Number(id) <= 9999;
  out.innerHTML = `<p class="pf-loading">> resolving #${esc(displayId(id))}…</p>`;
  try {
    const { v1, v2 } = await fetchPunk(id);
    if (!v1 && !v2) {
      out.innerHTML = `<p class="pf-note"><strong>#${esc(displayId(id))} · not found.</strong> No V1 or V2 record for this id.</p>`;
      return;
    }
    const [enrichFor, claim, traits, acquired, curated] = await Promise.all([
      enrichOwners(v1, v2),
      fetchClaim(id).catch(() => null),
      inRange ? getTraits(Number(id)).catch(() => null) : Promise.resolve(null),
      fetchAcquired(id).catch(() => null),
      fetchCurated().catch(() => null),
    ]);
    const claimerEns = claim?.by && !isZero(claim.by) ? await resolveEns(claim.by).catch(() => null) : null;
    out.innerHTML =
      caseHead(id, v1, v2, traits) +
      claimLine(claim, claimerEns) +
      `<section class="pf-panels">${tokenPanel("V2", id, v2, enrichFor(v2), acquired?.v2, !!v1, curated)}${tokenPanel("V1", id, v1, enrichFor(v1), acquired?.v1, !!v2, curated)}</section>`;
    out.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (err) {
    out.innerHTML = `<p class="pf-note"><strong>Lookup failed.</strong> ${esc(err.message)}</p>`;
  }
}

function main() {
  const input = $("#pf-input");
  // Keep the input to digits only (id 0–9999; maxlength=4 caps the length).
  input.addEventListener("input", () => {
    const cleaned = input.value.replace(/\D/g, "");
    if (cleaned !== input.value) input.value = cleaned;
  });
  $("#lookup-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const raw = input.value.trim();
    history.replaceState(null, "", `?punk=${encodeURIComponent(raw)}`);
    render(raw);
  });

  // Deep links (?punk=…) accept any digit id, including the out-of-range V1-only
  // tokens the anomaly copy links to; typed input stays capped at 0–9999.
  const param = (new URLSearchParams(location.search).get("punk") || "").trim();
  if (/^\d+$/.test(param)) {
    input.value = param;
    render(param);
  } else {
    document.body.classList.add("pf-home"); // centered landing until the first lookup
  }
}

main();
