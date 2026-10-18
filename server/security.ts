import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { NextFunction, Request, Response } from 'express';

export interface Security {
  token: string;
  allowedHosts: Set<string>;
  allowedOrigins: Set<string>;
}

/**
 * The terminal is a real shell, so only the app's own page may drive it:
 * - Host must be our loopback address (blocks DNS rebinding),
 * - Origin must be our own origin for anything that changes state or opens the terminal (blocks CSRF and
 *   cross-site WebSocket hijacking),
 * - the terminal also needs a per-run token that other origins cannot read (no CORS headers are ever sent).
 */
export function createSecurity(port: number, extraOrigins: string[] = []): Security {
  return {
    token: randomBytes(32).toString('hex'),
    allowedHosts: new Set([`127.0.0.1:${port}`, `localhost:${port}`]),
    allowedOrigins: new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`, ...extraOrigins]),
  };
}

export function hostAllowed(sec: Security, host: string | undefined): boolean {
  return host !== undefined && sec.allowedHosts.has(host.toLowerCase());
}

export function originAllowed(sec: Security, origin: string | undefined): boolean {
  return origin !== undefined && sec.allowedOrigins.has(origin.toLowerCase());
}

export function tokenMatches(sec: Security, candidate: string | null | undefined): boolean {
  if (!candidate) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(sec.token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function securityMiddleware(sec: Security) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!hostAllowed(sec, req.headers.host)) {
      res.status(403).json({ error: 'Forbidden host' });
      return;
    }
    const safe = req.method === 'GET' || req.method === 'HEAD';
    if (!safe && !originAllowed(sec, req.headers.origin)) {
      res.status(403).json({ error: 'Forbidden origin' });
      return;
    }
    next();
  };
}

export function upgradeAllowed(sec: Security, req: IncomingMessage): boolean {
  if (!hostAllowed(sec, req.headers.host) || !originAllowed(sec, req.headers.origin)) return false;
  const url = new URL(req.url ?? '/', 'http://localhost');
  return tokenMatches(sec, url.searchParams.get('token'));
}
