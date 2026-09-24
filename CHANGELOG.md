# Changelog

## [Unreleased] — 2026-04

### Errata — 2026-09-24

- **`SPEC.md` §6.2** told clients to POST `id` to `/timestamp/:hash`. The
  OpenTimestamps calendar protocol serves upgrades with
  `GET /timestamp/<hex(commitment)>`, where the commitment is the message at
  the pending calendar attestation, and the answer is a timestamp rooted there
  that the client merges into its proof. Corrected. `@orangecheck/stamp-ots`
  0.2.0 implements the corrected procedure.
- **`SPEC.md` §6.3 and §8 step 5** now state two checks that were implied but
  not written: the proof must commit to `id`, and the block header at
  `block_height` must hash to `block_hash`. The Merkle root is compared in
  header byte order.

### Errata — 2026-09-03

- **`SPEC.md` §7** described 30084 as a "OC Stamp / OC Agent shared action
  transport". It is not shared: 30084 is OC Agent's action kind alone
  (`oc-agent-protocol` §4 L55 — "OC Stamp v1 publishes stamps on kind 30083,
  not 30084"), and this spec's own normative text puts stamps on 30083 (§7
  L248, L260, §15). Corrected. No on-the-wire change to what this spec
  requires — the line was a stray cross-reference, not a rule.
- That line is the likely origin of a real defect: the reference site
  `oc-stamp-web` published every stamp on kind **30084** until 2026-09-03, so
  a conformant verifier querying `kinds:[30083]` found none of them, and
  `relay.ochk.io` (which allows only `oc-agent-act:` d-tags on 30084) rejected
  them outright. Fixed in `oc-stamp-web`; stamps published before that date are
  discoverable only under 30084, so a client wanting full history should read
  both kinds and route on the `oc-stamp:` d-tag.

### Spec

- **`LIFECYCLE.md`** — normative companion document specifying what a publisher MAY do to a stamp after publication and what a verifier MUST do in response. Pins down the stamp-is-immutable-and-non-revocable position that `SPEC.md` §10 left informal. No protocol changes; clarification only. Reaffirms that conforming verifiers MUST ignore any `retract id:X` informal pattern, dashboard-local hide flags, and NIP-09 deletion-request events.
- **`SPEC.md` §7, §15 + `WHY.md` H6 / design rule 7** — kind-30083 is now documented as **co-claimed** with OC Agent (delegation envelopes under the disjoint `d`-tag namespace `oc-agent-del:`). Verifiers MUST filter by `#d` prefix or by envelope `kind` when querying kind 30083. No on-the-wire change for OC Stamp; clarifies the family-level reality created by OC Agent v1 (2026-04).
- No other protocol changes; v1.0.0 remains current. SPEC §3.1 and §4 already required the constraints the SDK now enforces at runtime.

### Reference SDK

- `@orangecheck/stamp-core` **0.1.1** — non-breaking. Added `validateCanonicalInput(input)` that's called by `stamp()` before producing the canonical bytes, catching whitespace in addresses, non-hex content hashes, fractional lengths, and missing-Z signed_at values before they produce a signature nobody can verify. Added `hashContent(bytes)` helper. 60/60 tests green.


All notable changes to the OC Stamp protocol and reference SDK.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.0] — 2026-04

Initial public release.

### Added

- Canonical message format (§3 of SPEC) — `oc-stamp:v1` domain-separated, BIP-322 signable, wallet-legible.
- Self-contained `.stamp` envelope format (§4).
- OpenTimestamps integration with pending → confirmed upgrade path (§6).
- Optional Nostr kind-30083 directory with `oc-stamp:<id>` d-tag namespace (§7). _(Earlier release notes referenced kind-30078; that was a typo. The spec and reference SDK have always shipped on kind-30083.)_
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
