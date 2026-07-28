// Known-contract labels — the seed of the Knowledge Base (spec §3). When a
// holder resolves to a service/protocol contract we recognize, we say what it
// is and point somewhere useful, instead of stopping at "held by a contract."
// All public-safe.
//
// Two ways to match, checked in this order:
//   KNOWN       — by exact address, for one-off contracts.
//   KNOWN_CODE  — by bytecode fingerprint (first 16 hex of sha256(getCode)).
//                 Protocol/custody contracts are clones sharing identical code,
//                 so ONE entry here labels every instance — current and future —
//                 with zero per-address upkeep. Run scripts/discover-holders.mjs
//                 to surface unlabeled clusters worth adding.

export const KNOWN = {
  // (address-keyed one-offs go here)
};

export const KNOWN_CODE = {
  // Gondi — peer-to-peer NFT lending. Collateral punks are wrapped and escrowed
  // in the Gondi loan contract; a buyer can often acquire one outright by
  // settling/taking over the loan rather than finding the borrower. This code
  // hash = 0xf41b389e… (248 wrapped punks at time of discovery).
  "0cbd5a0cc8aa91ca": {
    label: "Gondi",
    category: "lending",
    note:
      "This punk is collateral in a loan on Gondi, an NFT lending protocol. A buyer may be able to acquire it outright through the loan — often the fastest path, since you don't need to reach the borrower.",
    url: "https://www.gondi.xyz/",
  },
};

export function knownFor(address, codeHash) {
  if (address && KNOWN[address.toLowerCase()]) return KNOWN[address.toLowerCase()];
  if (codeHash && KNOWN_CODE[codeHash]) return KNOWN_CODE[codeHash];
  return null;
}
