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

async function ethCall(to, data) {
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }),
      });
      if (!res.ok) continue;
      const j = await res.json();
      if (typeof j?.result === "string") return j.result === "0x" ? null : j.result;
    } catch {
      // next endpoint
    }
  }
  return null;
}
function hexToBytes(h) {
  const a = new Uint8Array(h.length / 2);
  for (let i = 0; i < a.length; i++) a[i] = parseInt(h.substr(i * 2, 2), 16);
  return a;
}
// Decode a contract's name() return — used to match protocols (Gondi ships new
// contract versions, but name() stays GONDI_*), which outlives any code-hash.
function decodeAbiString(hex) {
  if (!hex) return null;
  const b = hex.slice(2);
  try {
    const len = parseInt(b.slice(64, 128), 16);
    if (len > 0 && len < 200) return new TextDecoder().decode(hexToBytes(b.slice(128, 128 + len * 2)));
  } catch {
    /* fall through */
  }
  try {
    const s = new TextDecoder().decode(hexToBytes(b.slice(0, 64))).replace(/\0+$/, "");
    if (/^[\x20-\x7e]{2,}$/.test(s)) return s;
  } catch {
    /* not a string */
  }
  return null;
}

// { isContract, codeHash, is7702, delegate }
// isContract null = couldn't determine. An EIP-7702 account (code =
// 0xef0100||delegate) is still an EOA — it holds a key and signs transactions —
// so we mark is7702 but leave isContract false, so liveness uses lastActiveAt
// normally instead of the "contract, no liveness" path.
export async function getCodeInfo(address) {
  const code = await fetchCode(address);
  if (code == null) return { isContract: null, codeHash: null, is7702: false, delegate: null };
  if (code === "0x" || code === "0x0") return { isContract: false, codeHash: null, is7702: false, delegate: null };
  const m = /^0xef0100([0-9a-fA-F]{40})$/.exec(code);
  if (m) return { isContract: false, codeHash: null, is7702: true, delegate: `0x${m[1]}`, contractName: null };
  const [codeHash, contractName] = await Promise.all([
    codeFingerprint(code),
    ethCall(address, "0x06fdde03").then(decodeAbiString), // name()
  ]);
  return { isContract: true, codeHash, is7702: false, delegate: null, contractName };
}
