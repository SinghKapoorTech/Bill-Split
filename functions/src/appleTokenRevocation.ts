/**
 * appleTokenRevocation.ts
 *
 * Revokes a user's Sign in with Apple tokens when they delete their account.
 *
 * Apple's account-deletion policy:
 *
 *   > Apps that support Sign in with Apple should use the Sign in with Apple
 *   > REST API to revoke user tokens.
 *
 * ## Why this is hand-rolled instead of using Firebase's revokeAccessToken
 *
 * Firebase exposes `revokeAccessToken`, but it only works if the Apple provider
 * in the Firebase console has its "OAuth code flow configuration" filled in —
 * and the console refuses to save those fields without a **Services ID**:
 *
 *   > A services ID is required when OAuth code flow is set
 *
 * A Services ID represents *web* Sign in with Apple, which Divit deliberately
 * does not offer (iOS only). Rather than register a web identity we don't use,
 * we call Apple directly. For a native app the `client_id` is the **bundle
 * identifier**, so no Services ID is involved anywhere in this flow.
 *
 * ## The exchange
 *
 * Apple will not revoke an authorization code directly. The code must first be
 * exchanged for a refresh token, and the refresh token is what gets revoked.
 * Both calls authenticate with a short-lived ES256 JWT signed by the .p8.
 *
 * Verified against Apple on 2026-09-06: signing a client secret this way and
 * presenting a bogus code returns `invalid_grant` (not `invalid_client`),
 * confirming the key, Key ID, Team ID and bundle ID all line up.
 */

import { createSign } from 'node:crypto';
import { logger } from 'firebase-functions';

/** Apple Developer Team ID. Not secret — it appears in the Xcode project. */
export const APPLE_TEAM_ID = '3LAJCPKLNV';

/** Key ID of the Sign in with Apple private key. Not secret. */
export const APPLE_KEY_ID = '2PJ6RGN66M';

/**
 * The `client_id` Apple expects. For a NATIVE app this is the bundle
 * identifier, not a Services ID — which is exactly why this app needs no
 * Services ID at all.
 */
export const APPLE_CLIENT_ID = 'com.singhkapoortech.divit';

const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';

/** Apple rejects client secrets valid for longer than 6 months; minutes is plenty. */
const CLIENT_SECRET_TTL_SECONDS = 300;

const base64url = (input: Buffer | string): string =>
  Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

/**
 * Builds the ES256 JWT Apple accepts as `client_secret`.
 *
 * Node's default EC signature output is DER; JOSE requires the raw r||s pair.
 * `dsaEncoding: 'ieee-p1363'` produces exactly that — getting this wrong yields
 * a confusing `invalid_client` from Apple rather than a signature error.
 */
export function buildAppleClientSecret(privateKey: string, nowSeconds: number): string {
  const header = { alg: 'ES256', kid: APPLE_KEY_ID, typ: 'JWT' };
  const payload = {
    iss: APPLE_TEAM_ID,
    iat: nowSeconds,
    exp: nowSeconds + CLIENT_SECRET_TTL_SECONDS,
    aud: 'https://appleid.apple.com',
    sub: APPLE_CLIENT_ID,
  };

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;

  const signature = createSign('SHA256')
    .update(signingInput)
    .sign({ key: privateKey, dsaEncoding: 'ieee-p1363' });

  return `${signingInput}.${base64url(signature)}`;
}

function readPrivateKey(): string {
  const key = process.env.APPLE_SIGNIN_PRIVATE_KEY;
  if (!key) {
    throw new Error(
      'APPLE_SIGNIN_PRIVATE_KEY is not set. Run: firebase functions:secrets:set APPLE_SIGNIN_PRIVATE_KEY'
    );
  }
  // Secret managers commonly flatten newlines; the PEM parser needs them back.
  return key.includes('\\n') ? key.replace(/\\n/g, '\n') : key;
}

/**
 * Exchanges the authorization code for a refresh token, then revokes it.
 *
 * Apple answers a successful revoke with HTTP 200 and an EMPTY body, so success
 * must be judged on status alone — there is no payload to assert against.
 */
export async function revokeAppleToken(
  authorizationCode: string,
  privateKeyOverride?: string
): Promise<void> {
  const privateKey = privateKeyOverride ?? readPrivateKey();
  const clientSecret = buildAppleClientSecret(privateKey, Math.floor(Date.now() / 1000));

  const tokenRes = await fetch(APPLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: APPLE_CLIENT_ID,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code: authorizationCode,
    }),
  });

  if (!tokenRes.ok) {
    throw new Error(`Apple token exchange failed: ${tokenRes.status} ${await tokenRes.text()}`);
  }

  const { refresh_token: refreshToken } = (await tokenRes.json()) as { refresh_token?: string };

  if (!refreshToken) {
    throw new Error('Apple token exchange returned no refresh_token');
  }

  const revokeRes = await fetch(APPLE_REVOKE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: APPLE_CLIENT_ID,
      client_secret: clientSecret,
      token: refreshToken,
      token_type_hint: 'refresh_token',
    }),
  });

  if (!revokeRes.ok) {
    throw new Error(`Apple token revocation failed: ${revokeRes.status} ${await revokeRes.text()}`);
  }

  logger.info('[appleTokenRevocation] refresh token revoked');
}
