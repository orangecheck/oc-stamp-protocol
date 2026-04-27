# Why OC Stamp exists

> The short answer: **the open web has no durable, permissionless, identity-bearing provenance primitive that a normal user can create with a wallet they already own.** Every adjacent system falls short on at least one of (authorship, priority, stake, openness, verifiability). OC Stamp exists to fill that gap by composing three primitives the OrangeCheck ecosystem already ships.

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
| DID / VCs (W3C)            | ✓          | vendor-specific           | ✗            | vendor-specific   | ~              |
| **OC Stamp**               | ✓ (BTC)    | ✓ (Bitcoin)               | ✓ (OC)       | ✓                 | ✓              |

The five columns are not aesthetics. They're architectural load-bearing properties. Authorship without identity binding means anyone can claim to be you. Priority without a chain anchor means you can't prove a document existed before a specific moment. Stake without an economic signal leaves the content-moderation / sybil-resistance axis unaddressed. Online-only verifiability means your protocol dies the day the vendor does. Permissioned issuance means you need a CA's permission to ship provenance — not the open web.

## Load-bearing hypotheses

Each hypothesis is a claim the design relies on. We state it, we try to break it, we record the verdict.

### H1. Bitcoin addresses make better signer identities than any other public key the web has

**Claim.** A Bitcoin address is a hash of a public key the user already holds in a wallet they already own, already use for a thing they already value (custody of sats). Using it as a signing identity piggybacks on all the key-management discipline Bitcoin has already taught its users. No new keyserver, no new enrollment, no new trust anchor.

**Adversarial test.** What if the user doesn't own a Bitcoin wallet? Then OC Stamp isn't for them — they're not in our target audience. What if their wallet's BIP-322 implementation is buggy? Verifiers catch it at signature check; the envelope becomes worthless but nothing is silently compromised.

**Verdict. KEPT.** The density of wallet users with BIP-322 support now exceeds the density of GPG-literate users by at least an order of magnitude and is growing.

### H2. BIP-322 is a shippable signing primitive today

**Claim.** Every major Bitcoin wallet (UniSat, Xverse, Leather, Sparrow, Electrum, Alby, Coldcard) supports BIP-322 `signMessage` across all common address types (P2WPKH, P2TR, P2PKH, P2WSH). The protocol is MIT-licensed, has audited verifier libraries, and has been in production use by the OrangeCheck family for attestations since 2025.

**Adversarial test.** What about wallets that implement BIP-322 non-deterministically (ECDSA with random k)? The verifier still passes; only test vectors can't pin the signature byte string. Spec-side compensation: test vectors treat sig values as verify-only, not byte-identical.

**Verdict. KEPT.** BIP-322 is a solved problem for the ecosystem and improves every year.

### H3. OpenTimestamps is the correct anchoring layer and we should not rebuild it

**Claim.** OTS solves "prove this hash existed before block N" correctly. It batches submissions so individual users pay no fees. Its calendar operators are interchangeable (like Nostr relays). It has been in continuous production use since 2016. The spec is narrow and stable.

**Adversarial test.** Could we build our own calendar network? Yes, and we would need to recruit independent operators, fund their node infrastructure, write proof-aggregation code, and solve the exact problem Peter Todd has already solved. "Not-invented-here" is not a design principle worth paying for.

**Verdict. KEPT.** Compose, credit, do not rebuild.

### H4. The envelope must be self-contained

**Claim.** A stamp should carry everything needed to verify it: canonical message inputs, signature, OTS proof, declared stake. A verifier with an offline Bitcoin headers bundle and a BIP-322 verifier needs no network call.

**Adversarial test.** What if the verifier needs to re-resolve `stake.attestation_id`? That's a separate step and requires network. Verifiers who don't care about stake can skip it; verifiers who do must pay the network cost once. The envelope is still "self-contained" in that no required field lives outside it.

**Verdict. KEPT.** Offline-verifiability is non-negotiable.

### H5. Stake must be declared in the signed canonical message *by reference*, not by value

**Claim.** If the envelope declared `sats_bonded: 500000` in the canonical message and the attestation later became stale, the envelope would be a liar. Instead, the canonical message binds identity-at-signing-time via `signed_at`; `stake.attestation_id` inside the envelope points to an OrangeCheck attestation that the verifier can re-resolve. The declared numeric values are informational.

**Adversarial test.** Can a signer attach the wrong attestation_id? Yes — but the verifier re-resolves and the mismatch is visible (different address, different sats, different age). Trust the chain, not the envelope's boasts.

**Verdict. KEPT.** Stake is a re-resolvable pointer, not an embedded fact.

### H6. Kind-30083 (not kind-30078) is the correct Nostr event kind for stamps

**Claim.** kind-30078 is already claimed in the OrangeCheck family by OrangeCheck attestations and OC Lock device records. Reusing it would invite `d`-tag prefix collisions over time and would make relay queries ambiguous. kind-30083 was the next unused value in the family's 30078–30099 range when OC Stamp v1 shipped.

**Adversarial test.** Does "unused" matter? Yes — Nostr relay clients increasingly index by kind + d-tag as a compound key. Isolating by kind reduces cross-protocol filter interference.

**Verdict. KEPT.** Kind 30083, with the `oc-stamp:` `d`-tag namespace.

> **Note (post-v1).** OC Agent v1 (2026-04) subsequently claimed kind 30083 for delegation envelopes under the disjoint `d`-tag namespace `oc-agent-del:`. The two sub-protocols share the kind without collision because (a) `d`-tag prefixes are disjoint, and (b) each envelope carries an internal `kind` field (`stamp` vs `agent-delegation`) that any verifier reads after fetching. Verifiers MUST filter by `#d` prefix or by envelope `kind` — querying kind 30083 alone returns both event types. See SPEC §7.

### H7. Signing the hex form of `id` beats signing raw bytes

**Claim.** BIP-322 lets wallets preview the signed message to the user. If we sign the 32-byte raw id, the wallet shows gibberish. If we sign the 64-byte ASCII hex, the wallet shows something the user can read aloud. Legibility increases confidence and decreases the phishing surface ("why am I being asked to sign random bytes?").

**Adversarial test.** Does the hex-vs-raw distinction matter cryptographically? No — either binds to the same content commitment. It is a UX choice; we pick legibility.

**Verdict. KEPT.** Hex id over the wire for BIP-322; raw bytes only at the OTS calendar submission layer.

### H8. Signing and anchoring must be decoupled

**Claim.** If OTS calendars are down, the signer should still be able to sign. A signed-but-unanchored envelope is a legitimate artifact that any later client can upgrade. Coupling would introduce a liveness dependency into the critical path of the signing ceremony.

**Adversarial test.** Does decoupling let an attacker present a "signed but never anchored" envelope as proof of priority? No — verifiers that require priority reject `ots === null` or `status === "pending"` per their policy (error code `E_NO_ANCHOR`). The spec clearly states priority is only asserted when `status === "confirmed"`.

**Verdict. KEPT.** Sign now, anchor later.

### H9. Aggregators are liveness-scoped, not authenticity-scoped

**Claim.** An aggregator at stamp.ochk.io batches OTS submissions. Worst case: it refuses service or drops ids before submission. It cannot forge envelopes (no keys), cannot backdate (OTS won't let it), cannot strip stake context (baked into `id` via canonical message).

**Adversarial test.** Could an aggregator correlate submissions to deanonymize users? Yes — submission time and IP are visible to the aggregator. Signers wanting anonymity should submit to calendars directly. This is a privacy-vs-convenience trade-off and we name it.

**Verdict. KEPT.** Aggregators are infrastructure, not authorities.

### H10. Content must be addressed by hash, not by URL

**Claim.** The authoritative commitment is `content.hash`. `content.ref` is a pointer that may rot. Centering the protocol on the hash means moving content, replicating it, or losing its URL does not break stamps.

**Adversarial test.** If the content is unreachable, can a verifier still say anything useful? Yes — the stamp still proves authorship, priority, and (optionally) stake for a hash. Whether the hash corresponds to still-reachable bytes is an orthogonal question.

**Verdict. KEPT.** Hash-first, URL-second.

### H11. Per-stamp BIP-322 signatures are cheap enough to not need batching at the signer

**Claim.** BIP-322 signing is fast (<100ms for typical address types) and requires no on-chain interaction. One signature per stamp is the simplest model and does not create UX friction.

**Adversarial test.** What about a signer stamping 10,000 items? They sign 10,000 times. An advanced v2 could define a "root stamp" that commits to a Merkle root of child hashes, amortizing to one BIP-322 signature. v1 does not ship this; use case not yet concrete.

**Verdict. KEPT for v1. RETIRED (deferred to v2) for batched root stamps.**

### H12. Ed25519 substitution test — does this work without Bitcoin?

**Claim.** Strip BIP-322, strip OTS's Bitcoin anchor, strip the OrangeCheck stake signal. What remains? A signed JSON blob with a pointer to a keyserver lookup. In other words, PGP — an already-commoditized primitive we don't need to reinvent.

**Adversarial test.** Which specific Bitcoin property is load-bearing?
- **Authorship**: BIP-322 requires a Bitcoin address's private key. A different signature scheme (Ed25519) does not produce a Bitcoin-address-bound identity.
- **Priority**: OTS anchors to Bitcoin block headers. Substituting Ethereum timestamping (per-stamp gas fee) or Certificate Transparency (operator-controlled, censorable) degrades the guarantee.
- **Stake**: sats_bonded × days_unspent is an economic signal that only exists because Bitcoin's UTXO model exists. Ed25519 keys have no associated economic cost.

**Verdict. KEPT.** All three legs are Bitcoin-load-bearing. Strip any and the system collapses.

## Design rules that emerge

1. **Compose, don't rebuild.** OTS for priority. Nostr for discovery. BIP-322 for authorship. OrangeCheck for stake.
2. **One signing ceremony per stamp, forever.** No re-signing on upgrade, no re-signing on relay.
3. **Envelopes are self-contained.** Transport is the user's choice.
4. **Hash-first, URL-second.** Content.ref is a pointer, not a commitment.
5. **Offline-verifiable.** Headers bundle + BIP-322 verifier + parser = full verify.
6. **Liveness-scoped trust for infrastructure.** Aggregators cannot forge.
7. **Named kinds, namespaced `d` tags.** kind-30083 carries OC Stamp envelopes under the `oc-stamp:` `d`-tag prefix; co-claimed with OC Agent (delegations under `oc-agent-del:`). Don't overload `d`-tag namespaces within a kind.
8. **Legibility over minimalism at the wallet boundary.** Hex > raw bytes for signed-message prompts.
9. **Re-resolvable stake pointers.** Never trust the envelope's declared numbers — resolve the attestation.
10. **Ship the API before the UI.** `stamp()` and `verify()` must work from a CLI before a web app ever renders.

## What v1 explicitly does NOT solve

- **Post-quantum authenticity.** secp256k1 and SHA-256 both have finite lifetimes against sufficiently large quantum computers.
- **Multi-signer stamps.** One address per envelope in v1.
- **Revocation semantics.** A "retract stamp" is publishable but not standardized.
- **Confidential content.** For private content, compose with OC Lock.
- **Anchor reorg handling.** v1 trusts OTS calendars to anchor at sufficient confirmation depth.
- **Batched witness / root stamps.** Deferred to v2.

## Why not each incumbent?

### Why not PGP?

Authorship is fine. No priority anchor — you can sign a document claiming any date. No stake. Keyservers have been a recurring security disaster (spam poisoning, key takeover, SKS certificate debacle). Two decades of evidence that non-cryptographers can't manage keys. The only surviving niche is release signing, which `git-stamp` aims to replace.

### Why not OpenTimestamps alone?

Priority is excellent — we depend on it. No authorship: an OTS timestamp commits to a hash, not to a signer. OC Stamp's contribution is wrapping OTS with BIP-322 authorship and optional OrangeCheck stake context. **We are not rebuilding OTS. We compose with it.**

### Why not C2PA / Content Credentials?

Authorship via x509, which requires a CA. Wrong architecture for independent bloggers, OSS commit signers, Nostr authors. Right architecture for Adobe → Nikon → NYT, and that's the lane C2PA will own. Different lane. The framing: "C2PA proves a vendor vouches for your content; OC Stamp proves you signed it, with your Bitcoin address, anchored to Bitcoin."

### Why not Nostr kind-1 events?

npubs are fine for social context but have no economic layer and no canonical envelope. No chain anchor. kind-1 events are not designed for durable provenance.

### Why not EVM notarization (EAS, Arweave)?

Authorship ✓. Priority ✓ — but anchored in a non-Bitcoin chain. Stake is token-gated (EAS issuers), which introduces a governance layer we explicitly don't want. Verification requires an RPC. Gas fees per stamp.

### Why not DID / Verifiable Credentials (W3C)?

Abstracts identity across issuers but the "DID method" matrix is a sprawl of incompatible resolvers. The "anchor" is vendor-specific per DID method. Stake is absent.

## What we kept from each

- **From OpenTimestamps**: the entire anchoring layer, verbatim.
- **From PGP**: the "detached signature file alongside content" UX pattern. `.stamp` is the `.asc` of the next generation.
- **From C2PA**: the discipline of making the authenticity record self-describe the content it covers.
- **From OC Lock**: the envelope discipline, URL-fragment share links, one-signature UX, offline verifiability.
- **From OrangeCheck**: the sats-bonded × days-unspent stake signal, composable via `@orangecheck/sdk#verify`.

## Closing note

OC Stamp doesn't claim to be a clever protocol. It claims to be a composable one — one that ships what the open web has needed for a decade: **sign anything with your Bitcoin address, anchor the moment to Bitcoin, verify anywhere, forever.**
