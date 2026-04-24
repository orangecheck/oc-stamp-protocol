# Security Policy

## Reporting a vulnerability

Email **security@ochk.io** with:

- A clear description of the issue and the affected component.
- Reproduction steps (proof-of-concept preferred; minimal test vector is fine).
- Your assessment of impact: what can an attacker do, under what assumptions?
- Whether you want credit when we publish the fix.

We aim to acknowledge within 48 hours and publish a fix for high/critical issues within 14 days. Do not file public GitHub issues for suspected vulnerabilities.

## Scope

This document covers the **OC Stamp v1 protocol specification** in this repository. The reference implementation lives in [`orangecheck/oc-packages`](https://github.com/orangecheck/oc-packages); the web client lives in [`orangecheck/oc-stamp-web`](https://github.com/orangecheck/oc-stamp-web). Each of those has its own `SECURITY.md`.

## Threat model

### What OC Stamp protects

- **Authenticity of the signer** against forgery. The BIP-322 signature in `sig.value` binds the envelope id to the signer's Bitcoin address. A forged envelope would require the signer's private key.
- **Integrity of the canonical message.** The envelope `id` is a cryptographic commitment to the canonical bytes; any modification to `content.hash`, `content.length`, `content.mime`, `signer.address`, or `signed_at` invalidates the id and the signature.
- **Block-anchored priority.** A confirmed OTS proof proves the envelope id existed on or before the block at `ots.block_height`, under the assumption that Bitcoin consensus is not violated.
- **Stake context (when declared and re-verified).** The declared `stake.attestation_id` is a pointer to an OrangeCheck attestation; verifiers MUST re-resolve it to confirm the stake is current. The declared `sats_bonded` / `days_unspent` values are informational.
- **Tamper-evidence across mirrors.** Any modification of the envelope in transit produces a different id, which fails BIP-322 verification.

### What OC Stamp does not protect

- **Metadata privacy.** `signer.address`, `content.hash`, `content.mime`, `content.length`, and `signed_at` are all plaintext in the envelope. Anyone who sees the envelope learns who signed, what mime-typed thing of what size they signed, when they claim to have signed, and the hash of the content. If the content itself is confidential, the hash does not leak it — but the rest of the metadata is visible.
- **Signer anonymity.** `signer.address` is plaintext. If anonymity is required, sign from a fresh address — but you lose any stake signal and any identity continuity with prior stamps.
- **Recency.** The signer sets `signed_at`; it is not forgery-proof. Only the OTS anchor proves the envelope existed *before* a specific block. A stamp with `signed_at: 2020-01-01` anchored in 2026 proves priority relative to 2026, not 2020. Verifiers that care about "when did this really exist" MUST use `ots.block_height`, not `signed_at`.
- **Content availability.** `content.ref` may 404 or mutate. The hash is authoritative; the pointer is a convenience.
- **Post-quantum confidentiality / authenticity.** secp256k1 and SHA-256 both break under a sufficiently large quantum computer. There is no PQ layer in v1.

### Assumptions the protocol makes

- **Bitcoin's security model holds.** ECDSA / Schnorr over secp256k1 remains unforgeable at current parameter sizes; the work-weighted longest chain is canonical.
- **BIP-322 is implemented correctly** by both signing and verifying clients. Implementations should pin a verifier to a version known to handle all address types (P2WPKH, P2TR, P2WSH, P2PKH).
- **At least one OTS calendar is non-colluding.** Submitting to two or more independently-operated calendars reduces the risk of a calendar-operator collusion with a miner to backdate.
- **SHA-256 is collision-resistant.** A practical SHA-256 collision breaks `id` uniqueness and therefore many downstream guarantees.
- **Randomness at signing time is strong** for any ephemeral values used by the signing wallet.

## Normative compliance requirements

These are cryptographic correctness conditions that conforming implementations MUST satisfy:

1. **Reconstruct the canonical message before trusting the declared `id`.** Implementations MUST compute `H(canonical_message)` from `(signer.address, content.hash, content.length, content.mime, signed_at)` and compare to `envelope.id`. Accepting the declared `id` without reconstruction allows an attacker to swap signed content.
2. **Verify `sig.value` before trusting envelope contents.** No exceptions in v1.
3. **Verify the OTS anchor against a real Bitcoin block header** when `ots.status === "confirmed"`. Parsing the proof without verifying the header's Merkle root is a valid performance choice for a preview UI, but a verifier that accepts the stamp MUST do the full check before attaching legal / economic weight to the anchor.
4. **Re-resolve any stake claim.** Implementations that care about stake thresholds MUST NOT trust the declared `sats_bonded` / `days_unspent`; they MUST fetch the attestation via OrangeCheck and confirm the values against current chain state.
5. **Reject unknown `envelope.v`** values. Preserve unknown optional fields when relaying; ignore them when verifying.
6. **Produce byte-identical canonical messages** for identical inputs across implementations. Test-vector conformance (§12 of SPEC) is not optional.
7. **Sign the hex form of `id`** (64 ASCII bytes) with BIP-322, not the raw 32 bytes. This is for wallet legibility and spec-level determinism (§4.5 of SPEC).

## Known cryptographic caveats

- **Signature malleability.** BIP-322 signatures for Schnorr-based addresses (P2TR) are non-malleable. ECDSA signatures (legacy P2PKH, P2WPKH) are technically malleable, but the envelope id is bound into the signed message, so a malleated re-issue would still need the signer's private key and would not change the envelope id.
- **OTS pending proofs are not anchored.** A stamp with `ots.status === "pending"` proves authorship but not priority. Verifiers that require priority (notarization, legal, high-stakes provenance) MUST wait for upgrade.
- **Calendar liveness.** If every calendar submitted to is offline at upgrade time, the stamp is authored but not anchored until a client re-queries. Clients SHOULD submit to multiple independent calendars.
- **No side-channel guarantees.** JavaScript crypto libraries (including `@noble/*`) make best-effort constant-time operations; a hostile host can time them anyway.

## Attack scenarios

Each scenario is labeled **Mitigated**, **Partially mitigated**, **Accepted**, or **Out of scope**.

1. **Envelope tampering in transit.** An attacker modifies `content.hash`, `signer.address`, `signed_at`, or any field in the canonical domain. *Mitigated*: the envelope id is `H(canonical_message)` and is committed to by `sig.value`. Tampering fails signature verification.

2. **Replay of a signature across canonical messages.** An attacker takes a BIP-322 signature from a different context and claims it covers an OC Stamp envelope. *Mitigated*: the canonical message begins with `oc-stamp:v1` as a domain separator. A signature over a non-oc-stamp message cannot verify against an oc-stamp id.

3. **Replay of a canonical message with a different OTS proof.** An attacker publishes the same id with a fabricated OTS proof claiming an earlier block. *Mitigated*: verifiers parse the OTS proof and walk it to a real Bitcoin block header. Fabricated proofs fail header verification.

4. **Calendar operator collusion with miner to backdate.** An OTS calendar colludes with a miner to include a fraudulent commitment in an older block. *Partially mitigated*: clients SHOULD submit to two or more independently-operated calendars (§6.1 of SPEC). Backdating requires colluding with a specific block's winner, which is adversarially infeasible for normal users but theoretically possible for resourced adversaries.

5. **Aggregator substitutes a different envelope before OTS submission.** *Mitigated*: the envelope is signed by the signer before it reaches the aggregator; substitution produces a different id that fails the signer's BIP-322 check on any downstream verifier. The aggregator cannot sign.

6. **Aggregator drops submissions.** The stamp is signed but never anchored. *Mitigated*: the signer can re-submit to any OTS calendar directly; submissions are idempotent (the OTS calendar aggregates the same id harmlessly).

7. **OTS pending proof used as priority evidence.** A verifier accepts `status === "pending"` as proof of priority. *Mitigated*: SPEC §11.1 is explicit that priority is proven only by `status === "confirmed"` anchors. Error code `E_NO_ANCHOR` exists for policies that require confirmation.

8. **Signer reuses `signed_at` across two stamps to confuse ordering.** *Mitigated*: `signed_at` is self-declared and not an ordering primitive. Ordering comes from `ots.block_height` of confirmed anchors; equal anchors fall back to the envelope id byte-order (verifiers that care about ordering should document their tiebreaker).

9. **Signer signs a future `signed_at`.** The envelope claims to be signed in the future. *Accepted*: `signed_at` is the signer's claim. Verifiers that care about freshness should compare `signed_at` against their `now()` and reject envelopes that claim to be signed in the future of the verification clock. Out of scope for the envelope itself.

10. **Signer leaks `signer.address` via an envelope they intended to keep private.** *Accepted*: stamps are public by construction. Signers who want to stamp confidentially should compose with OC Lock (seal the content with Lock, stamp the sealed hash with Stamp).

11. **Content lookup via `content.ref` returns attacker-controlled bytes.** *Mitigated*: `content.ref` is a pointer, not a commitment. Verifiers who fetch via `ref` MUST re-hash and compare to `content.hash`; mismatch triggers `E_BAD_CONTENT`.

12. **Key compromise of the signer's Bitcoin private key.** An attacker with the key can forge arbitrary stamps indistinguishable from legitimate ones. *Accepted*: this is the same trust model as BIP-322 everywhere. Key rotation to a new address is the mitigation; past stamps remain valid because the anchor commits to historical state.

13. **BIP-322 verifier bug on exotic address types.** A verifier fails on P2TR, P2WSH, or legacy P2PKH inputs. *Partially mitigated*: SPEC §11.3 requires implementations pin a verifier known to handle all address types. CI conformance testing across verifiers is recommended.

14. **Malicious Nostr relay returns a manipulated envelope.** *Mitigated*: verifiers re-derive `id` from the canonical message and re-check BIP-322. Manipulated envelopes fail verification regardless of relay.

15. **Collision of SHA-256 used for `id` or `content.hash`.** *Accepted*: SHA-256 collision resistance is a load-bearing assumption. A practical collision attack would break far more than OC Stamp; no protocol-level mitigation is meaningful.

16. **Side-channel leakage of BIP-322 signing.** A hostile host measures signing time to extract the private key. *Out of scope*: this is a wallet-implementation concern. OC Stamp assumes the signer's wallet is not hostile.

## Aggregator-specific risks

An aggregator that accepts draft envelopes and batches OTS submissions is trusted for **liveness**, not for authenticity or priority:

- **Aggregator refuses service** → the client submits directly to OTS calendars. No envelope forging is possible because the aggregator doesn't hold signing keys.
- **Aggregator batches slowly** → the stamp's priority anchor lands in a later block. Not a safety problem; the signer's `signed_at` is still their own claim.
- **Aggregator returns a fraudulent pending proof** → caught at upgrade time when the "pending" proof fails to chain to any Bitcoin block. Clients SHOULD independently query calendars for upgrade rather than trusting the aggregator's cached pending proof beyond a short retry window.
- **Aggregator strips or modifies envelope fields** → invalidates `id` and fails signature verification. Undetectable-on-the-wire corruption by the aggregator is prevented by the signer's BIP-322 signature.

## Dependency posture

The reference implementation intentionally depends on a narrow set of audited libraries:

| Package | Purpose |
|---|---|
| `@noble/hashes` | SHA-256 |
| `@noble/curves` | secp256k1 Schnorr / ECDSA |
| `javascript-opentimestamps` | OTS calendar client, proof parser |
| `bip322-js` | BIP-322 verification |

`bip322-js` transitively depends on the `elliptic` library; `elliptic` has known low-severity timing channels in ECDSA (npm advisory 1112030). Our use is verification-only and signatures are bound to the BIP-322 message domain, so the risk is limited to signature-check timing. We accept this in the v1 baseline and plan to migrate to a `@noble`-based BIP-322 verifier when one is available.

## Report a protocol-level concern

If you believe a clause of the specification itself is unsound (as opposed to a bug in an implementation), email security@ochk.io with subject line prefix `[protocol]`. Protocol-level concerns may trigger a spec revision; we version the spec strictly (§9 of SPEC).
