/**
 * Browser-side WebAuthn client.
 *
 * Registration and authentication use the real WebAuthn API
 * (`navigator.credentials.create` / `navigator.credentials.get`), which
 * triggers the platform's biometric prompt (Touch ID, Windows Hello,
 * Android fingerprint). Returned credentials + last-used timestamps are
 * persisted in localStorage.
 *
 * IMPORTANT: In production, the registration attestation and authentication
 * assertion MUST be verified server-side against a freshly-minted challenge.
 * This client stands up an end-to-end WebAuthn flow so the UX is real, but
 * the "server" here is localStorage — not secure. Swap the storage & challenge
 * layer for an API the moment a backend exists.
 */

export interface EnrolledCredential {
  /** base64url of the raw credential id */
  id: string;
  /** user-provided device nickname */
  deviceLabel: string;
  createdAt: string;
  lastUsedAt?: string;
  /** transports reported by the authenticator, if any */
  transports?: AuthenticatorTransport[];
}

const STORAGE_KEY = (userId: string) => `hrms:webauthn:${userId}`;
const RP_NAME = 'HRMS Portal';

const bufToB64u = (buf: ArrayBuffer): string => {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.byteLength; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const b64uToBuf = (b64u: string): ArrayBuffer => {
  const b64 = b64u.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64u.length + 3) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
};

const randomChallenge = (): ArrayBuffer => {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return b.buffer;
};

export function isWebAuthnSupported(): boolean {
  return typeof window !== 'undefined'
    && typeof window.PublicKeyCredential !== 'undefined'
    && typeof navigator !== 'undefined'
    && !!navigator.credentials;
}

export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!isWebAuthnSupported()) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export function listEnrollments(userId: string): EnrolledCredential[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY(userId));
    if (!raw) return [];
    return JSON.parse(raw) as EnrolledCredential[];
  } catch {
    return [];
  }
}

function saveEnrollments(userId: string, items: EnrolledCredential[]) {
  localStorage.setItem(STORAGE_KEY(userId), JSON.stringify(items));
}

export async function enrollCredential(params: {
  userId: string;
  userName: string;
  displayName: string;
  deviceLabel: string;
}): Promise<EnrolledCredential> {
  if (!isWebAuthnSupported()) {
    throw new Error('WebAuthn is not supported in this browser');
  }

  const userIdBuf = new TextEncoder().encode(params.userId);
  const challenge = randomChallenge();

  const existing = listEnrollments(params.userId);
  const excludeCredentials: PublicKeyCredentialDescriptor[] = existing.map((e) => ({
    id: b64uToBuf(e.id),
    type: 'public-key',
    transports: e.transports,
  }));

  const publicKey: PublicKeyCredentialCreationOptions = {
    challenge,
    rp: { name: RP_NAME, id: window.location.hostname },
    user: {
      id: userIdBuf,
      name: params.userName,
      displayName: params.displayName,
    },
    pubKeyCredParams: [
      { alg: -7, type: 'public-key' },   // ES256
      { alg: -257, type: 'public-key' }, // RS256
    ],
    timeout: 60_000,
    attestation: 'none',
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      userVerification: 'required',
      residentKey: 'preferred',
    },
    excludeCredentials,
  };

  const credential = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential | null;
  if (!credential) throw new Error('Enrollment cancelled');

  const response = credential.response as AuthenticatorAttestationResponse;
  const transports = typeof response.getTransports === 'function'
    ? (response.getTransports() as AuthenticatorTransport[])
    : undefined;

  const record: EnrolledCredential = {
    id: bufToB64u(credential.rawId),
    deviceLabel: params.deviceLabel,
    createdAt: new Date().toISOString(),
    transports,
  };

  saveEnrollments(params.userId, [...existing, record]);
  return record;
}

export async function authenticate(userId: string): Promise<{ credentialId: string } | null> {
  if (!isWebAuthnSupported()) {
    throw new Error('WebAuthn is not supported in this browser');
  }
  const enrollments = listEnrollments(userId);
  if (enrollments.length === 0) {
    throw new Error('No enrolled authenticators for this account');
  }

  const challenge = randomChallenge();
  const allowCredentials: PublicKeyCredentialDescriptor[] = enrollments.map((e) => ({
    id: b64uToBuf(e.id),
    type: 'public-key',
    transports: e.transports,
  }));

  const publicKey: PublicKeyCredentialRequestOptions = {
    challenge,
    rpId: window.location.hostname,
    timeout: 60_000,
    userVerification: 'required',
    allowCredentials,
  };

  const assertion = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential | null;
  if (!assertion) return null;

  const credentialId = bufToB64u(assertion.rawId);
  const updated = enrollments.map((e) =>
    e.id === credentialId ? { ...e, lastUsedAt: new Date().toISOString() } : e,
  );
  saveEnrollments(userId, updated);
  return { credentialId };
}

export function revokeCredential(userId: string, credentialId: string): void {
  const existing = listEnrollments(userId);
  saveEnrollments(userId, existing.filter((e) => e.id !== credentialId));
}

/** Policy toggle persisted in localStorage — per user. */
const POLICY_KEY = (userId: string) => `hrms:webauthn:policy:${userId}`;

export function getPolicyRequireBiometric(userId: string): boolean {
  return localStorage.getItem(POLICY_KEY(userId)) === 'true';
}

export function setPolicyRequireBiometric(userId: string, enabled: boolean): void {
  localStorage.setItem(POLICY_KEY(userId), enabled ? 'true' : 'false');
}
