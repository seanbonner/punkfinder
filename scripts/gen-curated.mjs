// Generate data/curated.json — burned and museum CryptoPunks — from the sibling
// BurnedPunks and MuseumPunks projects' per-punk markdown front matter. Run
// locally (siblings must be present); the JSON is committed and served, so the
// build server never needs the siblings. Re-run when those lists change.
//
//   node scripts/gen-curated.mjs

import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SITES = join(ROOT, "..");
const BURNED_DIR = join(SITES, "BurnedPunks", "punks");
const MUSEUM_DIR = join(SITES, "MuseumPunks", "punks");
const INST_DIR = join(SITES, "MuseumPunks", "institutions");

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
  burned[id] = { intent: fm.intent || null, by: fm.burner_name || fm.claimer_name || null };
}
const museum = {};
for (const [id, fm] of Object.entries(readPunks(MUSEUM_DIR))) {
  museum[id] = { name: instNames[fm.institution] || fm.institution || null };
}

const out = {
  generatedAt: new Date().toISOString(),
  burnedBase: "https://burnedpunks.com/",
  museumBase: "https://museumpunks.com/",
  burned,
  museum,
};
writeFileSync(join(ROOT, "data", "curated.json"), JSON.stringify(out));
console.log(`wrote curated.json — ${Object.keys(burned).length} burned, ${Object.keys(museum).length} museum`);
console.log("685:", JSON.stringify(out.burned["685"]), "| 110:", JSON.stringify(out.museum["110"]));
