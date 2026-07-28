// Discover contract holders of wrapped punks and cluster them by bytecode, so
// protocol/custody contracts (Gondi and friends) surface as big clusters we can
// label in js/known.js. Keyless: punks indexer + public RPC only.
//
//   node scripts/discover-holders.mjs
//
// Gondi collateral is always a *wrapped* punk held by a Gondi contract, and each
// Gondi contract holds many. So we only scan wrapped holders, dedupe to distinct
// owners, keep the ones that are contracts, and group by code hash. Clusters
// that share a code hash are the same contract "version"; matching a known
// Gondi address's hash auto-tags the rest of its version. New versions (new
// hash) show up as a fresh large cluster to eyeball and seed.

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const INDEXER = "https://indexer.punksmarket.app";
const RPCS = ["https://ethereum-rpc.publicnode.com", "https://eth.drpc.org", "https://1rpc.io/eth"];
const __dirname = dirname(fileURLToPath(import.meta.url));

async function gql(query, variables) {
  const res = await fetch(INDEXER, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join("; "));
  return json.data;
}

// Paginate one entity's wrapped holders into owner -> punk count.
async function collectWrapped(entity, tally) {
  let after = null;
  for (;;) {
    const data = await gql(
      `query($after: String){ ${entity}(where:{is_wrapped:true}, orderBy:"punk_id", orderDirection:"asc", limit:1000, after:$after){ items{ owner } pageInfo{ hasNextPage endCursor } } }`,
      { after }
    );
    const page = data[entity];
    for (const it of page.items) {
      const a = it.owner?.toLowerCase();
      if (a) tally.set(a, (tally.get(a) || 0) + 1);
    }
    if (!page.pageInfo.hasNextPage) break;
    after = page.pageInfo.endCursor;
  }
}

let rpcIdx = 0;
async function getCode(address) {
  for (let i = 0; i < RPCS.length; i++) {
    const url = RPCS[(rpcIdx + i) % RPCS.length];
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getCode", params: [address, "latest"] }),
      });
      const json = await res.json();
      if (typeof json?.result === "string") {
        rpcIdx = (rpcIdx + i) % RPCS.length; // stick with the one that worked
        return json.result;
      }
    } catch {
      // rotate
    }
  }
  return null;
}

// Small concurrency pool so we don't hammer the RPC.
async function mapPool(items, size, fn) {
  const out = new Array(items.length);
  let n = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (n < items.length) {
        const i = n++;
        out[i] = await fn(items[i], i);
      }
    })
  );
  return out;
}

async function loadKnown() {
  try {
    const mod = await import(join(__dirname, "..", "js", "known.js"));
    return { byAddr: mod.KNOWN || {}, byCode: mod.KNOWN_CODE || {} };
  } catch {
    return { byAddr: {}, byCode: {} };
  }
}

async function main() {
  console.log("Collecting wrapped-punk holders from the indexer…");
  const tally = new Map();
  await collectWrapped("punks", tally);
  await collectWrapped("v1Punks", tally);
  const owners = [...tally.keys()];
  console.log(`  ${owners.length} distinct wrapped-punk holders (V1+V2 combined).`);

  console.log("Fetching bytecode for each holder…");
  const codes = await mapPool(owners, 6, (a) => getCode(a));

  const { byAddr, byCode } = await loadKnown();
  const clusters = new Map(); // codeHash -> { hash, addrs:[{addr,punks}], punks }

  owners.forEach((addr, i) => {
    const code = codes[i];
    if (!code || code === "0x" || code === "0x0") return; // EOA
    const hash = createHash("sha256").update(code).digest("hex").slice(0, 16);
    const c = clusters.get(hash) || { hash, addrs: [], punks: 0 };
    c.addrs.push({ addr, punks: tally.get(addr) });
    c.punks += tally.get(addr);
    clusters.set(hash, c);
  });

  const ranked = [...clusters.values()].sort((a, b) => b.punks - a.punks);
  console.log(`\nContract holders grouped by bytecode (${ranked.length} distinct code hashes):\n`);
  for (const c of ranked.slice(0, 20)) {
    const label = byCode[c.hash]?.label;
    const tag = label
      ? `  ✓ ${label} (labeled by code hash)`
      : c.addrs.length > 1
        ? "  (uniform cluster — likely one protocol; identify + add to KNOWN_CODE)"
        : "";
    console.log(`code ${c.hash} · ${c.addrs.length} addr · ${c.punks} punks${tag}`);
    for (const { addr, punks } of c.addrs.sort((a, b) => b.punks - a.punks).slice(0, 6)) {
      console.log(`    ${addr}  (${punks} punks)${byAddr[addr] ? "  [known: " + byAddr[addr].label + "]" : ""}`);
    }
  }

  const unlabeled = ranked.filter((c) => !byCode[c.hash] && c.addrs.length > 1);
  console.log(
    `\n${ranked.filter((c) => byCode[c.hash]).length} cluster(s) already labeled by code hash. ` +
      `${unlabeled.length} unlabeled multi-address cluster(s) — each is one protocol worth a KNOWN_CODE entry.`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
