# PunkFinder — Build Spec

**Domain:** punkfinder.com
**Purpose:** Public site. A visitor enters a punk number (0–9999) and gets a report on both the V1 and V2 tokens: which wallets hold them, whether those wallets show signs of life, what publicly-verifiable identity is attached, and an honest status verdict (reachable / dormant / possibly lost / held-not-available / burned). Secondary entry path: a wallet address, returning identity, activity, and punk holdings.

The goal is to replace the manual hour-or-two of digging a collector or dealer currently does (or asks someone to do) when they want to identify who owns a specific punk. Negotiation and outreach happen elsewhere; this tool only answers "who holds it and is anyone home."

**Ethos:** surface only what a reasonable person spending an hour of public searching could connect — self-published identity (ENS names, ENS text records, OpenSea profiles, socials linked from those) and public chain data. Never emails, mailing addresses, or speculative identity attributions. When in doubt, omit.

---

## 1. Architecture Overview

Three-tier resolution — always answer from our own data before touching external sources:

- **Tier 1 — Knowledge Base (KB).** Curated, human-maintained label/category data, flat files. All public-safe (see §3) — the whole KB ships to the site; nothing is withheld or stored as private knowledge. Authoritative when present.
- **Tier 2 — Enrichment cache.** Machine-fetched results (ENS, ENS text records, OpenSea accounts, heuristic linkages) stored with fetched-at timestamps in Cloudflare D1. Serve if fresh, refetch if stale, write back on miss. Disposable/rebuildable.
- **Tier 3 — Live sources.** The punks indexer (ownership, events, market activity), viem for ENS, OpenSea v2 API, Etherscan. Only hit on cache miss/staleness.

### Stack

- **Frontend:** static site on Cloudflare Pages (match existing punk-sites patterns; Eleventy is fine, follow LostPunks conventions where reusable).
- **Backend:** Cloudflare Pages Functions (Workers) for anything needing API keys or the cache. OpenSea/Alchemy keys live server-side only.
- **Cache:** Cloudflare D1.
- **Ownership/events:** the live Ponder indexer at `https://indexer.punksmarket.app` (GraphQL + REST). Do NOT use the monthly `punk-data` snapshot as the ownership source — this site's core question is exactly the one where a month-stale answer is wrong. The snapshot pipeline may be reused as a reference implementation only.
- **Rate limiting:** enrichment endpoints must be rate-limited and cache-first. Public site; assume bots.

### Repos

- **`punkfinder`** (public) — the site, its Pages Functions, and the KB data files. The KB is public-safe curated data (§3), so it needs no separate private repo: it lives in this repo as flat files and is built into the site's JSON artifact like any other data. (If you'd rather keep KB curation in its own repo for tidiness, that's fine — but there's no privacy reason to, and nothing about its contents needs gating.)

---

## 2. Existing Assets to Reuse

From the punk-sites ecosystem (see repo paths):

| Asset | Location | Use |
|---|---|---|
| Live indexer (raw owners, V1+V2, full events, account stats) | `https://indexer.punksmarket.app`; client code in `cryptopunks/punks.auction/app/utils/indexer.ts` (GraphQL `queryIndexer` + REST `fetchIndexer` helpers) | Primary ownership + history + market-activity source |
| Beneficial-owner piercing | indexer `punks`/`v1Punks` query (`owner` vs `native_owner`); `cryptopunks/punks.auction/app/composables/usePunkOwner.ts` for the on-chain path | **Confirmed live: the indexer already pierces wrappers** — its `owner` field is the beneficial holder while `native_owner` is the raw market owner (verified on punk 1234's wrapped V1: `native_owner` = the V1 wrapper contract, `owner` = the real holder). So the common wrap case needs NO viem. Keep `usePunkOwner`'s on-chain reads (`predictVault`/stash round-trip) only as a fallback for vault/stash custody **if** the indexer's `owner` doesn't already resolve those to the EOA — verify against a known vaulted punk before writing any RPC piercing code. |
| Wallet → holdings | `useAccountPunkInventory.ts` | Wallet-entry direction |
| Wallet stats / lastActiveAt | `useAccountStats.ts`, indexer `GET /accounts/stats` | Activity signals |
| ENS forward/reverse/avatar (viem, client-side) | `useEnsWithAvatar`, `getEnsAddress` in punks.auction | Port to Pages Functions or reuse pattern |
| OpenSea v2 fetch pattern (`x-api-key` header, `fetchWithTimeout` best-effort wrapper, `https://api.opensea.io/api/v2` base) | `ARTS HAUS/artshaus/src/lib/opensea.ts` | Reuse the *pattern*, not the file — that module is series/collection-metadata enrichment, not an account client. Lift `fetchWithTimeout` + the key-header shape; the Accounts endpoint (`/api/v2/accounts/{address}`) is net-new code |
| Alchemy asset-transfers client | `ARTS HAUS/artshaus/src/lib/alchemy.ts` | Optional fallback for outbound-activity checks |
| Status heuristics, card rendering, deep-link builders | `PunkSites/LostPunks/js/lookup.js`, `js/lib.js` | Seed for status logic + link-out UI |
| Curated labels (seed data) | `PunkSites/LostPunks/_data/labels.js` | Migrate into KB |
| Punk images / traits | `@networked-art/punks-sdk`; cryptopunks.app; on-chain CryptoPunksData | Rendering |

**Known constraint:** Alchemy's NFT API does not index CryptoPunks V1 at all. V1 data comes from the indexer (primary) or OpenSea/on-chain — never Alchemy.

### Canonical contracts

- CryptoPunks V1: `0x6Ba6f2207e343923BA692e5Cae646Fb0F566DB8D`
- CryptoPunks V2: `0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB`
- WrappedPunks (legacy): `0xb7f7F6C52F2e2fdb1963Eab30438024864c313F6`
- CryptoPunks721 (modern wrapper): `0x000000000000003607fce1aC9E043a86675C5C2F`
- V1 Wrapper: `0x282BDD42f4eb70e7A9D9F40c8fEA0825B7f68C5D`
- Yuga StashFactory: `0x000000000000A6fA31F5fC51c1640aAc76866750`
- CryptoPunksData (on-chain SVG): `0x16F5A35647D6F03D5D3da7b35409D65ba03aF3B2`

V1 and V2 use the same ids 0–9999 with fully independent ownership. Every punk id has both a V1 and a V2 record, often held by different parties. Never merge; always report both.

---

## 3. Knowledge Base (KB)

Everything in the KB is public-safe curated data — labels, categories, and on-chain-derivable relationships. **There is no private/withheld tier.** Nothing here is secret identity knowledge held back from the site; the whole file ships as-is, and the "build" step is just serializing it into the site's JSON artifact, not a privacy filter. Person-level identity is never *stored* here as private knowledge — any person identity the site shows comes live from self-published sources (ENS/OpenSea), per the ethos. The one rule for what goes in the KB: only write things that are fine to publish.

### Schema — one record per address

```yaml
address: "0x..."               # checksummed, primary key
label: "Yuga Labs Treasury"    # short display name (institutions / orgs / known entities)
category: museum | burn | corporate | dealer | collector | vault | exchange | deceased-estate | unknown
availability: structural | policy | normal
  # structural = will never move (burns, museums)
  # policy    = active wallet, keys present, not entertaining offers (Yuga, NODE, Larva Labs)
  # normal    = no override; status logic applies
linked_wallets:                # vault↔hot pairs, known clusters
  - address: "0x..."
    relationship: vault-of | hot-wallet-of | same-owner
    basis: onchain | confirmed | heuristic
ens: ""                        # known primary ENS if any
socials:                       # ONLY self-published/publicly-linked accounts
  twitter: ""
  farcaster: ""
  website: ""
  opensea: ""
confidence: confirmed | strong | speculative   # display caveat, not a privacy gate
source: ""                     # public provenance — where the label came from; fine to show as attribution
notes: ""                      # optional curation context. Public-safe like everything else — don't write anything here you wouldn't publish
updated: 2026-07-25
```

### What ships to the site

The whole record ships. There's no per-record hide flag and no "known associations exist" placeholder — if an address is in the KB, its label/category/availability/links render with the source named. Two honest-display rules remain (these are about not *asserting* things, not about hiding a private store):

- `confidence: speculative` → the label renders tentatively or is omitted, never asserted as fact (per the ethos: no speculative identity attributions).
- `linked_wallets` entries display only when `basis` is `onchain` or `confirmed` AND the linked target itself has a public identity (an ENS or a KB label) — never use a heuristic link to attach an anonymous wallet to an identity its owner didn't publish.

### Seed data task (first KB job)

Consolidate into the schema: `LostPunks/_data/labels.js`, known burn addresses, museum wallets from Museum Punks, Yuga/NODE/Larva Labs known wallets from Burned Punks/other research, exchange/custodian addresses. Sean reviews the consolidated file before it goes live.

### Maintenance loop

Every manual investigation Sean does should end with a KB write. The KB is the compounding asset; the tool's value grows with it. Editing is by hand / Claude Code; no public write path (the site never writes back to it). (Future, non-v1: a "submit a tip" form queueing to a review pile — never auto-publishing.)

---

## 4. Enrichment Cache (D1)

Table sketch:

```sql
CREATE TABLE enrichment (
  address TEXT NOT NULL,
  kind TEXT NOT NULL,          -- ens_reverse | ens_text | opensea_account | vault_heuristic | last_outbound
  value TEXT,                  -- JSON payload
  fetched_at INTEGER NOT NULL,
  PRIMARY KEY (address, kind)
);
```

TTLs (tune later): ownership = no cache (always live indexer); indexer `lastActiveAt` = no cache (live with ownership — it's the liveness verdict, must be fresh); `last_outbound` = 1h (this kind is the *optional Etherscan/Alchemy last-outbound detail* of §5, not the indexer's `lastActiveAt`); `ens_reverse` / `ens_text` = 7d; `opensea_account` = 30d; `vault_heuristic` = 30d or until KB overrides.

Flow per signal: KB → cache (fresh) → live fetch → write cache → return. Negative results ("no ENS") are cached too, with the same TTL.

---

## 5. Signal Definitions

### Activity ("is anyone home") — computed on the WHOLE wallet, not just punk activity

- **Primary liveness signal — `lastActiveAt`:** `GET /accounts/stats?addresses={custodySet}&eoa={eoa}&scope=v2` returns `lastActiveAt`, sourced from the indexer's `accounts.last_interaction_at` for the EOA. This tracks **tx-from — any signed transaction of any kind, not just punk activity** (confirmed in `useAccountStats.ts`: the indexer "uses it for the last-active lookup, which tracks tx-from rather than event-participation"). It is already whole-wallet, so it is the primary and normally sufficient "is anyone home" signal. Any signed tx counts as liveness. `firstSeenAt` (also returned) seeds the peak-blind check below. Call shape: `addresses` is the custody set (EOA + vault + stash), `eoa` is the signing address the last-active lookup keys on.
- **Scope caveat — what IS punk-scoped:** the same `/accounts/stats` response also returns spend/earn/sale aggregates, and those *are* punk-market-scoped (`scope=v2`). Do NOT read those aggregates as whole-wallet activity — only `lastActiveAt` / `firstSeenAt` answer liveness. (This is the distinction an earlier draft blurred when it worried the "account view is punk-scoped." The *aggregates* are; the *liveness timestamp* is not.)
- **Optional last-outbound detail (Etherscan/Alchemy):** needed only to display the *content* of the most recent outbound (what moved, to whom), or as a cross-check when `lastActiveAt` is null. NOT required for the yes/no liveness verdict — the indexer answers that whole-wallet already. Alchemy still cannot see V1; use it for activity only, never V1 ownership.
- **Dormant:** no outbound/signed activity for 3+ years.
- **Peak-blind (strong lost signal):** wallet acquired its punk(s) before 2020 and produced zero outbound activity through the 2021–22 market peak. Nobody holding keys ignored that period.
- **Liveness rescues (any one defeats "possibly lost"):** any signed tx at any recency short of the dormancy window; ENS registration or renewal (renewal especially — recurring deliberate act, check registrations/renewals from linked wallets too); wrapping activity; KB annotation indicating access; qualifying vault pattern (below).

### Vault heuristic

Wallet with zero/near-zero outbound over years, where ≥3 inbound transfers originate from a single wallet that is itself active → flag `vault_heuristic` linking the two. Start with the crude threshold; tune with real data. Display rules per §7.

### Identity trail (public-safe only)

Resolution order per address: KB (curated fields) → ENS reverse-resolve → ENS text records (read **only** the public handle/URL keys — `com.twitter`, `com.github`, `url`, and similar; the `email` key and any contact-type field are **not requested or stored at all**, since nothing here is ever displayed and there's no private view that would use it) → OpenSea v2 Accounts (`/api/v2/accounts/{address}`: username, profile existence, socials if present — again, public handles only). Everything read is something the report can show; if we'd never display it, we don't fetch it. Everything shown traces to a self-published or on-chain source, named on the report.

### Market activity

From the indexer events: current listing, open bids, recent sales. Freshest-possible; no cache.

---

## 6. Status Logic (per token — every punk gets two verdicts, V1 and V2)

Evaluate in order; first match wins. Every verdict renders with its contributing evidence, never a bare label.

```
1. KB overrides:
   category=burn / burn address           → BURNED
   availability=structural (museum etc.)  → HELD — INSTITUTIONAL
   availability=policy (Yuga/NODE/LL)     → HELD — NOT AVAILABLE
                                            ("held by {label} — not known to consider offers")
2. Market (indexer, live):
   active listing or open bids            → AVAILABLE — LISTED
3. Identity:
   any public identity trail (ENS w/ records, OpenSea account, KB public identity, socials)
                                          → REACHABLE  (show activity level alongside)
4. Activity (whole-wallet):
   recent outbound/signed activity, no identity
                                          → ACTIVE — ANONYMOUS
   dormant + vault pattern (KB link or heuristic to an active wallet)
                                          → VAULT — LIKELY HELD
   dormant + peak-blind + no liveness rescue
                                          → POSSIBLY LOST
   dormant + any rescue signal            → DORMANT — SOMEONE HOME
```

### Pairing block (per punk number, above/beside the two token panels)

- Same beneficial owner for V1 and V2 (via owner-piercing) → "V1 and V2 currently paired."
- Otherwise → "Separately held — V1: {status}, V2: {status}." No unified verdict; the two tokens are independent things. Pairing-possibility is implicit in the two statuses.

---

## 7. Privacy Rules (hard requirements)

These govern what the site *displays* from live/fetched sources. They are not a private-data store — the KB itself holds only public-safe data (§3).

1. Display only self-published or on-chain-derivable identity: ENS names, ENS text-record socials/URLs, OpenSea usernames, institutional/entity labels, chain events.
2. Don't fetch or store emails or physical-world contact info in the first place — not "read but don't display." We request only the public handle/URL fields from ENS text records and OpenSea; contact-type fields are never pulled, so there's nothing private to hold. (There's no private version of the site; no reason to ingest anything we'd never show.)
3. Heuristic wallet linkages (vault patterns, funding patterns): display only when the linked target is itself identifiable (has an ENS or a KB label). Never use a heuristic to connect an anonymous wallet to an identity its owner didn't publish.
4. Never attach a person-level real-world identity to a wallet unless that person self-published the link (ENS / OpenSea / linked socials). Don't store — or show — private knowledge of who an anonymous wallet "really" is; if it isn't self-published, it isn't shown.
5. `confidence: speculative` labels render tentatively or are omitted, never asserted as fact.
6. Every displayed identity claim names its source ("via ENS text record", "OpenSea profile", "curated — {category}").

---

## 8. Report Page Spec

**Entry:** single input accepting a punk number or a wallet address (auto-detect; also accept ENS names → resolve to address). Deep-linkable: `/punk/4736`, `/wallet/0x...`.

### Punk report (`/punk/{id}`)

1. **Header:** punk image (cryptopunks.app or on-chain SVG), id, traits (SDK), pairing block.
2. **Two token panels — V1 and V2, identical structure:**
   - Status verdict + evidence list (each signal that contributed, with source and link-out).
   - Custody chain: raw holder → pierced beneficial owner (wrapper/stash/vault steps shown explicitly).
   - Owner identity block: label/ENS/avatar, socials (source-attributed), activity summary (last outbound, first seen).
   - Market: current listing/bids if any.
   - Recent transfer history (last ~10 events from indexer), **each counterparty run through the same identity resolution** — this is how "sold 2 months ago from a known wallet" surfaces. Known/identifiable prior holders are highlighted as potential leads.
   - Link-outs per address/token: Etherscan, cryptopunks.app, OpenSea, punksmarket.app (reuse LostPunks `lib.js` builders).
3. **Print stylesheet** so the page prints/PDFs cleanly. No server-side PDF generation.

### Wallet report (`/wallet/{addr}`)

Identity block + activity summary + status-relevant flags (KB category, vault heuristic) + punk holdings (V1 and V2 listed separately, each with its wrap/custody state), same link-outs.

**Self-sufficiency test:** a dealer who has never spoken to Sean must be able to read the report, understand every claim's basis, verify it via the link-outs, and know their next step. If a page requires asking Sean what it means, it fails.

---

## 9. Build Phases

### Phase 1 — Core lookup (ship this)
- Repo scaffolding: `punkfinder` public repo; KB as flat data files in it (no separate private repo — §3), with a trivial build step that serializes the KB into the site's JSON artifact.
- KB seed: consolidate labels.js + burn/museum/Yuga/NODE/LL/exchange lists into schema; Sean review; first build.
- Punk-number lookup against the live indexer: both tokens, owner piercing, custody chain, transfer history.
- Status logic §6 using indexer activity data + KB overrides. Evidence-listed verdicts.
- ENS reverse resolution (Pages Function + D1 cache).
- Report page per §8 including link-outs and print stylesheet.

**What Phase 1 can and can't verdict (be honest in the UI).** Every §6 branch is wired, but the identity inputs are partial until Phase 2, so the REACHABLE branch runs on a reduced set: it fires only on a **KB public identity** or a **reverse-resolved ENS name** (the two identity signals available in Phase 1). The richer trail — ENS text-record socials, OpenSea accounts, counterparty resolution — lands in Phase 2 and *enriches* an already-REACHABLE verdict's evidence; it also lets some wallets that read ANONYMOUS/dormant in Phase 1 flip to REACHABLE once their self-published socials are visible. So Phase 1 fully produces BURNED, HELD-*, AVAILABLE-LISTED, ACTIVE-ANONYMOUS, and the dormant/lost family; it produces REACHABLE only in its reduced (KB-or-reverse-ENS) form. Don't render a confident "no public identity" as if the search were exhaustive when the Phase 2 sources haven't run yet — word it as "no identity found in {sources checked}."

### Phase 2 — Identity depth
- ENS text records (socials, url).
- OpenSea v2 Accounts integration (reuse ARTS HAUS's `fetchWithTimeout` + key-header pattern per §2; the `/api/v2/accounts/{address}` endpoint is net-new; server-side key, cached).
- Counterparty identity resolution on transfer history.
- Negative-result caching + rate limiting hardening.

### Phase 3 — Wallet direction + heuristics
- `/wallet/{addr}` entry path (holdings via indexer, identity, activity).
- ENS-name input resolution.
- Vault heuristic (inbound-concentration detection) with §7 display rules.
- Last-outbound *detail* via Etherscan/Alchemy (what moved, to whom) as an enrichment on top of the indexer's `lastActiveAt`, and as a cross-check when `lastActiveAt` is null. Not a replacement for the liveness verdict — the indexer already answers that whole-wallet (see §5).

### Non-goals (v1)
- Public write/tip submission.
- Price estimation, rarity ranking, valuation.
- Any contact facilitation (messaging, email display).
- Historical snapshots / time-travel views.

---

## 10. Keys & Config

- `OPENSEA_API_KEY` — Pages Function secret.
- `ALCHEMY_API_KEY` — Pages Function secret (Phase 3 fallback; RPC for ENS if not using a public endpoint).
- `ETHERSCAN_API_KEY` — only if the Etherscan fallback is used.
- Indexer: public endpoint, no key.
- KB data: flat files in the public repo, serialized into the site's JSON artifact at build time. No secret store, no deploy token — the KB is public-safe by construction (§3).
