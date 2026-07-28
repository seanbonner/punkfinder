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

// Identify a contract: on-chain name()/symbol(), then a Blockscout name/tag
// fallback. Cheap way to tell what a cluster is (GONDI_MULTI_SOURCE_LOAN,
// GnosisSafeProxy, Escrow, …) without an explorer key.
async function ethCall(to, selector) {
  for (let i = 0; i < RPCS.length; i++) {
    const url = RPCS[(rpcIdx + i) % RPCS.length];
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data: selector }, "latest"] }),
      });
      const j = await res.json();
      if (typeof j?.result === "string") return j.result === "0x" ? null : j.result;
    } catch {
      // rotate
    }
  }
  return null;
}
function decodeAbiString(hex) {
  if (!hex) return null;
  const b = hex.slice(2);
  try {
    const len = parseInt(b.slice(64, 128), 16);
    if (len > 0 && len < 200) return Buffer.from(b.slice(128, 128 + len * 2), "hex").toString("utf8");
  } catch {}
  try {
    const s = Buffer.from(b.slice(0, 64), "hex").toString("utf8").replace(/\0+$/, "");
    if (/^[\x20-\x7e]{2,}$/.test(s)) return s;
  } catch {}
  return null;
}
async function identify(addr) {
  const name = decodeAbiString(await ethCall(addr, "0x06fdde03")); // name()
  if (name) return name;
  const symbol = decodeAbiString(await ethCall(addr, "0x95d89b41")); // symbol()
  if (symbol) return symbol;
  try {
    const r = await fetch(`https://eth.blockscout.com/api/v2/addresses/${addr}`);
    if (r.ok) {
      const j = await r.json();
      return j?.name || j?.public_tags?.[0]?.display_name || null;
    }
  } catch {}
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
    return { byAddr: mod.KNOWN || {}, byCode: mod.KNOWN_CODE || {}, byName: mod.KNOWN_NAME || [] };
  } catch {
    return { byAddr: {}, byCode: {}, byName: [] };
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

  const { byAddr, byCode, byName } = await loadKnown();
  const clusters = new Map(); // codeHash -> { hash, addrs:[{addr,punks}], punks }

  owners.forEach((addr, i) => {
    const code = codes[i];
    if (!code || code === "0x" || code === "0x0") return; // plain EOA
    // EIP-7702 (code = 0xef0100||delegate): individual smart-account EOAs, not a
    // protocol. They cluster by delegate, but each is its own owner.
    const is7702 = /^0xef0100[0-9a-f]{40}$/i.test(code);
    const hash = createHash("sha256").update(code).digest("hex").slice(0, 16);
    const c = clusters.get(hash) || { hash, addrs: [], punks: 0, is7702 };
    c.addrs.push({ addr, punks: tally.get(addr) });
    c.punks += tally.get(addr);
    clusters.set(hash, c);
  });

  const ranked = [...clusters.values()].sort((a, b) => b.punks - a.punks);
  console.log(`\nContract holders grouped by bytecode (${ranked.length} distinct code hashes):`);
  console.log("Identifying each cluster on-chain (name/symbol/explorer)…\n");
  for (const c of ranked.slice(0, 20)) {
    const top = c.addrs.sort((a, b) => b.punks - a.punks);
    let ident;
    if (byCode[c.hash]) {
      ident = `✓ ${byCode[c.hash].label} (labeled by code)`;
    } else if (c.is7702) {
      ident = "EIP-7702 smart-account EOAs (individual wallets, not a protocol)";
    } else {
      const nm = await identify(top[0].addr);
      const named = nm && byName.find(({ pattern }) => pattern.test(nm));
      ident = named
        ? `✓ ${named.info.label} (matched by name: ${nm})`
        : nm || (c.addrs.length > 1 ? "?? uniform cluster — identify + add to KNOWN_CODE/NAME" : "??");
    }
    console.log(`code ${c.hash} · ${c.addrs.length} addr · ${c.punks} punks · ${ident}`);
    for (const { addr, punks } of top.slice(0, 4)) {
      console.log(`    https://evm.now/address/${addr}  (${punks} punks)${byAddr[addr] ? "  [known: " + byAddr[addr].label + "]" : ""}`);
    }
  }

  const unlabeled = ranked.filter((c) => !byCode[c.hash] && !c.is7702 && c.addrs.length > 1);
  console.log(
    `\n${ranked.filter((c) => byCode[c.hash]).length} cluster(s) labeled by code hash. ` +
      `${unlabeled.length} unlabeled multi-address non-7702 cluster(s) — candidates for a KNOWN_CODE entry.`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
