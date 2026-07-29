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

// Compact output: array indexed by id, { t: type, a: [accessories], n: attrCount }.
// No rarity rank — rarity is disputed/unreliable, so we don't compute or ship it.
const punks = [];
for (let id = 0; id < TOTAL; id++) {
  const p = client.getPunkSync(id, { includeTraits: true });
  const accessories = p.traits.filter((t) => t.kind === "Accessory").map((t) => t.name);
  punks.push({ t: p.punkTypeName, a: accessories, n: p.attributeCount });
}

const out = {
  generatedAt: new Date().toISOString(),
  total: TOTAL,
  source: manifest.source,
  punks,
};

const dest = join(ROOT, "data", "punks-traits.json");
writeFileSync(dest, JSON.stringify(out));
console.log(`wrote ${dest} — ${TOTAL} punks`);
console.log("sample 635 (Alien):", JSON.stringify(out.punks[635]));
console.log("sample 1234:", JSON.stringify(out.punks[1234]));
