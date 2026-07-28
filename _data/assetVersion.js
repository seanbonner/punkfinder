// Build-time asset version: a short content hash of css/ and js/. Appended to
// asset URLs as ?v= so a returning visitor's cache is busted exactly when the
// assets change, and never serves a mismatched js pair across a deploy.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function hashDir(dir, hash) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return; // directory absent on this site
  }
  for (const name of entries.sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) hashDir(full, hash);
    else hash.update(readFileSync(full));
  }
}

export default function () {
  const hash = createHash("sha1");
  hashDir(join(ROOT, "css"), hash);
  hashDir(join(ROOT, "js"), hash);
  return hash.digest("hex").slice(0, 8);
}
