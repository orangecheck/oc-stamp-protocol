# Changelog

## [Unreleased] — 2026-04

### Reference SDK

- `@orangecheck/stamp-core` **0.1.1** — non-breaking. Added `validateCanonicalInput(input)` that's called by `stamp()` before producing the canonical bytes, catching whitespace in addresses, non-hex content hashes, fractional lengths, and missing-Z signed_at values before they produce a signature nobody can verify. Added `hashContent(bytes)` helper. 60/60 tests green.

### Spec

- No protocol changes; v1.0.0 remains current. SPEC §3.1 and §4 already required the constraints the SDK now enforces at runtime.


All notable changes to the OC Stamp protocol and reference SDK.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.0] — 2026-04

Initial public release.

### Added

- Canonical message format (§3 of SPEC) — `oc-stamp:v1` domain-separated, BIP-322 signable, wallet-legible.
- Self-contained `.stamp` envelope format (§4).
- OpenTimestamps integration with pending → confirmed upgrade path (§6).
- Optional Nostr kind-30078 directory with `oc-stamp:<id>` d-tag namespace (§7).
- Full verification algorithm with 7 error codes (§8, §10).
- Optional stake context via OrangeCheck attestation reference (§2).
- RFC 8785 JSON canonicalization (§5).
- Compliance checklist (§12).
- Reference SDK in TypeScript, published from [`orangecheck/oc-packages`](https://github.com/orangecheck/oc-packages) as `@orangecheck/stamp-core` and `@orangecheck/stamp-ots`.
- Test vectors in [`test-vectors/`](./test-vectors/) covering minimal, with-stake, with-ref, and OTS-confirmed envelopes.
- `SECURITY.md` with threat model, trust assumptions, and report channel.

### Design principles

- Bitcoin-load-bearing: the combination of BIP-322 authorship + OTS Bitcoin anchor + OrangeCheck stake is not substitutable on Ed25519.
- Offline-verifiable: given the envelope and a Bitcoin headers bundle, verification needs no network call.
- Composable: stands on OpenTimestamps, BIP-322, OrangeCheck, Nostr — rebuilds none of them.
- Sub-product of OrangeCheck: shares envelope discipline, signing primitive, and directory kind with OC Lock.
