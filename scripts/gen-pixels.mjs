// Generate data/punks-pixels.json — every punk's 24x24 indexed pixels + the
// 222-color palette — from the @networked-art/punks-sdk offline dataset, so the
// site can render punk images locally (no cryptopunks.app hotlink). Run locally
// against the sibling SDK; the JSON is committed and served. ~566K gzip, loaded
// once client-side and cached (js/render.js). Re-run only to refresh.
//
//   node scripts/gen-pixels.mjs

import { writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SDK = join(ROOT, "..", "..", "cryptopunks", "sdk", "dist");
if (!existsSync(join(SDK, "index.js"))) {
  console.error(`SDK dist not found at ${SDK}. Build the cryptopunks/sdk workspace first.`);
  process.exit(1);
}

const idx = await import(join(SDK, "index.js"));
const { bundledOfflinePunksData } = await import(join(SDK, "offline-data.js"));
const { bundledOfflinePunksPixelData } = await import(join(SDK, "offline-pixel-data.js"));

// The renderer needs the search files AND the pixel files merged.
const merged = {
  manifestJson: bundledOfflinePunksData.manifestJson,
  files: { ...bundledOfflinePunksData.files, ...bundledOfflinePunksPixelData.files },
};
const dataset = idx.createPunksDataset({ dataset: merged });
const manifest = JSON.parse(bundledOfflinePunksData.manifestJson);

const W = 24;
const H = 24;
const N = manifest.counts.punks;
const L = W * H;
const buf = Buffer.alloc(N * L);
for (let id = 0; id < N; id++) buf.set(dataset.indexedPixels(id), id * L);

const out = {
  w: W,
  h: H,
  total: N,
  palette: manifest.palette, // 222 "RRGGBBAA" hex strings; index 0 = transparent
  pixels: buf.toString("base64"), // N*576 palette indices, row-major per punk
};

const dest = join(ROOT, "data", "punks-pixels.json");
writeFileSync(dest, JSON.stringify(out));
console.log(`wrote ${dest} — ${N} punks, ${W}x${H}, ${manifest.palette.length} colors`);
