# PunkFinder — Design Spec (Dossier direction)

Reference visual target: `punkfinder-dossier.html` + `punkfinder-dossier.css`.

This spec is authoritative for tokens, class names, and states. The HTML file is a fully-populated example. Reskin the existing markup in `js/lookup.js` — don't rebuild it; map its current elements onto the class contract below.

---

## Voice

Field intelligence report. Precise, sourced, terminal-flavored, quiet. No marketing copy, no hype. A dealer who has never met the site owner should trust it at a glance. Every claim is followed by evidence.

---

## Design tokens

All tokens live as CSS custom properties on `:root` in `punkfinder-dossier.css`. Consume via `var(--pf-*)`. Never hardcode these values elsewhere.

### Color

| Token | Value | Use |
|---|---|---|
| `--pf-paper` | `#ffffff` | Page background — always white |
| `--pf-ink` | `#111111` | Body text, primary rules |
| `--pf-hair` | `#d8d6d1` | Hairline rules, panel dividers, tag borders |
| `--pf-meta` | `#7a7770` | Muted labels, timestamps, mono captions |
| `--pf-tag-bg` | `#f0efeb` | Provenance-tag fill and punk-image placeholder fill |
| `--pf-accent` | `#c4441a` | The **only** decorative color on the page. Lead callouts, evidence refs, brand full-stop, family-link hover. Never used for body text. |

### Status vocabulary — light-mode functional

Every status has one color and is always paired with supporting evidence prose. Never render a bare status label.

| Class | Token | Hex |
|---|---|---|
| `.pf-status--reachable` | `--pf-st-reachable` | `#1a7f4f` |
| `.pf-status--active` | `--pf-st-active` | `#1a6f8f` |
| `.pf-status--dormant` | `--pf-st-dormant` | `#6b6b6b` |
| `.pf-status--lost` | `--pf-st-lost` | `#a8681b` |
| `.pf-status--vault` | `--pf-st-vault` | `#6b4a9b` |
| `.pf-status--heldna` | `--pf-st-heldna` | `#333333` |
| `.pf-status--inst` | `--pf-st-inst` | `#1a3a6f` |
| `.pf-status--burned` | `--pf-st-burned` | `#7a1a1a` |
| `.pf-status--lead` | `--pf-st-lead` | `#c4441a` |

### Type

Two families. Load from Google Fonts (or self-host):

- **IBM Plex Sans** — structural text: page brand, case ID, "signs of life" prose in leads, custody-step "kind" eyebrows.
- **IBM Plex Mono** — everything data: labels, addresses, values, tags, evidence, timestamps, console, status pills, custody addresses.

Type scale is tight and deliberate:

| Role | Family | Size | Weight | Tracking |
|---|---|---|---|---|
| Brand | Sans | 22 | 700 | 0.06em |
| Case ID (`h1`) | Sans | 34 | 600 | -0.01em |
| Panel labels (V1/V2) | Mono | 11 | 600 | 0.14em uppercase |
| Row labels (Holder / Identity / Custody / Status) | Mono | 10 | 400 | 0.12em uppercase |
| Row values (addresses, data) | Mono | 13 | 400 | — |
| Sub / captions | Sans | 12 | 400 | — |
| Provenance tags | Mono | 9 | 400 | 0.10em uppercase |
| Evidence footnotes | Mono | 11 | 400 | — |
| Timestamps / masthead meta | Mono | 11 | 400 | 0.04em |
| Console input | Mono | 15 | 400 | — |

No other sizes. If a new element needs type, it maps to one of the roles above.

### Rhythm

- Page max-width: **1120px**, centered.
- Page padding: **36px vertical / 44px horizontal** desktop; **24px / 20px** mobile.
- Grid gutter: **24px**.
- Radius: **0 everywhere**. No rounded corners. Ever.
- Rules: 1px `--pf-hair` for panel dividers, dashed 1px for evidence separator, 2px `--pf-ink` for masthead bottom.

---

## Class contract

Namespaced `.pf-*` so it can coexist with any existing `js/lookup.js` output. Reuse these class names in the markup — if the existing markup uses different names, either rename or add these as siblings.

### Page shell

```
<main class="pf-page">
  <header class="pf-masthead">...</header>
  <form class="pf-console">...</form>
  <section class="pf-case-head">...</section>
  <section class="pf-panels">...</section>
  <nav class="pf-linkouts">...</nav>
  <footer class="pf-family-footer">...</footer>
</main>
```

### Masthead

```
<header class="pf-masthead">
  <div>
    <div class="pf-brand">PUNKFINDER<span class="dot">.</span></div>
    <div class="pf-brand-sub">Field intelligence · Provenance & reachability</div>
  </div>
  <div class="pf-masthead-meta">
    CASE OPENED {timestamp}<br>
    ANALYST {handle} · REPORT v{n}
  </div>
</header>
```

### Console (lookup input)

Single input, punk number OR 0x wallet. Real `<form>` with submit button. Keyboard accessible; visible focus.

```
<form class="pf-console" action="/lookup" role="search">
  <label class="pf-console-label" for="pf-input">Lookup</label>
  <input id="pf-input" type="text" placeholder="Punk number or 0x wallet address…">
  <button type="submit">Run</button>
</form>
```

### Case head

Three columns: punk image (88×88, image-rendering: pixelated), case title block, meta.

```
<section class="pf-case-head">
  <img class="pf-punk-img" src="..." alt="Punk {n}">
  <div class="pf-case-title">
    <div class="pf-case-eyebrow">Case #{n} · {type} · #{rarity} rarity</div>
    <h1 class="pf-case-id">Punk {n}</h1>
    <div class="pf-case-attrs"><span>{attr1}</span><span>{attr2}</span>…</div>
  </div>
  <div class="pf-case-meta">
    V1 & V2 <strong>{SPLIT|SAME} CUSTODY</strong><br>
    Last verified <strong>{date}</strong><br>
    Confidence <strong>{HIGH|MEDIUM|LOW}</strong>
  </div>
</section>
```

### Token panels

Always two: V1 then V2, identical structure. Side-by-side on desktop, stacked on mobile.

```
<section class="pf-panels">
  <article class="pf-panel">
    <header class="pf-panel-head">
      <h2 class="pf-panel-label">V1 Token</h2>
      <div class="pf-panel-contract">{shortAddr}</div>
    </header>

    <div class="pf-row">
      <div class="pf-row-label">Holder</div>
      <div class="pf-row-value">{addr}<sup class="pf-ref">1</sup></div>
    </div>

    <div class="pf-row">
      <div class="pf-row-label">Identity</div>
      <div class="pf-row-value">
        {ens_or_dash}<span class="pf-tag">ENS</span>
        <span class="pf-sub">{curated_label_or_note}<span class="pf-tag">curated</span></span>
      </div>
    </div>

    <div class="pf-row">
      <div class="pf-row-label">Custody</div>
      <div class="pf-row-value">
        <ol class="pf-custody">
          <li><span class="pf-kind">Owner wallet</span>{addr}</li>
          <li><span class="pf-kind">Vault</span>{addr} <span class="pf-tag">3-of-5</span></li>
        </ol>
      </div>
    </div>

    <div class="pf-row">
      <div class="pf-row-label">Status</div>
      <div class="pf-row-value">
        <div class="pf-status-block">
          <span class="pf-status pf-status--{key}">{Human Label}</span>
        </div>
        <p class="pf-signs"><strong>Signs of life:</strong> {evidence prose}<sup class="pf-ref">2</sup></p>
        <!-- optional -->
        <aside class="pf-lead">
          <div class="pf-lead-label">Lead · {short summary}</div>
          <p>{next-step prose with links}</p>
        </aside>
      </div>
    </div>

    <footer class="pf-evidence">
      <div class="pf-evidence-label">Evidence</div>
      <ol>
        <li><a href="...">source 1</a> · {what it shows}</li>
        <li>{source 2 description}</li>
      </ol>
    </footer>
  </article>

  <article class="pf-panel"> V2 … </article>
</section>
```

### Provenance tags

Every fact that isn't a raw on-chain read gets a tag next to it. Vocabulary is fixed — do not invent new tag labels without a design update.

- `ENS` — resolved from ENS
- `curated` — from a curator registry (MuseumPunks, etc.)
- `on-chain` — direct read from the token contract
- `indexer` — from a chain indexer aggregation
- `direct`, `3-of-5`, etc. — custody qualifiers

```html
<span class="pf-tag">ENS</span>
```

### Evidence refs

Superscript numeric marker inside a value, resolved in the panel's `.pf-evidence` list.

```html
0x8b3f…c2e1<sup class="pf-ref">1</sup>
```

### Link-outs row

Fixed set of destinations, mono-typed, hairline-bordered. Always in this order: `evm.now`, `cryptopunks.app`, `punks.market`, `opensea`.

### Family footer

Points back to sibling sites. Consistent with the rest of the family.

```
<footer class="pf-family-footer">
  <span>Part of the Punk sites</span>
  <div class="pf-family-links">
    <a href="https://museumpunks.com">Museum</a>
    <a href="https://burnedpunks.com">Burned</a>
    <a href="https://lostpunks.com">Lost</a>
    <a href="/">Hub</a>
  </div>
</footer>
```

---

## Behaviour notes

- **Empty state (no lookup yet)** — show masthead + console only. Suppress `.pf-case-head`, `.pf-panels`, `.pf-linkouts`. Family footer stays.
- **Loading state** — TBD. Suggested: replace `.pf-case-head` with a mono line "> resolving {input}…" in `--pf-meta`.
- **Error / not found** — replace `.pf-case-head` with a mono block: eyebrow "Case #{input} · not found", short prose, and a suggestion ("Try a different punk number, or paste a wallet 0x…"). No red — this isn't a fail state, it's a null result.
- **Accessibility** — masthead brand is a `div`, case ID is the page `h1`, each token panel label is `h2`. All interactive elements keyboard-usable; `:focus-visible` outlines match `--pf-ink`.
- **Print stylesheet** — already in `punkfinder-dossier.css`. Strips the console and link-outs, tightens margins, appends resolved URLs to inline links (except link-outs), forces status/lead color print.

---

## Anti-goals — do not

- Add a hero image, tagline, or persuasive copy.
- Add gradients, shadows, rounded corners, or accent colors beyond `--pf-accent`.
- Use serif faces.
- Render a status label without evidence prose beneath it.
- Add data claims without a provenance tag or evidence ref.
- Introduce icons for status. The colored square marker + mono label is the whole visual language.

---

## Prompt to seed Claude Code

> Reskin `js/lookup.js` output to match the design spec in `DESIGN-SPEC.md`. Visual target is `punkfinder-dossier.html`; drop `punkfinder-dossier.css` into `css/` and include it after the family stylesheet. Map the existing markup onto the `.pf-*` class contract in the spec — don't rebuild the JS lookup logic. Preserve the current lookup behaviour end to end. Confirm the following once done: the empty state renders masthead + console only, a populated state renders both token panels side-by-side on desktop and stacked on mobile, print stylesheet produces a clean single-column dealer PDF.
