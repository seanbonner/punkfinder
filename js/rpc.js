// Minimal read-only Ethereum RPC. Public, keyless, CORS-friendly endpoints —
// used to fetch a holder's bytecode so we can (a) tell a contract holder from a
// plain EOA and (b) fingerprint it, since protocol/custody contracts (Gondi et
// al.) are bytecode clones we label by code hash (see js/known.js). A miss
// returns nulls ("unknown") and never blocks the report.

// Keyless, CORS-enabled (access-control-allow-origin: *), verified returning
// real eth_getCode. Tried in order; first usable answer wins.
const ENDPOINTS = ["https://ethereum-rpc.publicnode.com", "https://eth.drpc.org", "https://1rpc.io/eth"];

async function fetchCode(address) {
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getCode", params: [address, "latest"] }),
      });
      if (!res.ok) continue;
      const json = await res.json();
      if (typeof json?.result === "string") return json.result;
    } catch {
      // try the next endpoint
    }
  }
  return null;
}

// First 16 hex of SHA-256 over the code string — same recipe as
// scripts/discover-holders.mjs, so hashes match across tool and site.
async function codeFingerprint(code) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

// { isContract: true|false|null, codeHash: string|null }
export async function getCodeInfo(address) {
  const code = await fetchCode(address);
  if (code == null) return { isContract: null, codeHash: null };
  const contract = code !== "0x" && code !== "0x0";
  return { isContract: contract, codeHash: contract ? await codeFingerprint(code) : null };
}
