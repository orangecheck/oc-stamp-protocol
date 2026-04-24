# Why OC Stamp exists

> The short answer: **the web has no durable, permissionless, identity-bearing provenance primitive that a normal user can create with a wallet they already own.** Every adjacent system falls short on at least one of (authorship, priority, stake, openness, verifiability). OC Stamp exists to fill that gap by composing three primitives the OrangeCheck ecosystem already ships.

## The gap

Zoom out to the question the open web is currently flunking:

> "Did a human sign this? When? With what skin in the game? Can I verify it a decade from now without a vendor?"

No single incumbent answers all four. Every candidate falls on at least one axis:

| System                     | Authorship | Priority (chain-anchored) | Stake signal | Offline-verifiable | Permissionless |
|----------------------------|:----------:|:-------------------------:|:------------:|:-----------------:|:--------------:|
| PGP                        | ✓          | ✗                         | ✗            | ~ (keyservers)    | ~              |
| OpenTimestamps alone       | ✗          | ✓                         | ✗            | ✓                 | ✓              |
| C2PA / Content Credentials | ✓          | ✗                         | ✗            | x509 dependency   | ✗              |
| Nostr kind-1 event         | ✓ (npub)   | ✗                         | ✗            | ~                 | ✓              |
| EAS (Ethereum attestations)| ✓          | ✓ (Ethereum)              | token-gated  | ✗ (RPC needed)    | ✓              |
| Sign-in-with-Ethereum +    |            |                           |              |                   |                |
|  Arweave                   | ✓          | ✓ (Arweave)               | ✗            | ~                 | ✓              |
| **OC Stamp**               | ✓ (BTC)    | ✓ (Bitcoin)               | ✓ (OC)       | ✓                 | ✓              |

The five columns are not aesthetics. They're architectural load-bearing properties.

- **Authorship without identity binding** → anyone can claim to be you. Bare hashes fail.
- **Priority without a chain anchor** → you can't prove a document existed before a specific moment. Bare signatures fail.
- **Stake without any economic signal** → the content-moderation / sybil-resistance axis is unaddressed. Pure crypto identities fail against farmed accounts.
- **Online-only verifiability** → your protocol dies the day the vendor dies. C2PA dies if Adobe dies. EAS dies if a specific Ethereum RPC dies. OTS alone dies never.
- **Permissioned issuance** → you need a CA's permission to ship provenance. Not the open web.

## Why each adjacent primitive was insufficient

### PGP

- Authorship is fine.
- No priority anchor — you can sign a document claiming any date.
- No stake — anyone can mint as many keys as they want.
- Keyservers are a recurring security disaster (spam poisoning, key takeover, the SKS certificate debacle).
- Two decades of evidence that non-cryptographers cannot manage keys. The only surviving niche is release signing, which `git-stamp` specifically aims to replace.

### OpenTimestamps alone

- Priority is excellent. We depend on it and credit it.
- No authorship — an OTS timestamp commits to a hash, not to a signer. Alice and Bob can both independently timestamp `H(x)` with no way to tell which of them produced `x`.
- No stake.
- OC Stamp's contribution is wrapping OTS with BIP-322 authorship and optional OrangeCheck stake context. **We are not rebuilding OTS. We compose with it.**

### C2PA / Content Credentials

- Authorship via x509, which means a CA has to issue your cert. That's the wrong architecture for independent bloggers, OSS commit signers, Nostr authors. It's the right architecture for Adobe → Nikon → NYT, and that's the lane C2PA is going to own. Fine. Different lane.
- No chain anchor; revocation depends on CA-operated OCSP / CRLs.
- No stake.
- **The right framing for OC Stamp vs C2PA**: "C2PA proves a vendor vouches for your content; OC Stamp proves you signed it, with your Bitcoin address, anchored to Bitcoin."

### Nostr kind-1 events

- Authorship via npub is fine for social context, but an npub has no economic layer and no canonical envelope.
- No chain anchor.
- Content drifts when relays purge old events; kind-1 events are not designed for durable provenance.
- Fine for social, inadequate for "did this document exist before block N."

### EVM / smart-contract notarization (EAS, Arweave signing)

- Authorship ✓.
- Priority ✓ — but anchored in a non-Bitcoin chain. That's a choice the ecosystem makes; OC Stamp is the Bitcoin-native answer.
- Stake is token-gated (EAS issuers), which introduces a governance layer we explicitly don't want.
- Verification requires an RPC. Offline verifiability is degraded.
- Gas fees per stamp.

### DID / Verifiable Credentials (W3C)

- Tries to abstract identity across issuers. In practice, the "DID method" matrix is a sprawl of incompatible resolvers; every VC stack picks a different one.
- The "anchor" is vendor-specific per DID method. `did:btcr` exists but is moribund.
- Stake is absent; VC issuers are trusted authorities, which is the opposite of what OC's economic-signal approach asks for.

## What we kept from each

- **From OpenTimestamps**: the entire anchoring layer, verbatim. Peter Todd's design is right.
- **From PGP**: the "detached signature file alongside content" UX pattern. `.stamp` files are the `.asc` of the next generation.
- **From C2PA**: the discipline of making the authenticity record self-describe the content it covers (hash, mime, length inline).
- **From OC Lock**: the envelope discipline. Self-contained JSON. Canonical form. URL-fragment share links. One-signature UX. Offline verifiability.
- **From OrangeCheck**: the sats-bonded × days-unspent stake signal, composable via `@orangecheck/sdk#verify`. Stamp declares it; any verifier can re-resolve.

## What we explicitly discarded

- **On-chain transactions for stamping.** Gone. No fee for the signer. OTS aggregation is Bitcoin-fee-free at the submitter side (calendars pay).
- **Trusted authorities.** No CA, no issuer registry, no accredited notaries.
- **Key rotation via CA revocation.** Bitcoin wallets don't have that primitive. If an address's key is compromised, the signer should migrate to a new address and stop signing with the old one; past stamps remain valid because the anchor commits to historical state.
- **Proprietary signing formats.** BIP-322 only. Nothing to reimplement.
- **Our own calendar / directory.** Stamp.ochk.io runs an aggregator for convenience, but it's a 100-line service anyone can replicate. The calendars are OTS calendars, the directories are Nostr relays. We don't add new infrastructure; we compose with what exists.

## The design principles that survived

1. **Compose, don't rebuild.** OTS for priority. Nostr for discovery. BIP-322 for authorship. OrangeCheck for stake. The protocol glue is small; the load-bearing systems are already battle-tested.
2. **One signing ceremony per stamp.** BIP-322 once. Everything else is deterministic.
3. **Offline-verifiable.** Given the envelope, a Bitcoin headers bundle, and a BIP-322 verifier, verification needs no network.
4. **Standard, audited crypto only.** secp256k1 (via BIP-322), SHA-256, RFC 8785 JSON canonicalization. No hand-rolled primitives.
5. **Self-contained envelopes.** Transport is user choice: URL fragment, email, IPFS, QR, Nostr, git, USB, paper.
6. **Liveness-scoped trust for aggregators.** An aggregator can refuse service but cannot forge, backdate, or strip stake context.
7. **If a feature works identically on Ed25519, it doesn't belong here.** The combination (BIP-322 + OTS Bitcoin anchor + OrangeCheck stake) is load-bearing on Bitcoin. Strip any one and the system collapses into an existing commoditized primitive. This is the discipline that prevents feature creep into "generic content-signing tool."

## What we still don't have and what we'd do in v2

- **Post-quantum readiness.** secp256k1 and SHA-256 both have finite lifetimes against sufficiently large quantum computers. A PQ variant would wrap `id` in a SLH-DSA or ML-DSA signature alongside the BIP-322 one. Not urgent; not shippable today without wallet upstream cooperation.
- **Content confidentiality.** OC Stamp is public by construction. For stamps over private content, compose with OC Lock: seal the content with Lock, stamp the sealed envelope's hash with Stamp. The stamp is public; the content remains private; the authorship + priority + stake are all durable.
- **Key rotation / multi-signer stamps.** v1 is single-signer. A multi-sig variant could bind `content.hash` to a 2-of-3 address, with the envelope carrying multiple `sig.value`s. Not complicated, not in v1 because the UX overhead isn't worth it until a concrete use case demands it.
- **Revocation.** A signer can publish a revocation stamp (a stamp of the form "I retract stamp `id:X`"), but v1 doesn't standardize the semantics. Verifiers that care can subscribe to a revocation feed on Nostr.
- **Batched witness stamps.** A stamp that attests to a Merkle root over many other stamps. Useful for an aggregator that wants to anchor thousands of user stamps with a single OTS submission. The math is trivial; the spec work is deferred.

## References

- [OpenTimestamps](https://opentimestamps.org) — Peter Todd et al. The anchoring layer. All credit.
- [BIP-322](https://github.com/bitcoin/bips/blob/master/bip-0322.mediawiki) — Karl-Johan Alm. The signing primitive.
- [OrangeCheck SPEC](https://ochk.io/docs/spec) — the identity + stake layer.
- [OC Lock SPEC](https://github.com/orangecheck/oc-lock-protocol/blob/main/SPEC.md) — sibling sub-product. Same envelope discipline, different verb (private, not public).
- [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785) — JSON Canonicalization Scheme.
- [C2PA](https://c2pa.org) — the enterprise-media incumbent. Coexists cleanly with OC Stamp; different target audiences.

## Inspiration

The "Bitcoin as identity, not access oracle" reframing that unblocks all of OC's sub-products, Stamp included, came out of long conversations with [**Bram Kanstein**](https://bramk.substack.com/). His research — Bitcoin as a sovereignty and identity substrate — produced the provocation that the right layer for durable web provenance is not a new x509 hierarchy, not a new timestamp chain, not a new keyserver, but the one the user already owns: a Bitcoin wallet. See also the OC Lock [`WHY.md`](https://github.com/orangecheck/oc-lock-protocol/blob/main/WHY.md).

OC Stamp doesn't claim to be a clever protocol. It claims to be a composable one — one that ships what the open web has needed for a decade: **sign anything with your Bitcoin address, anchor the moment to Bitcoin, verify anywhere, forever.**
