// Known-contract labels — the seed of the Knowledge Base (spec §3). When a
// holder resolves to a service/protocol contract we recognize, we can say what
// it is and point the visitor somewhere useful, instead of stopping at "held by
// a contract." All public-safe; keyed by lowercased address. This migrates into
// the KB flat files when that lands.
export const KNOWN = {
  // Gondi — peer-to-peer NFT lending. A punk sitting here is loan collateral,
  // and a buyer can often acquire it outright by settling/taking over the loan
  // rather than tracking down the borrower.
  "0xf41b389e0c1950dc0b16c9498eae77131cc08a56": {
    label: "Gondi",
    category: "lending",
    note:
      "This punk is collateral in a loan on Gondi, an NFT lending protocol. A buyer may be able to acquire it outright through the loan — often the fastest path, since you don't need to reach the borrower.",
    url: "https://www.gondi.xyz/",
  },
};

export function knownFor(address) {
  return address ? KNOWN[address.toLowerCase()] || null : null;
}
