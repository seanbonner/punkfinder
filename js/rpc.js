// Minimal read-only Ethereum RPC. Public, keyless, CORS-friendly endpoints —
// used only for contract detection (eth_getCode) so we can tell a smart-contract
// holder (a wrapper, vault, Safe, or protocol) apart from a plain EOA. A miss
// just returns null ("unknown") and never blocks the report.

// Keyless, CORS-enabled (access-control-allow-origin: *), verified returning
// real eth_getCode. Tried in order; first usable answer wins.
const ENDPOINTS = ["https://ethereum-rpc.publicnode.com", "https://eth.drpc.org", "https://1rpc.io/eth"];

// true = has code (contract), false = EOA, null = couldn't determine.
export async function isContract(address) {
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getCode", params: [address, "latest"] }),
      });
      if (!res.ok) continue;
      const json = await res.json();
      const code = json?.result;
      if (typeof code === "string") return code !== "0x" && code !== "0x0";
    } catch {
      // try the next endpoint
    }
  }
  return null;
}
