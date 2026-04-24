# OC Stamp Protocol

**Bitcoin-identity-bound content attestation with block-anchored priority.**

OC Stamp is a protocol for signing arbitrary bytes with a Bitcoin address, anchoring the moment of signing to a specific Bitcoin block, and publishing the result as a self-contained envelope that anyone can verify offline — forever.

A stamp proves three things at once:

1. **Authorship** — a specific Bitcoin address signed this exact byte sequence (BIP-322).
2. **Priority** — the hash of that byte sequence existed before Bitcoin block N (OpenTimestamps).
3. **Stake at signing** *(optional)* — the signing address carried a specific OrangeCheck attestation (sats bonded × days unspent) at the moment the stamp was created.

Strip any one of those three and you degrade to a known commoditized primitive — PGP, OpenTimestamps alone, or a bare Bitcoin-address signature. The combination is what makes OC Stamp Bitcoin-load-bearing and not substitutable on Ed25519.

OC Stamp is a **sub-product of [OrangeCheck](https://ochk.io)**, following the same discipline as [OC Lock](https://github.com/orangecheck/oc-lock-protocol): a single normative spec, a reference TypeScript implementation in [`oc-packages`](https://github.com/orangecheck/oc-packages), and a hosted reference client at [stamp.ochk.io](https://stamp.ochk.io) that you can host yourself.

## This repo

This repository is the **normative protocol specification**. No code lives here — only:

| File | What it is |
|---|---|
| [`SPEC.md`](./SPEC.md) | The normative v1 specification — canonical message, envelope format, OTS integration, Nostr directory, verification algorithm, error codes, compliance checklist. |
| [`PROTOCOL.md`](./PROTOCOL.md) | Narrative walkthrough with flow diagrams (single stamp, batched aggregation, verification offline, commit signing). |
| [`WHY.md`](./WHY.md) | Design rationale. Why provenance needs a Bitcoin primitive. Why C2PA, PGP, and OTS-alone don't fit. What we kept from each. |
| [`SECURITY.md`](./SECURITY.md) | Threat model, trust assumptions, compliance requirements, report channel. |
| [`CHANGELOG.md`](./CHANGELOG.md) | Version history. |

## Reference implementation

The TypeScript reference implementation is published to **npm**, maintained in the [`oc-packages`](https://github.com/orangecheck/oc-packages) monorepo:

| Package | npm | Purpose |
|---|---|---|
| [`@orangecheck/stamp-core`](https://www.npmjs.com/package/@orangecheck/stamp-core) | ![npm](https://img.shields.io/npm/v/@orangecheck/stamp-core?label=) | Canonical message, envelope format, `stamp()`, `verify()`. Loads `test-vectors/` for conformance. |
| [`@orangecheck/stamp-ots`](https://www.npmjs.com/package/@orangecheck/stamp-ots) | ![npm](https://img.shields.io/npm/v/@orangecheck/stamp-ots?label=) | OpenTimestamps calendar submission, proof parsing, pending → confirmed upgrade, Bitcoin header anchoring. |

```
npm i @orangecheck/stamp-core @orangecheck/stamp-ots
```

## Test vectors

The [`test-vectors/`](./test-vectors/) directory holds cross-implementation conformance fixtures. Each vector is a fixed input (bytes, signer address, signed-at, optional stake) plus the expected canonical message, envelope id, and — where OTS proofs are deterministic — expected anchor fields. A conforming implementation produces byte-identical envelopes for every vector. See [`test-vectors/README.md`](./test-vectors/README.md).

## Reference web client

A live implementation of OC Stamp v1 will run at **[stamp.ochk.io](https://stamp.ochk.io)**. Source: [`orangecheck/oc-stamp-web`](https://github.com/orangecheck/oc-stamp-web).

## How it works (one paragraph)

Every OC Stamp user has a Bitcoin address. To stamp something, the user computes the SHA-256 of the content, builds a short canonical message that binds (address, content hash, length, mime, signed-at) in a wallet-legible form, signs it once with BIP-322, and hashes the result into an OpenTimestamps calendar. Within about an hour, OTS upgrades the proof to a full Merkle path rooted in a Bitcoin block header. The final envelope — a self-contained JSON object — carries the canonical message, the BIP-322 signature, the OTS proof, and an optional reference to an OrangeCheck attestation describing the signer's stake at the moment of signing. Verification is a pure function of envelope plus Bitcoin block headers: no server, no lookup, no dependency on ochk.io.

For durable public discovery, stamps MAY be published to Nostr as kind-30083 events with a `d` tag of `oc-stamp:<id>`. This is optional — the envelope is self-contained and can travel over any transport (URL fragment, email, IPFS, QR code, paper).

## Layers

```
┌─────────────────────────────────────────────────────────────────┐
│  oc-stamp-web            create / verify / open UI              │
│  git-stamp               CLI plugin for commit/tag signing      │
├─────────────────────────────────────────────────────────────────┤
│  @orangecheck/stamp-core    canonical msg, envelope, verify     │
│  @orangecheck/stamp-ots     OTS submit / parse / upgrade        │
├─────────────────────────────────────────────────────────────────┤
│  OrangeCheck          stake signal (optional, stamp-embedded)   │
│  OpenTimestamps       Bitcoin-block priority anchor             │
│  Nostr                stamp directory (kind 30083, optional)    │
│  Bitcoin              address ownership (BIP-322)               │
└─────────────────────────────────────────────────────────────────┘
```

## Related repositories

- [`orangecheck/oc-packages`](https://github.com/orangecheck/oc-packages) — the `@orangecheck/stamp-*` packages live here, alongside the rest of the OrangeCheck SDK.
- [`orangecheck/oc-stamp-web`](https://github.com/orangecheck/oc-stamp-web) — reference web client.
- [`orangecheck/oc-lock-protocol`](https://github.com/orangecheck/oc-lock-protocol) — sibling sub-product: private envelopes addressed to a Bitcoin address.
- [`orangecheck/oc-web`](https://github.com/orangecheck/oc-web) — OrangeCheck site.

## Status

v1.0 — spec-stable.

## Positioning

OC Stamp is designed to **compose with, not replace**, existing provenance primitives:

- **OpenTimestamps** is the anchoring layer. We do not rebuild it; we depend on it and credit it. Calendar operators are interchangeable the same way Nostr relays are: a handful of defaults, anyone can run their own.
- **C2PA / Content Credentials** is the incumbent for enterprise media provenance (Adobe, Nikon, NYT). OC Stamp is for the open web that isn't enterprise: independent writers, open-source release signers, Nostr publishers, DAOs, legal self-notarizers. The differentiator: C2PA proves a vendor vouches for your content; OC Stamp proves you signed it, with your Bitcoin address, anchored to Bitcoin.
- **PGP** has authorship without stake and without a Bitcoin-chain anchor, and its keyserver model has failed every security review for twenty years. OC Stamp uses the wallet the signer already owns.
- **Nostr kind-1 events** have authorship but no canonical envelope and no chain anchor. Stamps are publishable as Nostr events but verifiable without asking any relay.

See [`WHY.md`](./WHY.md) for the full design rationale.

## License

The specification and prose are MIT; see [LICENSE](./LICENSE). The reference implementation in `oc-packages` is also MIT.
