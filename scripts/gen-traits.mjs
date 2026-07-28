// Generate data/punks-traits.json — per-punk type, accessories, and a rarity
// rank — from the @networked-art/punks-sdk offline dataset. Run locally (the
// sibling cryptopunks repo must be present); the JSON is committed and served
// to the client, so the build server never needs the SDK. Re-run only to
// refresh (the dataset is a fixed on-chain snapshot, so rarely).
//
//   node scripts/gen-traits.mjs
//
// Rarity is a transparent statistical score: sum of (10000 / trait supply)
// over the punk's type, attribute-count, and accessory traits — rarer traits
// score higher. Rank 1 = rarest. It won't match any one ranking site exactly.

import { writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SDK = join(ROOT, "..", "..", "cryptopunks", "sdk", "dist");
if (!existsSync(join(SDK, "offline.js"))) {
  console.error(`SDK dist not found at ${SDK}. Build the cryptopunks/sdk workspace first.`);
  process.exit(1);
}

const offline = await import(join(SDK, "offline.js"));
const { bundledOfflinePunksData } = await import(join(SDK, "offline-data.js"));
const manifest = JSON.parse(bundledOfflinePunksData.manifestJson);
const TOTAL = manifest.counts.punks;
const client = offline.createOfflinePunksDataClientFromDataset(bundledOfflinePunksData);

const RARITY_KINDS = new Set(["NormalizedType", "AttributeCount", "Accessory"]);

const punks = [];
for (let id = 0; id < TOTAL; id++) {
  const p = client.getPunkSync(id, { includeTraits: true });
  const accessories = p.traits.filter((t) => t.kind === "Accessory").map((t) => t.name);
  const score = p.traits.reduce((s, t) => (RARITY_KINDS.has(t.kind) ? s + TOTAL / t.supply : s), 0);
  punks.push({ id, type: p.punkTypeName, acc: accessories, attrs: p.attributeCount, score });
}

// Rank by score, rarest first.
[...punks].sort((a, b) => b.score - a.score).forEach((p, i) => (p.rank = i + 1));

// Compact output: array indexed by id, { t: type, a: [accessories], n: attrCount, r: rank }.
const out = {
  generatedAt: new Date().toISOString(),
  total: TOTAL,
  source: manifest.source,
  punks: punks.map((p) => ({ t: p.type, a: p.acc, n: p.attrs, r: p.rank })),
};

const dest = join(ROOT, "data", "punks-traits.json");
writeFileSync(dest, JSON.stringify(out));
console.log(`wrote ${dest} — ${TOTAL} punks`);
console.log("sample 635 (Alien):", JSON.stringify(out.punks[635]));
console.log("sample 1234:", JSON.stringify(out.punks[1234]));
