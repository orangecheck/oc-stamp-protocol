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
    "expected_sig_value": "<base64 placeholder; real signatures are non-deterministic for ECDSA>"
  },
  "expected": {
    "canonical_message": "<exact LF-terminated bytes as a string>",
    "canonical_message_bytes_len": 232,
    "id": "<64-hex SHA-256 of canonical message>",
    "envelope": { "…": "…" }
  }
}
```

## Conformance

Given the `inputs`, a compliant implementation MUST:

1. Build the canonical message byte-identical to `expected.canonical_message` (each line LF-terminated, no trailing LF after the `signed_at` line, no BOM).
2. Compute `id = sha256(canonical_message_bytes)` and match `expected.id`.
3. Serialize the envelope with RFC 8785 JSON canonicalization, matching `expected.envelope` when re-parsed.
4. Return `id` as lowercase hex.

If any of these diverge, the implementation is non-conformant. Typical bugs:

- Trailing LF after the `signed_at` line (the spec says no trailing LF).
- CRLF line endings instead of LF.
- Capitalizing the hex `id` or `content_hash`.
- Missing the domain separator `oc-stamp:v1` on the first line.
- Emitting numeric fields as strings in the envelope JSON.

## A note on signatures and OTS proofs

- BIP-322 signatures over ECDSA addresses (P2PKH, P2WPKH) are **non-deterministic** because ECDSA uses random k. Vectors cannot specify an exact `sig.value` and expect reproducibility across wallets. The `expected_sig_value` field is a placeholder for bookkeeping; the implementation-side assertion is that the signature **verifies**, not that it equals a specific blob.
- BIP-322 signatures over Schnorr addresses (P2TR, BIP-340) are deterministic when RFC 6979-style nonce derivation is used, but vendor wallets vary. Treat Schnorr sig values as verify-only.
- **OpenTimestamps proofs are non-deterministic** by construction — they depend on what other users submitted to the calendar in the same window. Vectors with `ots` fields use **fixtured proof blobs** that are valid for testing the parse / upgrade / anchor-verify code paths, but they do not chain to any real Bitcoin block. A real calendar submission produces a real proof; the canonical-id computation is independent of `ots` bytes.

## Test harness

The `@orangecheck/stamp-core` suite in `oc-packages/stamp-core/` loads this directory and asserts:

1. `canonical_message` is reconstructed byte-identical from inputs.
2. `id` equals `sha256(canonical_message)`.
3. Envelope fields re-serialize to the declared canonical form.

New implementations should add a similar test.

## Current vectors

| File | Exercises |
|---|---|
| `v01-minimal.json` | Single stamp, no stake, no ref, no OTS — the canonical-message / id baseline |
| `v02-with-stake.json` | Includes `stake` block with OrangeCheck attestation reference |
| `v03-with-ref.json` | Includes `content.ref` pointer (IPFS) |
| `v04-ots-pending.json` | OTS proof in pending state (not yet anchored) |
| `v05-ots-confirmed.json` | OTS proof upgraded to confirmed with block_height + block_hash |
