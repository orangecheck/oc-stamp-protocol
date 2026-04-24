# OC Stamp Protocol v1.0 — Specification

**Status:** Stable
**Date:** 2026-04
**Related:** [OrangeCheck](https://ochk.io/docs/spec) (identity + stake), [OC Lock v2](https://github.com/orangecheck/oc-lock-protocol) (private envelopes), [OpenTimestamps](https://opentimestamps.org) (block-anchored priority)

---

## 0. Notation

- All bytes serialized as lowercase hex unless marked `base64` or `base64url`.
- `||` denotes byte concatenation.
- `H()` = SHA-256 (RFC 6234).
- `BIP322(addr, msg)` = BIP-322 signature of `msg` by `addr`, encoded as base64.
- `OTS(h)` = an OpenTimestamps proof committing to the 32-byte hash `h`. A proof is either `pending` (only a calendar commitment) or `confirmed` (a Merkle path rooted in a specific Bitcoin block header). Format per [OpenTimestamps Client Spec](https://github.com/opentimestamps/python-opentimestamps).
- Canonical JSON = UTF-8 encoded JSON with lexicographically sorted object keys, no insignificant whitespace, LF-terminated. See §5.
- ISO 8601 UTC means `YYYY-MM-DDTHH:MM:SSZ` or `YYYY-MM-DDTHH:MM:SS.sssZ`, always ending in `Z`.

## 1. Actors

- **Signer** — the party creating a stamp. Holds a Bitcoin address capable of BIP-322 signing.
- **Verifier** — any party reading a stamp to confirm authorship, priority, and (optionally) stake.
- **Aggregator** — an optional service that batches stamp-id hashes into OpenTimestamps calendar submissions and returns pending proofs. Aggregators are trust-scoped for **liveness only**; they cannot forge stamps and cannot backdate them.
- **Calendar** — an OpenTimestamps calendar operator. See [OTS docs](https://opentimestamps.org/).
- **Directory** — a Nostr relay (or set of relays) that stores published stamp envelopes for durable public discovery. Optional.

A signer MAY verify their own stamps; a verifier MAY be the signer.

## 2. Identities

A signer is identified by a **mainnet Bitcoin address** (P2WPKH, P2TR, or P2PKH). The address is the full identity: there are no usernames, keyservers, or accounts in the protocol.

A stamp MAY include an optional **OrangeCheck attestation reference** (`stake.attestation_id`) binding the stamp to a declared sats-bonded × days-unspent signal at the moment of signing. The reference is **self-declared** and **re-verifiable**: a verifier that cares about stake MUST re-resolve the attestation against current chain state rather than trusting the declared values.

## 3. Canonical message

The **canonical message** is the exact byte sequence the signer's Bitcoin wallet signs via BIP-322. It is designed to be human-legible in any wallet's "Sign Message" UI. The same bytes are hashed to produce the envelope id.

### 3.1 Format

```
oc-stamp:v1
address: <btc_address>
content_hash: sha256:<64-hex>
content_length: <positive integer, decimal>
content_mime: <RFC 6838 media type; "application/octet-stream" if unknown>
signed_at: <ISO 8601 UTC>
```

Each line is terminated by a single LF (`0x0a`). There is no trailing LF after the `signed_at` line. The first line is the literal 11-byte string `oc-stamp:v1` — a domain separator that commits future incompatible changes to explicit version bumps (§9).

### 3.2 Envelope id

```
id := H(canonical_message_bytes)
```

`id` is 32 bytes, serialized in the envelope as 64 lowercase hex characters. This id is:

- The message hashed by the OTS calendar (§6).
- The message signed by BIP-322, expressed as its 64-character lowercase hex string (§4.5).
- The envelope's self-referential identifier, re-derivable from the envelope.

Any change to the canonical message — including whitespace, capitalization, or trailing newlines — produces a different id. Compliant clients MUST produce byte-identical canonical messages for identical inputs.

### 3.3 Why this shape

The canonical message is short, structured, and legible. A user signing through UniSat, Xverse, Leather, Sparrow, or Electrum sees exactly this text in the signing prompt. The lines are domain-separated by `oc-stamp:v1`, so the signature cannot be replayed against another OrangeCheck protocol's canonical message (e.g., OC Lock's `oc-lock:device-bind:v2`).

## 4. Envelope format

A stamp is a single canonical JSON object called the **envelope**. It is referred to by file extension `.stamp` and MIME type `application/vnd.oc-stamp+json`.

### 4.1 Envelope schema

```json
{
  "v": 1,
  "kind": "stamp",
  "id": "<64-hex, see §3.2>",

  "content": {
    "hash": "sha256:<64-hex>",
    "length": 12843,
    "mime": "text/markdown",
    "ref": "ipfs://bafy…" | "https://…" | null
  },

  "signer": {
    "address": "bc1q…",
    "alg": "bip322"
  },

  "signed_at": "2026-04-24T18:30:00Z",

  "stake": null | {
    "attestation_id": "<64-hex sha256 of OC canonical message>",
    "sats_bonded": 500000,
    "days_unspent": 180
  },

  "ots": {
    "status": "pending" | "confirmed",
    "proof": "<base64 OpenTimestamps proof>",
    "calendars": ["https://alice.btc.calendar.opentimestamps.org", "…"],
    "block_height": <integer | null>,
    "block_hash": "<64-hex | null>",
    "upgraded_at": "<ISO 8601 UTC | null>"
  } | null,

  "sig": {
    "alg": "bip322",
    "pubkey": "bc1q…",
    "value": "<base64 BIP-322 signature>"
  }
}
```

### 4.2 Field rules

| Field | Rule |
|---|---|
| `v` | Integer. Current version is `1`. Verifiers MUST reject unknown versions. |
| `kind` | MUST equal `"stamp"`. Reserved for future envelope sub-kinds. |
| `id` | MUST equal `H(canonical_message)` as hex (§3.2). |
| `content.hash` | MUST match `content_hash` in the canonical message. |
| `content.length` | MUST match `content_length` in the canonical message. Non-negative integer. |
| `content.mime` | MUST match `content_mime` in the canonical message. |
| `content.ref` | Optional pointer to content. `null`, `ipfs://…`, `https://…`, or a `magnet:` URI. Not cryptographic; content authenticity is proven by `content.hash`. |
| `signer.address` | MUST match `address` in the canonical message. |
| `signer.alg` | MUST equal `"bip322"` in v1. |
| `signed_at` | MUST match `signed_at` in the canonical message. |
| `stake` | Optional. If present, `sats_bonded` MUST be a non-negative integer; `days_unspent` MUST be a non-negative integer. `attestation_id` SHOULD be the sha256 of an OrangeCheck canonical message signed by `signer.address`. |
| `ots` | See §6. `null` is permitted for "signed but not yet anchored" envelopes; verifiers MAY reject envelopes without `ots` depending on policy. |
| `sig.alg` | MUST equal `"bip322"` in v1. |
| `sig.pubkey` | MUST equal `signer.address`. |
| `sig.value` | MUST verify under BIP-322 as a signature by `signer.address` over the **hex-encoded** `id` (64 ASCII bytes). |

### 4.3 Unknown-field tolerance

Verifiers MUST preserve unknown top-level fields when relaying envelopes but MAY ignore them when verifying. Minor additions within `ots` (new calendar types, anchor-upgrade metadata) are handled the same way. Incompatible changes increment `v` (§9).

### 4.4 Content reference

`content.ref` is a convenience pointer, not a binding commitment. A verifier MAY:

1. Trust the hash and treat `ref` as purely informational.
2. Fetch the bytes at `ref` and re-hash to prove the stamp covers the retrieved bytes.

If the signer wants the content to travel with the stamp, they MAY inline the raw bytes in a URL fragment alongside the envelope, or bundle them separately. OC Stamp makes no claim about where content is stored — only about what it is.

### 4.5 Signing

The BIP-322 signature commits to the **hex string** of the envelope id (64 ASCII bytes, lowercase):

```
sig.value := BIP322(signer.address, hex(id))
```

The hex form is used (not the raw 32 bytes) because some wallets display the signed message to the user for confirmation; a hex string is legible, a raw byte blob is not. The id itself commits to the canonical message, so the signer's commitment transitively covers every field in the canonical message.

A verifier that has reconstructed `id` from the canonical message MUST verify `sig.value` under `signer.address` over the hex representation of `id`.

## 5. Canonicalization

The canonical byte representation of an envelope is required for over-the-wire equality checks, test-vector conformance, and any future operations that need deterministic envelope serialization (e.g., batch OTS submissions).

Canonical form:

- UTF-8 JSON with keys sorted lexicographically at every level.
- No insignificant whitespace (no spaces after `:` or `,`, no leading/trailing whitespace).
- Arrays preserve order.
- Numbers serialized with no fractional zeros and no exponents for integers within IEEE 754 double range.
- Strings serialized with `\uXXXX` escapes only for control characters and `"` / `\`; all other codepoints literal.
- Final byte is LF (`0x0a`).

Reference: [RFC 8785 JSON Canonicalization Scheme](https://www.rfc-editor.org/rfc/rfc8785).

Unlike OC Lock, OC Stamp envelopes contain no array field that requires stable per-element sorting. RFC 8785 alone is sufficient.

## 6. OpenTimestamps integration

OC Stamp uses OpenTimestamps (OTS) for block-anchored priority. We do not reimplement OTS; we compose with it. Clients SHOULD use a maintained OTS library (e.g., `javascript-opentimestamps`, `opentimestamps` Python package) for calendar submission, proof parsing, and upgrade.

### 6.1 Submission

After signing the envelope (§4.5), the client submits `id` (raw 32 bytes) to one or more OTS calendars. Default calendars:

- `https://alice.btc.calendar.opentimestamps.org`
- `https://bob.btc.calendar.opentimestamps.org`
- `https://finney.calendar.eternitywall.com`

The calendar returns a **pending proof** — a commitment to a calendar-internal Merkle tree that has not yet been anchored to Bitcoin. The client populates `envelope.ots`:

```json
"ots": {
  "status": "pending",
  "proof": "<base64>",
  "calendars": ["https://alice.btc.calendar.opentimestamps.org"],
  "block_height": null,
  "block_hash": null,
  "upgraded_at": null
}
```

Clients SHOULD submit to at least two calendars operated by different parties. A stamp with only one calendar commitment is a single point of failure for upgrade liveness.

### 6.2 Upgrade

OTS calendars aggregate submissions and anchor the root to Bitcoin roughly once per hour. Once the root is in a confirmed block, the calendar serves an **upgraded proof** containing the Merkle path from the original `id` up through the calendar root up to the Bitcoin block's Merkle root.

Any client (the signer, a verifier, or an archival service) MAY fetch the upgrade:

1. POST `id` to the calendar's `/timestamp/:hash` endpoint.
2. Replace `ots.proof` with the upgraded bytes.
3. Extract `block_height` and `block_hash` from the proof.
4. Set `status = "confirmed"`, `upgraded_at = now`.

The upgrade rewrites `ots` but does not change `id`, `sig`, or any other field. The signature domain does not include `ots`, so the upgrade is cryptographically independent of the BIP-322 commitment.

### 6.3 Anchor verification

A verifier with `ots.status === "confirmed"`:

1. Parses `ots.proof` per the OpenTimestamps format.
2. Walks the Merkle path from `id` up to the declared Bitcoin Merkle root.
3. Fetches (or is supplied) the Bitcoin block header at `block_height` and compares its Merkle root to the one derived from the proof.
4. Accepts the anchor iff the header's Merkle root matches and the header chains to a full-node-verified chain (or a trusted SPV-style checkpoint).

A verifier that has no access to Bitcoin block headers (fully offline) MAY present the envelope as "signed, claims anchor at block N" and defer the anchor check. An **offline verifier with a block headers bundle** can verify anchors fully without any network call.

### 6.4 Aggregators (optional middleware)

An **aggregator** is a service that accepts draft envelopes from clients and batches their ids into OTS submissions on the client's behalf. Aggregator duties:

- Accept `POST /aggregate { id, envelope }` with the final signed envelope.
- Merkleize incoming ids on a rolling window (e.g., every 60 seconds).
- Submit the window root to OTS calendars.
- Serve `GET /proof/:id` returning the current OTS proof (pending or upgraded) for the contained id.
- Optionally republish upgraded envelopes to a Nostr directory (§7).

Aggregators are **liveness-scoped trust**: they can refuse service, but they cannot forge stamps, cannot backdate, and cannot withhold the proof once the OTS calendar has upgraded (any client can re-fetch directly from the calendar).

The reference aggregator at `stamp.ochk.io` is open-source and replaceable. A signer with their own Bitcoin node and OTS calendar has no need of an aggregator.

## 7. Nostr directory (optional)

For durable public discovery, stamps MAY be published to Nostr as **kind-30083** (addressable, replaceable) events. Kind 30083 is claimed exclusively by this spec in the OrangeCheck family's 30078–30099 range (30078 = OrangeCheck attestation / OC Lock device record, 30080–30082 = OC Vote).

```
event.kind       = 30083
event.tags       = [
  ["d",        "oc-stamp:" || id],
  ["addr",     signer.address],
  ["hash",     content.hash],
  ["signed_at", signed_at]
]
event.content    = <canonical JSON of envelope>
event.pubkey     = ephemeral_nostr_pubkey (any Nostr key)
event.created_at = unix_seconds
```

The Nostr event `pubkey` has no relationship to the Bitcoin identity — the authenticity of the stamp is proven by the BIP-322 signature inside the envelope, not by the Nostr author. A fresh ephemeral Nostr keypair SHOULD be derived per-publish:

```
nostr_sk := HKDF(ikm=random(32), salt="oc-stamp/v1/nostr-key", info=id, L=32)
```

Clients SHOULD publish to at least three relays from a diverse set. The reference app uses `relay.damus.io`, `relay.nostr.band`, `nos.lol`, `relay.snort.social`.

### 7.1 Discovery queries

By content hash:
```
REQ { "kinds": [30083], "#hash": ["sha256:<hex>"] }
```

By signer address:
```
REQ { "kinds": [30083], "#addr": ["bc1q…"] }
```

By envelope id:
```
REQ { "kinds": [30083], "#d": ["oc-stamp:<id>"] }
```

The d-tag is content-addressed (`oc-stamp:<id>` where `id` is a hash of the canonical message). Kind-30083 is *addressable*: relays replace prior events with the same `(pubkey, kind, d-tag)` tuple. For OC Stamp this is harmless: a "replacement" with the same d-tag must carry the same id, hence the same signed content, or fail verification. A republish with the **same** id and an **upgraded** OTS proof is the common case — see §6.2.

### 7.2 Republishing after upgrade

When an OTS proof is upgraded from pending to confirmed, any party (signer, aggregator, archival crawler) MAY republish the envelope with the updated `ots` field. Verifiers MUST accept the event with the latest `upgraded_at` and `status === "confirmed"` when multiple conflict.

## 8. Verification algorithm

A **full verification** of a stamp envelope produces one of:

- `OK { id, signer, content, signed_at, anchor }` — all checks passed.
- A `LockError`-style code (see §10).

### 8.1 Algorithm

Given an envelope `E` and optionally a block headers source:

1. **Version check.** If `E.v !== 1` → `E_UNSUPPORTED_VERSION`.
2. **Shape check.** Every required field (§4.1) present and typed correctly; else `E_MALFORMED`.
3. **Canonical consistency.** Reconstruct the canonical message from (`E.signer.address`, `E.content.hash`, `E.content.length`, `E.content.mime`, `E.signed_at`). Compute `id' = H(canonical_message)`. If `hex(id') !== E.id` → `E_BAD_ID`.
4. **Signature verify.** Verify `E.sig.value` under BIP-322 as a signature by `E.signer.address` over the ASCII string `E.id`. If invalid → `E_BAD_SIG`.
5. **Anchor verify.** If `E.ots` is present and `E.ots.status === "confirmed"`:
   a. Parse `E.ots.proof`.
   b. Walk the Merkle path from `id` to the declared block's Merkle root.
   c. Fetch the block header at `E.ots.block_height` (or use the provided headers bundle). Compare Merkle roots. If mismatch → `E_BAD_ANCHOR`.
6. **Content check.** If the caller has the content bytes, compute `H(bytes)` and compare to `E.content.hash`. If mismatch → `E_BAD_CONTENT`.
7. **Stake check (optional).** If the caller cares about `E.stake.attestation_id`, resolve the attestation via `@orangecheck/sdk#verify` and confirm the declared `sats_bonded` / `days_unspent` are still true (or still exceed the caller's threshold). If not → `E_STAKE_UNMET`.

A **minimal verification** skips steps 5 (anchor), 6 (content bytes), and 7 (stake) and reports the envelope as "authentic but not anchored / content not checked." This is the right mode for offline readers that only care about authorship.

### 8.2 What verification guarantees

A stamp that passes full verification proves:

| Check | Guarantee |
|---|---|
| `E_BAD_ID` clean | The canonical message reconstructs to the declared id. |
| `E_BAD_SIG` clean | The holder of `E.signer.address` at signing time authorized the canonical message. |
| `E_BAD_ANCHOR` clean | The envelope id existed before the block at `E.ots.block_height`. |
| `E_BAD_CONTENT` clean | The bytes the caller examined are the bytes the signer attested to. |
| `E_STAKE_UNMET` clean | The signer's attestation meets the caller's stake policy. |

Anyone, anywhere, anytime can run this algorithm offline given the envelope and a block headers snapshot. **No ochk.io endpoint is required or consulted at verify time.**

## 9. Versioning

`envelope.v` is an integer. Future incompatible changes increment it. Clients MUST reject envelopes whose `v` they do not support. Minor additions (new optional `stake` subfields, new OTS status values, new Nostr discovery tags) are handled by unknown-field tolerance (§4.3).

## 10. Errors

Client errors MUST use these codes. Users see short human-readable messages; logs see the code.

| Code | Meaning |
|---|---|
| `E_UNSUPPORTED_VERSION` | Envelope `v` is unknown. |
| `E_MALFORMED` | Envelope shape / field types / required fields invalid. |
| `E_BAD_ID` | Reconstructed canonical message does not hash to the declared `id`. |
| `E_BAD_SIG` | BIP-322 signature did not verify. |
| `E_BAD_ANCHOR` | OTS proof does not chain to the declared Bitcoin block header. |
| `E_NO_ANCHOR` | Policy requires a confirmed OTS anchor; envelope has `pending` or missing `ots`. |
| `E_BAD_CONTENT` | Provided content bytes hash does not match `content.hash`. |
| `E_STAKE_UNMET` | Signer's OrangeCheck attestation does not meet the caller's threshold. |
| `E_CALENDAR_UNREACHABLE` | Upgrade path required a calendar fetch that failed. |

## 11. Security model

### 11.1 What OC Stamp proves

- **Authorship.** Under the BIP-322 assumption, only the holder of `signer.address`'s private key could have produced `sig.value`.
- **Priority.** Under the Bitcoin consensus assumption, the envelope id existed on or before the block at `ots.block_height` (confirmed anchors only).
- **Integrity.** Any tampering with `content.hash`, `content.length`, `content.mime`, `signed_at`, or `signer.address` invalidates `id` and therefore `sig.value`.
- **Stake (when declared and re-verified).** At the moment a verifier resolves `stake.attestation_id`, the holder of `signer.address` also controls / controlled UTXOs matching the declared bond.

### 11.2 What OC Stamp does NOT prove

- **Recency.** Signing timestamps are self-declared. The signer can set `signed_at` to any value; only the OTS anchor proves the id existed *before* a specific block. A stamp with `signed_at: 2020-01-01` anchored in 2026 proves priority relative to the 2026 block, not the 2020 date.
- **Uniqueness.** The signer may sign the same content twice with different `signed_at`. Verifiers interested in "first stamp" MUST compare anchor block heights, not `signed_at`.
- **Content liveness.** `content.ref` may 404. The hash is authoritative; the pointer is a convenience.
- **Sender anonymity.** `signer.address` is plaintext. If anonymity is required, sign from a fresh address — but you lose any stake signal and any identity continuity.
- **Post-quantum confidentiality / authenticity.** secp256k1 breaks under a sufficiently large quantum computer. There is no PQ layer in v1.

### 11.3 Trust assumptions

- **Bitcoin's security model holds.** ECDSA / Schnorr over secp256k1 remains unforgeable at current parameter sizes.
- **BIP-322 is implemented correctly** by both signing and verifying clients. Implementations should pin a verifier to a version known to handle all address types (P2WPKH, P2TR, P2WSH, P2PKH).
- **OTS calendars do not backdate.** Calendars cannot anchor an id to a block earlier than the one they submitted into; a collusion between a calendar and a Bitcoin miner to backdate would require rewriting the chain. Using multiple independently-operated calendars further reduces the risk.
- **Bitcoin block headers are available to the verifier.** Full nodes, SPV clients, and pre-computed header bundles all suffice.

### 11.4 Aggregator trust

The aggregator is **liveness-scoped**:

- An aggregator that refuses service — the client submits directly to the calendar.
- An aggregator that loses ids before submission — the client's envelope is signed but never anchored; re-submission is idempotent.
- An aggregator that delays the pending proof — the client can fetch the calendar directly.

The aggregator cannot:

- Forge envelopes (it would need the signer's Bitcoin key).
- Backdate envelopes (it would need to break OTS or Bitcoin).
- Strip stake context (the stake is signed into the canonical message via `id`).

## 12. Compliance checklist

A client is OC Stamp v1 compliant if and only if:

- [ ] Produces canonical messages byte-for-byte per §3.1 for identical inputs
- [ ] Computes `id = H(canonical_message)` and serializes as lowercase hex
- [ ] Produces envelopes with all required fields per §4.1
- [ ] Signs the hex form of `id` via BIP-322 (§4.5)
- [ ] Canonicalizes envelopes per §5 (RFC 8785)
- [ ] Submits `id` (raw 32 bytes) to OTS calendars per §6.1
- [ ] Parses and upgrades OTS proofs per §6.2
- [ ] Verifies OTS anchor against Bitcoin block headers per §6.3 when `status === "confirmed"`
- [ ] Verifies sender BIP-322 signatures before trusting envelope contents
- [ ] Produces error codes per §10
- [ ] Rejects unknown `v` values; preserves unknown fields on relay
- [ ] Passes every committed test vector in [`test-vectors/`](./test-vectors/)

## 13. Registry for extensions

Fields with extensible values use a short registry documented here. Implementations that encounter an unknown value MUST NOT reject the envelope on that basis alone (unknown-field tolerance, §4.3); they MAY log a warning.

| Field | Current values | Reserved for |
|---|---|---|
| `signer.alg` | `bip322` | Future: `bip340-schnorr-direct`, `pq-hybrid` |
| `sig.alg` | `bip322` | Same as `signer.alg` |
| `ots.status` | `pending`, `confirmed` | Future: `orphaned` (anchor block reorganized out) |
| `content.ref` URI schemes | `ipfs://`, `ipns://`, `https://`, `http://`, `magnet:` | Any IANA-registered URI scheme |
| `content.mime` | Any RFC 6838 media type | same |

New values are allocated by PR to this spec. Vendor-specific experimental values SHOULD use a `x-vendor/` prefix until standardized.

## 14. Future work (non-normative)

v1 explicitly does NOT solve:

- **Post-quantum authenticity.** secp256k1 breaks under a sufficiently large quantum computer. A v2 would add a SLH-DSA or ML-DSA signature alongside BIP-322.
- **Multi-signer stamps.** One envelope signed by multiple Bitcoin addresses (e.g., m-of-n committee sign-off). Trivial to express as multiple `sig` entries; deferred until a concrete use case.
- **Revocation semantics.** A signer can publish a "retract `id:X`" stamp, but v1 does not standardize how verifiers consume revocation feeds. Deferred.
- **Confidential content.** Stamps are public by construction. For confidentiality, seal content with [OC Lock](https://github.com/orangecheck/oc-lock-protocol) and stamp the sealed envelope's hash. Compose, don't extend.
- **Batched witness stamps.** Attest to a Merkle root over many other stamps for aggregator efficiency. The math is trivial; the spec work is deferred.
- **Anchor-reorg handling.** If the anchor block at `ots.block_height` is reorganized out, the stamp loses its anchor and needs re-upgrade against the new chain tip. v1 trusts that the confirmation depth at upgrade time was sufficient (typically ≥6 blocks from the OTS calendar's perspective).

## 15. IANA / external identifiers

- Nostr event kind: **30083** (addressable, general replaceable range). Reserved exclusively for OC Stamp v1. The `d` tag namespace `oc-stamp:*` is claimed by this spec.
- File extension: `.stamp`
- MIME type: `application/vnd.oc-stamp+json` (self-allocated; not IANA-registered as of this writing).

## 16. Acknowledgements

OC Stamp stands on the shoulders of [OpenTimestamps](https://opentimestamps.org) and credits **Peter Todd** and the OTS contributors unreservedly. OTS is the anchoring layer; we compose with it, we do not rebuild it.

---

End of specification.
