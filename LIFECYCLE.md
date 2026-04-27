# Lifecycle of an OC Stamp envelope

> **Normative companion to [`SPEC.md`](./SPEC.md).** This document specifies what a publisher MAY do to an envelope after publication, and what a verifier MUST do in response. It does not introduce new envelope kinds or canonical-message fields. It pins down the lifecycle stance the rest of the OrangeCheck family already shares.

## 0. The family stance

Every OrangeCheck artifact is a **signed envelope**. The signature is the truth; the Nostr event is a directory entry; the bytes already exist on relays and in caches the moment an envelope is published. *Delete* is therefore not a protocol primitive in any verb of the family. The vocabulary the family does define is:

| Verb | What it means |
|---|---|
| **replace** | Publish a new envelope under the same Nostr addressable coordinate (`(kind, pubkey, d)`). NIP-33 replacement applies; the older event is no longer the canonical one for that coordinate, but its bytes remain wherever they were copied. |
| **revoke** | Publish a *separate, signed* envelope whose semantics tell verifiers to stop honoring an earlier one. Per-verb whether this exists. |
| **withdraw** | Spend the Bitcoin UTXO(s) backing a bond. The verifier sees the change on the next live check; no Nostr event is required. |
| **expire** | Pass `expires_at`, or set it to a past timestamp on a fresh re-publish. |
| **hide (out-of-protocol)** | A reference dashboard MAY filter an envelope out of its UI. This is local UI state. It changes nothing on Nostr, on Bitcoin, or in any other verifier's view. |
| **request relay deletion (out-of-protocol)** | Publish a NIP-09 kind-5 event citing the e-tag. Some relays honor it; many don't; cached copies elsewhere are unaffected. The protocol gives this no normative force. |

A button or API that calls itself "delete" without doing one of the above is making a claim the protocol cannot keep.

## 1. OC Stamp lifecycle

OC Stamp's job is **non-repudiable provenance**: "this address signed these bytes at this time, anchored to this Bitcoin block." The whole point of the verb is that this fact survives the signer's later regret about it. So:

### 1.1 Stamps are immutable

- A stamp envelope's canonical message is content-addressed. Rewriting any byte produces a different `id`. There is no way to mutate a stamp in place.
- A stamp's OTS proof, once upgraded to a Bitcoin block header, is independently verifiable from Bitcoin alone. The publisher cannot retract a Bitcoin block.
- If the stamp embeds a `stake_at_signing` reference, the embedded snapshot is also content-addressed; updating the underlying OrangeCheck attestation does not change what the stamp recorded.

### 1.2 Stamps are NOT revocable

This spec does **not** define any envelope kind, tag, or canonical-message field that revokes a published stamp. The §10 prose in [`SPEC.md`](./SPEC.md) leaves a `retract id:X` *informal* pattern as deferred for future versions; until a future SPEC defines verifier semantics for such a feed, conforming verifiers MUST ignore any informal retraction and continue treating the original stamp as valid.

If a publisher wishes to associate corrective context with a stamp (e.g., "the document this stamp covers was superseded"), the publisher MAY publish a *new, separate* stamp over the corrective bytes. Stamps cannot un-stamp each other.

### 1.3 Withdrawal of stake

If an embedded `stake_at_signing` references an OrangeCheck attestation whose UTXOs were later spent, the stamp's `stake_at_signing.sats / days / score` snapshot remains as recorded — the snapshot is what the signer claimed at sign time, by spec. A verifier that wants live stake state at verify time SHOULD re-resolve the referenced attestation against current chain state and surface the difference. Spending the UTXOs does not invalidate the stamp; it changes what the stake claim is *worth today*.

### 1.4 Out-of-protocol controls

The reference dashboard at [ochk.io/dashboard](https://ochk.io/dashboard) MAY offer:

- **Hide on my dashboard** — local UI filter; no protocol effect.
- **Request relay deletion** — best-effort NIP-09; no protocol effect.

Neither is a stamp lifecycle event in the sense of this spec. A conforming verifier MUST ignore both signals and treat the stamp as valid for as long as its envelope and OTS proof verify.

### 1.5 Compliance summary

| Implementation MUST | Implementation MUST NOT |
|---|---|
| Treat every well-formed, signature-valid stamp as authoritative regardless of any later retraction signal. | Define or honor a "stamp revocation" envelope, kind, tag, or canonical-message field beyond what is specified here. |
| Surface a live re-resolved stake state if it disagrees with `stake_at_signing`, without changing the stamp's verification outcome. | Filter or hide a stamp at the protocol layer based on dashboard-local hide flags or NIP-09 deletion-request events. |

## 2. Why the asymmetry across the family

OC Agent has explicit revocation (`kind-30085`); OC Lock has `device_pk = "revoked"`; OC Attest has same-`d` replacement and `expires_at`. OC Stamp has none of these — by design. Agent delegations and Lock device records are *forward-looking grants*: the holder needs a way to say "I am no longer extending this authority." Attestations are *self-claims about right now*: re-publishing a fresh one is the natural mechanism. A stamp is *a record of what was true at a past instant*; allowing the signer to retroactively un-record it would defeat the verb's only function.

If you want a primitive that lets you walk something back, you want OC Attest, OC Agent, or OC Lock — not OC Stamp.
