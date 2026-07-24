import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

// ================= סיסמאות (scrypt) =================
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, salt, hash] = stored.split('$');
    if (scheme !== 'scrypt') return false;
    const derived = scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, 'hex');
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

// ================= סשן (עוגייה חתומה HMAC) =================
export interface Session {
  uid: string;       // app_users.id
  role: 'picker' | 'manager';
  name: string;
  username: string;
  exp: number;       // epoch seconds
}

const COOKIE = 'gqc_session';

function secret(): string {
  return process.env.AUTH_SECRET || 'dev-insecure-secret-change-me';
}

export function signSession(payload: Omit<Session, 'exp'>, days = 14): string {
  const body: Session = { ...payload, exp: Math.floor(Date.now() / 1000) + days * 86400 };
  const b64 = Buffer.from(JSON.stringify(body)).toString('base64url');
  const sig = createHmac('sha256', secret()).update(b64).digest('base64url');
  return `${b64}.${sig}`;
}

export function verifySession(token: string | undefined): Session | null {
  if (!token) return null;
  const [b64, sig] = token.split('.');
  if (!b64 || !sig) return null;
  const expected = createHmac('sha256', secret()).update(b64).digest('base64url');
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const s = JSON.parse(Buffer.from(b64, 'base64url').toString()) as Session;
    if (s.exp < Math.floor(Date.now() / 1000)) return null;
    return s;
  } catch {
    return null;
  }
}

// ================= עזרי עוגיות (App Router) =================
export function setSessionCookie(token: string) {
  cookies().set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 14 * 86400,
  });
}

export function clearSessionCookie() {
  cookies().set(COOKIE, '', { path: '/', maxAge: 0 });
}

export function getSession(): Session | null {
  return verifySession(cookies().get(COOKIE)?.value);
}

export function requireManager(): Session {
  const s = getSession();
  if (!s || s.role !== 'manager') throw new AuthError('נדרשת הרשאת מנהל');
  return s;
}

export function requireUser(): Session {
  const s = getSession();
  if (!s) throw new AuthError('נדרשת התחברות');
  return s;
}

export class AuthError extends Error {}
