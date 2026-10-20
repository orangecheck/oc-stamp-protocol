# Changelog

## [1.0.1] — 2026-10-20 — errata: a discovery filter that matched nothing

**Errata release. No envelope, canonical-message or signature change. Verdicts
on every existing test vector are unchanged.** It also releases the
corrections listed below it, made between 1.0.0 and this date.

### Fixes

- **`SPEC.md` §7 co-claim paragraph.** A verifier was told it "MUST filter
  Nostr queries by `#d` (e.g., `["oc-stamp:"]` prefix match)". NIP-01 tag
  filters match whole values, so that filter matched no event on any relay.
  The relay still answers it, with no events, so a client reading that answer
  as "no stamps" got no error to show the mistake. A stamps-only verifier now
  queries with a §7.1 filter and checks the envelope `kind`.
- **`SPEC.md` §7.3 (new) reading relay replies.** Filters use only `#d` and
  `#t`, with whole values. A relay has answered only when it sent `EOSE` and
  every event it returned matches the filter. A `CLOSED`, an error `NOTICE`, a
  dropped connection, a timeout or an off-filter event means "not heard back",
  never "absent". A reader reports that content is unstamped only from relays
  that answered. The rule matches OC Agent `SPEC.md` §10.4.
- **`SPEC.md` §12.** The compliance checklist names the §7.3 rule.
- **`WHY.md` H6 note.** Repeated the prefix rule. Now says verifiers check the
  envelope `kind` after fetching.

What publishers set is unchanged: `d` = `oc-stamp:<id>`, and `t` tags for the
signer address, the content hash (`sha256:<hex>`) and `oc-stamp`. The
reference app at stamp.ochk.io sets those four, plus a multi-letter
`oc-stamp-id` tag no reader relies on.

### Evidence

Measured 2026-10-20, REQ only, on `relay.ochk.io`, `nos.lol` and
`relay.primal.net`. `#d: ["oc-stamp:"]` got `EOSE` and no events from all
three. Tag filters matched whole values only: on each relay, `#d` with a full
value returned the event it names, and `#d` with that value's prefix returned
nothing. Every §7.1 filter got `EOSE` from all three. `nos.lol` dropped some
connections when sent fourteen at once and answered the same filters when
sent one at a time, which is the "not heard back" case §7.3 describes.

### Migration

**None required.** `#t: ["oc-stamp"]` on kinds 30083 and 30084 returned no
events from `relay.ochk.io`, `nos.lol`, `relay.primal.net`, `offchain.pub` or
`relay.snort.social`, and a read of kinds 30083–30086 from those five found no
`oc-stamp:` `d`-tag. No stamp on those relays was hidden by the old filter.

## Corrections between 1.0.0 and 1.0.1 (2026-04 – 2026-10-08)

### Fixed — 2026-10-08

- **Reference relay set** (§7): names the five relays the reference app actually uses. It listed `relay.damus.io`, which the shared default set has never included. Non-normative; nothing a client MUST do changes.

### Changed — 2026-09-24

- **`SPEC.md` §7 discovery tags are single-letter `t` tags**: the signer
  address, the content hash, and `oc-stamp`. The previous `addr`, `hash` and
  `signed_at` tags were multi-letter, which relays do not index, so the §7.1
  queries `#addr` and `#hash` could not return results on any conformant
  relay. §7.1 now queries `#t`, requires readers to check the envelope
  against what they asked for, and says how to find events published before
  this change. Tags remain unsigned metadata; nothing about envelope
  verification changes.

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
