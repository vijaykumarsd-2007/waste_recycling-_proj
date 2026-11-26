import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { db } from './db.ts';
import type { UserRole } from '../src/shared/types.ts';

const JWT_SECRET = process.env.JWT_SECRET && process.env.JWT_SECRET.trim().length > 0
  ? process.env.JWT_SECRET.trim()
  : crypto.randomBytes(32).toString('hex');

export const COOKIE_NAME = 'scrapease_session';

export interface AuthTokenPayload {
  userId: number;
  role: UserRole;
  email: string;
}

export interface AuthedRequest extends Request {
  user?: {
    id: number;
    role: UserRole;
    email: string;
    name: string;
    status: string;
  };
}

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyAuthToken(token: string): AuthTokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
  } catch {
    return null;
  }
}

export function parseCookieHeader(cookieHeader: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const key = part.slice(0, idx).trim();
      const val = decodeURIComponent(part.slice(idx + 1).trim());
      result[key] = val;
    }
  }
  return result;
}

export function setAuthCookie(req: Request, res: Response, token: string): void {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${7 * 24 * 60 * 60}`,
  ];
  if (isHttps) {
    parts.push('SameSite=None', 'Secure', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearAuthCookie(req: Request, res: Response): void {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const parts = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'Max-Age=0'];
  if (isHttps) {
    parts.push('SameSite=None', 'Secure', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const cookies = parseCookieHeader(req.headers.cookie);
  return cookies[COOKIE_NAME] || null;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const decoded = verifyAuthToken(token);
  if (!decoded) {
    res.status(401).json({ error: 'Invalid or expired session token' });
    return;
  }

  const user = db
    .prepare('SELECT id, role, email, name, status FROM users WHERE id = ?')
    .get(decoded.userId) as { id: number; role: UserRole; email: string; name: string; status: string } | undefined;

  if (!user) {
    res.status(401).json({ error: 'Account not found' });
    return;
  }
  if (user.status === 'blocked') {
    res.status(403).json({ error: 'Your account has been suspended by an administrator.' });
    return;
  }

  req.user = user;
  next();
}

export function requireRole(allowedRoles: UserRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions for this resource' });
      return;
    }
    next();
  };
}

export function verifyOriginOnCookieMutation(req: Request, res: Response, next: NextFunction): void {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    next();
    return;
  }
  // If Authorization Bearer header is used, CSRF does not apply; if relying on cookie, check Origin/X-Requested-With
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    next();
    return;
  }
  const cookies = parseCookieHeader(req.headers.cookie);
  if (!cookies[COOKIE_NAME]) {
    next();
    return;
  }

  const origin = req.headers.origin;
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '').toString().split(',')[0].trim();
  const xrw = req.headers['x-requested-with'];
  if (xrw === 'ScrapEase') {
    next();
    return;
  }
  if (origin && host) {
    try {
      const parsed = new URL(origin);
      if (parsed.host === host) {
        next();
        return;
      }
    } catch {
      // fall through
    }
  }
  res.status(403).json({ error: 'Origin verification failed' });
}
