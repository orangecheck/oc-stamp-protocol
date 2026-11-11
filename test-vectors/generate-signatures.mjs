#!/usr/bin/env node
/**
 * Signature vector generator for OC Stamp (v10-v14).
 *
 *   node test-vectors/generate-signatures.mjs
 *
 * Signs one stamp per address type with a disclosed burn key, so a second
 * implementation can check its BIP-322 wiring against real signatures:
 * P2PKH (legacy BIP-137 form), P2SH-P2WPKH, P2WPKH and P2TR (BIP-322 simple
 * form). v14 is v12 with one signature byte flipped and MUST NOT verify.
 *
 * The private keys below are published and never to be used for funds.
 * Anyone can spend what is sent to their addresses. Keys #1 and #2 are the
 * ones oc-attest-protocol's tv21 and tv22 use.
 *
 * Dependencies (bip322-js 3, bitcoinjs-lib 6, ecpair 2,
 * @bitcoinerlab/secp256k1) come from a node_modules that has them: by default
 * oc-packages/wallet-adapter in a clone next to this repository, or the
 * directory in OC_SIGNER_NODE_MODULES. ECDSA signing is RFC 6979
 * deterministic; a P2TR signature can differ on each run and still verifies.
 */

import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MODULES =
    process.env.OC_SIGNER_NODE_MODULES ??
    join(HERE, '..', '..', 'oc-packages', 'wallet-adapter', 'node_modules');
const require = createRequire(join(MODULES, '_.js'));
const bip322 = require('bip322-js');
const bitcoin = require('bitcoinjs-lib');
const ecc = require('@bitcoinerlab/secp256k1');
const { ECPairFactory } = require('ecpair');
bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);
const network = bitcoin.networks.bitcoin;

// Disclosed burn keys. Never send bitcoin to the addresses they derive.
const KEYS = {
    p2wpkh: '01'.repeat(32), // oc-attest-protocol key #1 (tv21)
    p2tr: '02'.repeat(32), // oc-attest-protocol key #2 (tv22)
    p2pkh: '03'.repeat(32),
    p2sh_p2wpkh: '04'.repeat(32),
};

function keyPair(hex) {
    return ECPair.fromPrivateKey(Buffer.from(hex, 'hex'), { network });
}

function addressOf(type, hex) {
    const pubkey = Buffer.from(keyPair(hex).publicKey);
    if (type === 'p2pkh') return bitcoin.payments.p2pkh({ pubkey, network }).address;
    if (type === 'p2wpkh') return bitcoin.payments.p2wpkh({ pubkey, network }).address;
    if (type === 'p2sh_p2wpkh')
        return bitcoin.payments.p2sh({ redeem: bitcoin.payments.p2wpkh({ pubkey, network }), network })
            .address;
    if (type === 'p2tr')
        return bitcoin.payments.p2tr({ internalPubkey: pubkey.subarray(1, 33), network }).address;
    throw new Error(`unknown address type ${type}`);
}

// SPEC §3.1: six lines joined by LF, no trailing LF. The same content as v01.
const CONTENT = {
    content_hash: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
    content_length: 42,
    content_mime: 'text/plain',
    signed_at: '2026-04-24T18:30:00Z',
};

function canonicalMessage(address) {
    return [
        'oc-stamp:v1',
        `address: ${address}`,
        `content_hash: ${CONTENT.content_hash}`,
        `content_length: ${CONTENT.content_length}`,
        `content_mime: ${CONTENT.content_mime}`,
        `signed_at: ${CONTENT.signed_at}`,
    ].join('\n');
}

function vector({ file, description, type, format, address, signature, expected }) {
    const message = canonicalMessage(address);
    const id = createHash('sha256').update(message, 'utf8').digest('hex');
    return {
        file,
        body: {
            description,
            inputs: {
                address,
                ...CONTENT,
                content_ref: null,
                stake: null,
                ots: null,
                expected_sig_value: signature,
            },
            expected: {
                canonical_message: message,
                canonical_message_bytes_len: Buffer.byteLength(message, 'utf8'),
                id,
                envelope: {
                    v: 1,
                    kind: 'stamp',
                    id,
                    content: {
                        hash: CONTENT.content_hash,
                        length: CONTENT.content_length,
                        mime: CONTENT.content_mime,
                        ref: null,
                    },
                    signer: { address, alg: 'bip322' },
                    signed_at: CONTENT.signed_at,
                    stake: null,
                    ots: null,
                    sig: { alg: 'bip322', pubkey: address, value: signature },
                },
            },
            signature_check: { address_type: type, format, signed_message: id, expected },
        },
    };
}

const TYPES = [
    ['v10-sig-p2pkh.json', 'p2pkh', 'bip137', 'P2PKH, legacy BIP-137 signature'],
    ['v11-sig-p2sh-p2wpkh.json', 'p2sh_p2wpkh', 'bip322-simple', 'P2SH-P2WPKH, BIP-322 simple signature'],
    ['v12-sig-p2wpkh.json', 'p2wpkh', 'bip322-simple', 'P2WPKH, BIP-322 simple signature'],
    ['v13-sig-p2tr.json', 'p2tr', 'bip322-simple', 'P2TR key path, BIP-322 simple signature'],
];

const out = [];
for (const [file, type, format, what] of TYPES) {
    const address = addressOf(type, KEYS[type]);
    const id = createHash('sha256').update(canonicalMessage(address), 'utf8').digest('hex');
    // SPEC §4.5: the wallet signs the 64-character hex id.
    const signature = bip322.Signer.sign(keyPair(KEYS[type]).toWIF(), address, id);
    if (!bip322.Verifier.verifySignature(address, id, signature))
        throw new Error(`${file}: bip322-js does not verify its own signature`);
    out.push(
        vector({
            file,
            description: `${what} over the hex id, from a disclosed burn key; MUST verify`,
            type,
            format,
            address,
            signature,
            expected: { outcome: 'ACCEPT' },
        })
    );
}

// v14: v12 with the middle signature byte flipped; length and base64 shape unchanged.
{
    const base = out[2].body;
    const bytes = Buffer.from(base.inputs.expected_sig_value, 'base64');
    bytes[Math.floor(bytes.length / 2)] ^= 0x01;
    const signature = bytes.toString('base64');
    if (bip322.Verifier.verifySignature(base.inputs.address, base.expected.id, signature))
        throw new Error('v14: the flipped signature still verifies');
    out.push(
        vector({
            file: 'v14-sig-tampered.json',
            description: 'v12 with one signature byte flipped; MUST NOT verify (E_BAD_SIG)',
            type: 'p2wpkh',
            format: 'bip322-simple',
            address: base.inputs.address,
            signature,
            expected: { outcome: 'REJECT', error_code: 'E_BAD_SIG' },
        })
    );
}

for (const { file, body } of out) {
    writeFileSync(join(HERE, file), JSON.stringify(body, null, 4) + '\n', 'utf8');
    console.log(`${file}: ${body.inputs.address}`);
}
