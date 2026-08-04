// Known-contract labels — the seed of the Knowledge Base (spec §3). When a
// holder resolves to a service/protocol contract we recognize, we say what it
// is and point somewhere useful, instead of stopping at "held by a contract."
// All public-safe.
//
// Three ways to match, checked in order:
//   KNOWN       — exact address, for one-off contracts.
//   KNOWN_CODE  — bytecode fingerprint (first 16 hex of sha256(getCode)); one
//                 entry covers every clone with identical code.
//   KNOWN_NAME  — on-chain name() pattern. Best for a protocol that ships new
//                 contract versions over time but keeps a stable name (Gondi's
//                 contracts all report GONDI_*), so new versions are caught with
//                 no upkeep. Run scripts/discover-holders.mjs to find candidates.

const gondi = {
  label: "Gondi",
  category: "lending",
  note:
    "This punk is held in Gondi, an NFT lending protocol (as loan collateral or a Gondi vault). It may be acquirable directly through the platform — often by settling or taking over the loan — rather than by reaching the owner.",
  url: "https://www.gondi.xyz/",
};

export const KNOWN = {
  // Larva Labs — original CryptoPunks creators; their official holdings wallet.
  // Identity label only (no acquisition Lead).
  "0x8088d74111a2368f5b7f0064a581d3bb72e6527e": { label: "Larva Labs" },
};

export const KNOWN_CODE = {
  // (bytecode-fingerprint entries go here)
};

export const KNOWN_NAME = [
  // Gondi: GONDI_MULTI_SOURCE_LOAN, GONDI_USER_VAULT, and future versions.
  { pattern: /^GONDI/i, info: gondi },
];

export function knownFor(address, { codeHash, contractName } = {}) {
  if (address && KNOWN[address.toLowerCase()]) return KNOWN[address.toLowerCase()];
  if (codeHash && KNOWN_CODE[codeHash]) return KNOWN_CODE[codeHash];
  if (contractName) {
    for (const { pattern, info } of KNOWN_NAME) if (pattern.test(contractName)) return info;
  }
  return null;
}
