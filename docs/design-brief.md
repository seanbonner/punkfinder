# PunkFinder — Design Brief

## What it is
A research/lookup tool for CryptoPunks. Enter a punk number (or a wallet) and get an honest report: who holds the V1 and V2 tokens, whether the holding wallet shows signs of life, any public identity attached, and an evidence-backed status. It replaces the hour of manual digging a collector or dealer does to find out who owns a specific punk and whether they're reachable.

## The family, and where this one diverges
PunkFinder is a sibling to the other punk sites (LostPunks, BurnedPunks, MuseumPunks, and the PunksPunksPunks hub). It shares their DNA: **white background, minimal, clean, CryptoPunks pixel aesthetic**, and a footer that points back to the hub.

But those sites tell stories. **PunkFinder is an instrument.** Lean into that: it should read like a **field intelligence report / case dossier / forensic data sheet** — precise, sourced, a little terminal-flavored — while staying as light and clean as the rest of the family. The report *is* the product; there's no story to sell.

## The feel
- **Intel report, not landing page.** Data-dense but legible. Monospace or mono-accented type fits the "readout" character. Tabular, evidence-listed.
- **Every claim is sourced.** The design needs a consistent way to show provenance tags — "via ENS record", "curated label", "on-chain", "indexer" — quietly, next to each fact.
- **Color is functional, not decorative.** Reserve it for the status vocabulary below. Otherwise near-monochrome on white.
- **Trustworthy to a stranger.** A dealer who's never met Sean should feel this is rigorous and honest. No hype, no marketing voice.

## Constraints
- **White / light background primary** (family consistency). Design a clean **print stylesheet** too — a dealer should be able to PDF a report.
- Static **Eleventy** site, **plain CSS, no framework.** Reskin the existing markup — don't rebuild it. Current classes and structure live in `js/lookup.js` and `css/style.css`.
- Accessible: real contrast on white, keyboard-usable input, semantic markup.
- Responsive: the two token panels sit side-by-side on desktop, stack on mobile.

## Surfaces to design
1. **The lookup entry** — a single input (punk number or wallet address). The "console."
2. **The report** — punk image + id + pairing note, then two token panels (V1 and V2, identical structure). Each panel: holder address, identity block (ENS / curated label, source-attributed), custody chain (wrapper/vault/stash shown as steps), status + "signs of life", and a **lead callout** when there's a next step (e.g. "held as collateral on Gondi — may be buyable via the loan").
3. **Status treatment** — a small, consistent visual language for the state vocabulary.
4. **Sourcing/evidence style** — the quiet provenance tags described above.
5. **Link-outs row** — evm.now, cryptopunks.app, punksmarket, opensea.

## Status vocabulary (needs a visual language, light-mode friendly)
`reachable` · `active — anonymous` · `dormant` · `possibly lost` · `vault / likely held` · `held — not available` · `held — institutional` · `burned` · `lead` (e.g. lending collateral). Each renders with its supporting evidence, never as a bare label.

## Anti-goals
- Not a storytelling or marketing page. No big hero, no persuasive copy.
- Don't bury the data under chrome. Legibility and density win over flourish.

## Deliverable
A CSS direction — and ideally one static HTML mockup of a fully-populated report — that restyles the existing lookup page into this "intel report" feel while staying unmistakably part of the punk-sites family. Reskin the current working markup; keep the class structure.
