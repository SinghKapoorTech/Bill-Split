/**
 * The Apple client-secret JWT.
 *
 * This lives in the integration suite only because its module imports
 * `firebase-functions`, which the unit vitest config does not alias. It needs
 * no emulator and touches no network — a throwaway EC P-256 key pair stands in
 * for the real .p8.
 *
 * The subtle failure this guards against: Node's default EC signature encoding
 * is DER, but JOSE requires the raw r||s pair. Getting that wrong produces a
 * signature of the wrong length that Apple rejects as `invalid_client` — an
 * error that reads like a credentials problem and sends you hunting in the
 * developer portal instead of at the signing code.
 */
import { describe, it, expect } from 'vitest';
import { generateKeyPairSync, createVerify, createPublicKey } from 'node:crypto';
import {
  buildAppleClientSecret,
  APPLE_TEAM_ID,
  APPLE_KEY_ID,
  APPLE_CLIENT_ID,
} from '../../functions/src/appleTokenRevocation';

const { privateKey, publicKey } = generateKeyPairSync('ec', {
  namedCurve: 'P-256',
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const decodeSegment = (seg: string) =>
  JSON.parse(Buffer.from(seg.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));

const NOW = 1_788_000_000;

describe('buildAppleClientSecret', () => {
  it('produces three base64url segments', () => {
    const jwt = buildAppleClientSecret(privateKey, NOW);
    const parts = jwt.split('.');

    expect(parts).toHaveLength(3);
    for (const part of parts) {
      expect(part, 'must be base64url, never plain base64').not.toMatch(/[+/=]/);
    }
  });

  it('declares ES256 and the key id in the header', () => {
    const header = decodeSegment(buildAppleClientSecret(privateKey, NOW).split('.')[0]);

    expect(header.alg).toBe('ES256');
    expect(header.kid).toBe(APPLE_KEY_ID);
    expect(header.typ).toBe('JWT');
  });

  it('uses the bundle id as sub, not a Services ID', () => {
    // The whole reason this app needs no Apple Services ID: for a native app
    // the client_id IS the bundle identifier.
    const payload = decodeSegment(buildAppleClientSecret(privateKey, NOW).split('.')[1]);

    expect(payload.sub).toBe(APPLE_CLIENT_ID);
    expect(payload.sub).toBe('com.singhkapoortech.divit');
    expect(payload.iss).toBe(APPLE_TEAM_ID);
    expect(payload.aud).toBe('https://appleid.apple.com');
  });

  it('is short-lived and not back-dated', () => {
    const payload = decodeSegment(buildAppleClientSecret(privateKey, NOW).split('.')[1]);

    expect(payload.iat).toBe(NOW);
    expect(payload.exp).toBeGreaterThan(payload.iat);
    // Apple rejects client secrets valid beyond six months.
    expect(payload.exp - payload.iat).toBeLessThanOrEqual(15_777_000);
  });

  it('emits a 64-byte raw r||s signature, not DER', () => {
    const sig = buildAppleClientSecret(privateKey, NOW).split('.')[2];
    const raw = Buffer.from(sig.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

    // A DER-encoded P-256 signature is ~70-72 bytes and starts with 0x30.
    expect(raw.length).toBe(64);
    expect(raw[0]).not.toBe(0x30);
  });

  it('produces a signature that actually verifies against the public key', () => {
    const jwt = buildAppleClientSecret(privateKey, NOW);
    const [header, payload, signature] = jwt.split('.');

    const ok = createVerify('SHA256')
      .update(`${header}.${payload}`)
      .verify(
        { key: createPublicKey(publicKey), dsaEncoding: 'ieee-p1363' },
        Buffer.from(signature.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
      );

    expect(ok).toBe(true);
  });

  it('rejects a tampered payload', () => {
    const jwt = buildAppleClientSecret(privateKey, NOW);
    const [header, , signature] = jwt.split('.');
    const forged = Buffer.from(JSON.stringify({ iss: 'attacker' })).toString('base64url');

    const ok = createVerify('SHA256')
      .update(`${header}.${forged}`)
      .verify(
        { key: createPublicKey(publicKey), dsaEncoding: 'ieee-p1363' },
        Buffer.from(signature.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
      );

    expect(ok).toBe(false);
  });
});
