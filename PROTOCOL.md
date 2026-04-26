# OC Stamp — Protocol walkthrough

This is a narrative companion to [SPEC.md](./SPEC.md). If you want the normative rules, read the spec. If you want to understand *why* and *how*, read this.

## The problem

> "I signed this. I signed it at this moment. I had this much stake when I signed it. Anyone, anywhere, anytime can verify all three without asking a vendor anything."

That is the user story OC Stamp serves. It sounds simple. Every adjacent project has failed at one or more of those three legs:

- **PGP** gives you authorship, nothing else — and runs on a keyserver model every security review has ripped apart for twenty years.
- **OpenTimestamps** gives you priority, but it's identity-naked: a timestamp proves a hash existed before block N and nothing about who produced it.
- **C2PA (Content Credentials)** gives you authorship and a chain of custody, but it's anchored in an x509 PKI run by Adobe, Microsoft, and a handful of CAs. The revocation semantics assume a trusted set of issuers. It's structurally wrong for the open web.
- **Nostr kind-1 events** give you authorship, but the signer is an npub with no economic skin, no canonical envelope, and no Bitcoin-chain anchor.
- **EVM / smart-contract notarization** gives you a chain anchor, but not a Bitcoin one — and costs a gas fee per stamp.

OC Stamp makes the boring choice: **sign with the wallet you already own, anchor to the chain that's already the most durable time-ordering oracle in existence, and carry the whole artifact as a self-contained JSON envelope that anyone can verify offline forever.**

## The mental model

```
  ┌──────────┐   BIP-322 sign    ┌──────────────┐
  │ Wallet   │──────────────────→│   canonical  │
  │ (UniSat, │ oc-stamp:v1      │   message    │
  │ Xverse…) │ address/hash/... │              │
  └──────────┘                   └──────┬───────┘
                                        │  H(bytes) = id
                                        ↓
   ┌─────────────┐        submit       ┌──────────────┐
   │ OTS         │←────────────────────│   envelope   │
   │ calendar(s) │   (32-byte id)      │   draft      │
   └──────┬──────┘                     └──────┬───────┘
          │ pending proof                     │
          ↓                                   │
   ┌─────────────┐                            │
   │ Bitcoin     │ ~1h later, aggregation    │
   │ block N     │ anchors root to a block    │
   └──────┬──────┘                            │
          │ upgraded proof                    ↓
          ↓                            ┌──────────────┐
   ┌─────────────┐                     │  .stamp      │
   │ full proof  │ embed into envelope │  envelope    │
   │ with header │────────────────────→│  (JSON)      │
   └─────────────┘                     └──────┬───────┘
                                              │
                                              ↓
                               share anywhere (URL, email,
                               IPFS, Nostr, paper QR, git)
```

Every stamp is **one signing ceremony, one calendar submission, one later upgrade**. After that the envelope is self-contained: it carries the canonical message, the BIP-322 signature, the OTS proof, and optional stake context. Anyone with a Bitcoin header bundle can verify it on a plane with the wifi off.

## Flow 1 — Alice stamps a blog post

### Alice writes

1. Alice writes a blog post in Markdown. `blogpost.md`, 12,843 bytes.
2. Alice's client (or the `stamp.ochk.io` web UI) computes `H(blogpost.md)` → `sha256:a4…`.
3. The client builds the canonical message:
   ```
   oc-stamp:v1
   address: bc1qalice…
   content_hash: sha256:a4…
   content_length: 12843
   content_mime: text/markdown
   signed_at: 2026-04-24T18:30:00Z
   ```
4. Alice's wallet signs it with BIP-322. One signature prompt. One click.
5. The client computes `id = H(canonical_message)`.
6. The client submits `id` to two OTS calendars and receives **pending proofs**.
7. The client assembles the envelope:
   ```json
   {
     "v": 1,
     "kind": "stamp",
     "id": "…",
     "content": { "hash": "sha256:a4…", "length": 12843, "mime": "text/markdown", "ref": null },
     "signer": { "address": "bc1qalice…", "alg": "bip322" },
     "signed_at": "2026-04-24T18:30:00Z",
     "stake": null,
     "ots": { "status": "pending", "proof": "…", "calendars": ["…","…"], "block_height": null, "block_hash": null, "upgraded_at": null },
     "sig": { "alg": "bip322", "pubkey": "bc1qalice…", "value": "…" }
   }
   ```
8. Alice saves the envelope as `blogpost.md.stamp` and publishes it alongside her post. She also (optionally) publishes it to Nostr with d-tag `oc-stamp:<id>`.

### Alice waits

About an hour later, an OTS calendar aggregates Alice's id into a Merkle tree, commits the root to a Bitcoin block, and serves an upgraded proof. Alice's client (or any crawler watching stamp.ochk.io / a Nostr archival relay) re-fetches the proof, replaces `ots.proof`, flips `ots.status` to `"confirmed"`, and populates `block_height` / `block_hash`.

Alice now has an envelope that proves: *"the holder of `bc1qalice…` attested to `sha256:a4…` of type `text/markdown`, length 12,843 bytes, on or before Bitcoin block 890,123."*

### Bob verifies a year later, offline

1. Bob reads Alice's blog post. The footer links to `/blogpost.md.stamp`.
2. Bob's tool (CLI, browser extension, `stamp.ochk.io/verify`) loads the envelope.
3. Reconstructs the canonical message from the envelope fields; checks `H(canonical) === envelope.id`.
4. Verifies `sig.value` via BIP-322 against `bc1qalice…` and the hex id.
5. Parses `ots.proof`; walks the Merkle path up to the declared block's Merkle root.
6. Loads the block header for block 890,123 from a local header bundle; compares the Merkle root.
7. If Bob also has the bytes of `blogpost.md`, he hashes them and compares to `content.hash`.

Every check passes. Bob knows: *Alice (or someone who held Alice's key at the time) attested to these exact bytes before April 2026.* No ochk.io call. No vendor lookup. No trust in anyone except Bitcoin miners and Alice's wallet.

## Flow 2 — Commit-signing with `git-stamp`

The current state of commit / tag signing is GPG keys that nobody rotates, nobody audits, and key-servers that fall over every other year. Developers already have Bitcoin wallets. They might as well use them.

### Setup

```
$ npm i -g @orangecheck/git-stamp
$ git-stamp init
> Bitcoin address: bc1qalice…
> Wallet adapter: Sparrow   # or UniSat, Xverse, Leather
> Calendar URLs: [default 2]
```

### Sign a release tag

```
$ git tag v2.1.0
$ git-stamp tag v2.1.0
> Reading tree… SHA256:e7…
> Canonical message (sign with your wallet):
>
>   oc-stamp:v1
>   address: bc1qalice…
>   content_hash: sha256:e7…
>   content_length: <tree size>
>   content_mime: application/x-git-tree
>   signed_at: 2026-04-24T18:30:00Z
>
> [Sparrow] Signed. Submitting to OTS calendars…
> Stamp written: .git/stamps/v2.1.0.stamp
```

A `.stamp` file is committed alongside the tag (or uploaded as a GitHub release asset). Anyone cloning the repo can run:

```
$ git-stamp verify v2.1.0
> ✓ canonical id reconstructed
> ✓ BIP-322 signature verifies for bc1qalice…
> ⋯ OTS anchor: confirmed at block 890,123
> ✓ block header matches merkle path
> ✓ repository tree hash matches content.hash
```

No GPG. No keyserver. One `BIP-322 signMessage` that every major wallet has supported for years.

## Flow 3 — Sybil-gated content feed

A publishing platform — Nostr client, DAO forum, long-form blog aggregator — wants to accept content from anyone but require a stake signal to discourage spam and AI-farmed drivel. `@orangecheck/gate` already solves the "does this user have stake" question for live interactions. Stamps extend that to **durable content provenance**: *when this was written, was the signer meeting our threshold?*

```ts
import { ocGate } from '@orangecheck/gate';
import { verifyStamp } from '@orangecheck/stamp-core';

app.post('/submit', async (req, res) => {
  const { stamp, contentBytes } = req.body;
  const result = await verifyStamp({
    envelope: stamp,
    content: contentBytes,
    requireAnchor: true,
  });
  if (result.code) return res.status(400).json({ error: result.code });

  // Use the declared stake if present, or re-resolve live.
  const attestation = await ocGate.resolve(result.envelope.stake?.attestation_id);
  if (attestation.sats_bonded < 100_000 || attestation.days_unspent < 30) {
    return res.status(403).json({ error: 'stake_below_threshold' });
  }
  // accept
});
```

The time-pinned stake is better than a bare live attestation: you can require "the signer had stake at the moment they wrote this," which defeats farmed-stake-in-the-last-week gaming.

## Flow 4 — Legal self-notarization

Wills, assignment agreements, IP disclosures, NDAs. A notary's job is to certify "this document existed, signed by this person, on this date." OC Stamp produces the same artifact cryptographically:

- **Authorship** is bound to a Bitcoin address the signer can later prove ownership of via BIP-322 challenge.
- **Priority** is anchored to a Bitcoin block whose timestamp is public, adversarially-verified consensus.
- **Tamper-evidence** is bound by `content.hash`; any modification produces a different id.

In jurisdictions that recognize digital signatures (Federal Rules of Evidence 901/902 in the US, eIDAS in the EU), a BIP-322-signed PDF with a confirmed OTS anchor is admissible. The stake signal is optional — for notary use cases, authorship + priority is sufficient — but can be attached if the parties want a reputation context.

## Flow 5 — DAO proposal with durable provenance

A DAO proposes a treasury change. The proposal is a Markdown document. Today, it lives in a forum thread — authorship is whoever clicked "post" on Discourse, which is whichever wallet signed into SSO. Ephemeral, forum-scoped, not cryptographically durable.

With OC Stamp, the proposal author stamps the document and includes the `.stamp` envelope in the proposal body. The stamp carries: *who proposed, when, at what stake.* If the DAO later votes on the proposal via `@orangecheck/vote`, the ballot can reference the stamp id; the tally function has access to durable authorship and time-pinned stake without asking any server.

## What makes this Bitcoin-load-bearing

The architecture hinges on three commitments, none of which is substitutable:

1. **Authorship via BIP-322.** The signer is the Bitcoin-wallet-holder, using the same private key that holds their sats. One identity across OrangeCheck attestations, OC Lock device records, OC Stamp envelopes.
2. **Priority via OpenTimestamps → Bitcoin.** Bitcoin's block header is the priority oracle. No substitute blockchain has Bitcoin's chain-work or settlement assurance.
3. **Stake via OrangeCheck.** sats_bonded × days_unspent is an economic signal that exists only because Bitcoin exists. Ed25519 keys don't have an economic layer.

Remove any one and the result is a commoditized primitive. Keep all three — and OC Stamp is a thing no other stack can ship without rebuilding what we've already shipped.

## Anti-patterns we rejected

- **Our own timestamping layer.** OTS works. Peter Todd built it correctly. Rebuilding it would be NIH.
- **A proprietary Nostr kind.** The ecosystem already has one kind (30078) that's working fine for addressable-replaceable data; the d-tag namespace gives us all the isolation we need.
- **Keyservers / directories we operate.** OrangeCheck attestations live on Nostr. OC Lock device records live on Nostr. OC Stamp envelopes live in the URL, in the content's footer, in IPFS, in a Nostr relay, on paper, in a git repo — wherever the user chooses. The envelope is self-contained; no directory is load-bearing.
- **Custody of signer keys.** Never. The whole point is that the wallet the user already holds is the identity. If we ever offered "cloud key storage for convenience," we'd be running a key server, and the system would have the same security story as every one of the adjacent primitives we're trying to supersede.
- **Making OTS non-optional for signing.** Calendar downtime is not a reason to block a signature. A "signed but not yet anchored" envelope is a legitimate artifact; clients that receive one can upgrade it themselves later.

## Where to go next

- Read [SPEC.md](./SPEC.md) for normative encoding rules.
- Read [WHY.md](./WHY.md) for the design rationale and why each adjacent primitive was insufficient.
- See [`@orangecheck/stamp-core`](https://github.com/orangecheck/oc-packages/tree/main/stamp-core) for the reference TypeScript implementation.
- Try the hosted web client at [stamp.ochk.io](https://stamp.ochk.io).
