# OC Stamp test vectors

Fixed inputs, fixed intermediate byte strings, fixed outputs. Any conforming OC Stamp v1 implementation MUST produce byte-identical canonical messages and envelope ids for these vectors. If you're implementing OC Stamp in a new language, these are the ground truth.

## Structure

Each `.json` file in this directory is an independent vector:

```json
{
  "description": "what this vector exercises",
  "inputs": {
    "address": "bc1q…",
    "content_hash": "sha256:…",
    "content_length": 12843,
    "content_mime": "text/markdown",
    "signed_at": "2026-04-24T18:30:00Z",
    "content_ref": "ipfs://…" | null,
    "stake": null | { "attestation_id": "…", "sats_bonded": 500000, "days_unspent": 180 },
    "ots": null | { "status": "pending" | "confirmed", ... },
    "expected_sig_value": "<base64: a placeholder in v01–v09, a real signature in v10–v14>"
  },
  "expected": {
    "canonical_message": "<the exact bytes as a string: lines joined by LF, no trailing LF>",
    "canonical_message_bytes_len": 232,
    "id": "<64-hex SHA-256 of canonical message>",
    "envelope": { "…": "…" }
  },
  "signature_check": {
    "address_type": "p2pkh" | "p2sh_p2wpkh" | "p2wpkh" | "p2tr",
    "format": "bip137" | "bip322-simple",
    "signed_message": "<the hex id, the string the wallet signed>",
    "expected": { "outcome": "ACCEPT" } | { "outcome": "REJECT", "error_code": "E_BAD_SIG" }
  }
}
```

`signature_check` is present only in v10–v14.

## Conformance

Given the `inputs`, a compliant implementation MUST:

1. Build the canonical message byte-identical to `expected.canonical_message` (each line LF-terminated, no trailing LF after the `signed_at` line, no BOM).
2. Compute `id = sha256(canonical_message_bytes)` and match `expected.id`.
3. Serialize the envelope with RFC 8785 JSON canonicalization, matching `expected.envelope` when re-parsed.
4. Return `id` as lowercase hex.
5. For a vector with `signature_check`, verify `expected.envelope` with SPEC §8.1 step 4 and the real BIP-322 verifier: `ACCEPT` means the signature verifies, `REJECT` means verification fails with `error_code`.

If any of these diverge, the implementation is non-conformant. Typical bugs:

- Trailing LF after the `signed_at` line (the spec says no trailing LF).
- CRLF line endings instead of LF.
- Capitalizing the hex `id` or `content_hash`.
- Missing the domain separator `oc-stamp:v1` on the first line.
- Emitting numeric fields as strings in the envelope JSON.

## A note on signatures and OTS proofs

- In v01–v09, `expected_sig_value` is a placeholder for bookkeeping, not a signature. Those vectors test the canonical message, the id and the envelope; a verifier that runs them needs its signature check stubbed.
- v10–v14 carry real signatures from disclosed burn keys (see "Signature vectors" below). Two wallets signing the same id need not produce the same bytes: an ECDSA wallet may not use RFC 6979 nonces, and a BIP-340 (P2TR) signature takes fresh auxiliary randomness. The assertion is that a signature **verifies**, never that it equals a stored one.
- **OpenTimestamps proofs are non-deterministic** by construction — they depend on what other users submitted to the calendar in the same window. Vectors with `ots` fields use **fixtured proof blobs** that are valid for testing the parse / upgrade / anchor-verify code paths, but they do not chain to any real Bitcoin block. A real calendar submission produces a real proof; the canonical-id computation is independent of `ots` bytes.

## Test harness

The `@orangecheck/stamp-core` suite in `oc-packages/stamp-core/` loads this directory and asserts:

1. `canonical_message` is reconstructed byte-identical from inputs.
2. `id` equals `sha256(canonical_message)`.
3. Envelope fields re-serialize to the declared canonical form.
4. Each vector with `signature_check` verifies, or is refused with its `error_code`, through the real `@orangecheck/bip322` verifier, and the set covers all four address types plus a refused signature.

New implementations should add a similar test.

## Current vectors

| File | Exercises |
|---|---|
| `v01-minimal.json` | Single stamp, no stake, no ref, no OTS — the canonical-message / id baseline |
| `v02-with-stake.json` | Includes `stake` block with OrangeCheck attestation reference |
| `v03-with-ref.json` | Includes `content.ref` pointer (IPFS) |
| `v04-ots-pending.json` | OTS proof in pending state (not yet anchored) |
| `v05-ots-confirmed.json` | OTS proof upgraded to confirmed with block_height + block_hash |
| `v06-stake-stripped.json` | v02 with `stake` removed: same canonical message, id and signature; a stake policy sees no stake (`E_STAKE_UNMET`) |
| `v07-stake-swapped.json` | v02 with another address's attestation swapped in: same id; the stake check MUST reject it (`E_STAKE_UNMET`) |
| `v08-stake-own.json` | v02's own attestation, resolved now with values below the declared ones: the stake check accepts on the resolved values |
| `v09-signed-at-millis.json` | v01 with `signed_at` in §0's millisecond form: the id covers it exactly as written |
| `v10-sig-p2pkh.json` | v01's content signed by a P2PKH address, legacy BIP-137 form: MUST verify |
| `v11-sig-p2sh-p2wpkh.json` | The same, P2SH-P2WPKH, BIP-322 simple form: MUST verify |
| `v12-sig-p2wpkh.json` | The same, P2WPKH, BIP-322 simple form: MUST verify |
| `v13-sig-p2tr.json` | The same, P2TR key path, BIP-322 simple form: MUST verify |
| `v14-sig-tampered.json` | v12 with one signature byte flipped: MUST NOT verify (`E_BAD_SIG`) |

### Stake-check vectors (v06–v08)

These carry a `stake_check` block: the attestation as resolved at verification
time (`attestation_id`, the `address` that signed it, current `sats` and `days`),
a policy, and the expected outcome of SPEC §8.1 step 7. Resolution needs the
chain, so the vector supplies its result. A conformant stake check accepts only
an attestation whose id is `stake.attestation_id` and whose address is
`signer.address`, and judges the resolved values, never the declared ones.

### Signature vectors (v10–v14)

These sign v01's content (the same `content_hash`, `content_length`, `content_mime` and `signed_at`) from four **disclosed burn keys**. The private keys are published in `generate-signatures.mjs` and must never hold funds: anyone can spend what is sent to their addresses. Keys #1 and #2 are the ones `oc-attest-protocol`'s tv21 and tv22 use.

| Key | Private key (hex) | Address type | Address | Vectors |
|---|---|---|---|---|
| #1 | `01` repeated 32 times | P2WPKH | `bc1q0xcqpzrky6eff2g52qdye53xkk9jxkvrh6yhyw` | v12, v14 |
| #2 | `02` repeated 32 times | P2TR, key path (BIP-86) | `bc1p5e6v9v2j5wp3y6c79gaqdqltq7jdv45fswnnm7exmmp2020mqepsmcx06p` | v13 |
| #3 | `03` repeated 32 times | P2PKH | `16yH2E12NYA5pg1d4BB7wtXXnBTZ8Lws7L` | v10 |
| #4 | `04` repeated 32 times | P2SH-P2WPKH | `38Sqvnn4PbsHHfarwki7bm2vSeYvuZDgpz` | v11 |

The wallet signs the hex id (SPEC §4.5), so `signature_check.signed_message` equals `expected.id`. SPEC §8.1 step 4 verifies the signature under BIP-322 for whatever address the envelope names; v11 covers the nested SegWit form.

`node test-vectors/generate-signatures.mjs` writes v10–v14 again. It loads bip322-js 3, bitcoinjs-lib 6, ecpair 2 and @bitcoinerlab/secp256k1 from `oc-packages/wallet-adapter/node_modules` in a clone next to this repository, or from the directory in `OC_SIGNER_NODE_MODULES`. v10–v12 and v14 come out byte for byte the same; v13's P2TR signature differs on each run and still verifies.
