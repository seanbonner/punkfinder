// Generate data/curated.json — burned and museum CryptoPunks — from the sibling
// BurnedPunks and MuseumPunks projects' per-punk markdown front matter. Run
// locally (siblings must be present); the JSON is committed and served, so the
// build server never needs the siblings. Re-run when those lists change.
//
//   node scripts/gen-curated.mjs

import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SITES = join(ROOT, "..");
const BURNED_DIR = join(SITES, "BurnedPunks", "punks");
const MUSEUM_DIR = join(SITES, "MuseumPunks", "punks");
const INST_DIR = join(SITES, "MuseumPunks", "institutions");
// Known-vault wallet labels live in LostPunks — one source of truth for "which
// wallets are deliberate long-term vaults" across both sites.
const LABELS_FILE = join(SITES, "LostPunks", "_data", "labels.js");

function frontMatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  const fm = {};
  if (m) for (const line of m[1].split("\n")) {
    const mm = line.match(/^(\w+):\s*"?([^"\n]*?)"?\s*$/);
    if (mm) fm[mm[1]] = mm[2];
  }
  return fm;
}
function readPunks(dir) {
  const out = {};
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    if (!/^\d+\.md$/.test(f)) continue;
    out[f.replace(".md", "")] = frontMatter(readFileSync(join(dir, f), "utf8"));
  }
  return out;
}

const instNames = {};
if (existsSync(INST_DIR)) {
  for (const f of readdirSync(INST_DIR)) {
    if (!f.endsWith(".md")) continue;
    const fm = frontMatter(readFileSync(join(INST_DIR, f), "utf8"));
    if (fm.name) instNames[f.replace(".md", "")] = fm.name;
  }
}

const burned = {};
for (const [id, fm] of Object.entries(readPunks(BURNED_DIR))) {
  burned[id] = {
    intent: fm.intent || null,
    by: fm.burner_name || fm.claimer_name || null,
    // Where it went — the burn destination, used to identify the burned token.
    final: (fm.final_wallet || "").toLowerCase() || null,
  };
}
const museum = {};
for (const [id, fm] of Object.entries(readPunks(MUSEUM_DIR))) {
  museum[id] = { name: instNames[fm.institution] || fm.institution || null };
}

// Known vaults — addresses flagged `vault: true` in LostPunks' labels.js. These
// wallets are designed to sit still, so their outbound silence is intentional
// custody, not a lost punk. Keyed by lowercase address → { label }.
const vaults = {};
if (existsSync(LABELS_FILE)) {
  const mod = await import(pathToFileURL(LABELS_FILE).href);
  for (const [addr, val] of Object.entries(mod.default || {})) {
    if (val && typeof val === "object" && val.vault) vaults[addr.toLowerCase()] = { label: val.label };
  }
}

const out = {
  generatedAt: new Date().toISOString(),
  burnedBase: "https://burnedpunks.com/",
  museumBase: "https://museumpunks.com/",
  burned,
  museum,
  vaults,
};
writeFileSync(join(ROOT, "data", "curated.json"), JSON.stringify(out));
console.log(
  `wrote curated.json — ${Object.keys(burned).length} burned, ${Object.keys(museum).length} museum, ${Object.keys(vaults).length} vaults`
);
console.log("685:", JSON.stringify(out.burned["685"]), "| 110:", JSON.stringify(out.museum["110"]));
