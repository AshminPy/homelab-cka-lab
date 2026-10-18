import assert from 'node:assert/strict';
import type { IncomingMessage } from 'node:http';
import { test } from 'node:test';
import type { NextFunction, Request, Response } from 'express';
import { createSecurity, securityMiddleware, upgradeAllowed } from './security.ts';

const sec = createSecurity(8088);

function run(method: string, headers: Record<string, string>) {
  let statusCode = 200;
  let nextCalled = false;
  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json() {
      return this;
    },
  } as unknown as Response;
  securityMiddleware(sec)({ method, headers } as Request, res, (() => {
    nextCalled = true;
  }) as NextFunction);
  return { statusCode, nextCalled };
}

test('requests with a foreign Host are refused (DNS rebinding)', () => {
  const r = run('GET', { host: 'evil.example:8088' });
  assert.equal(r.statusCode, 403);
  assert.equal(r.nextCalled, false);
});

test('GET from our own host is allowed without an Origin', () => {
  assert.equal(run('GET', { host: '127.0.0.1:8088' }).nextCalled, true);
  assert.equal(run('GET', { host: 'localhost:8088' }).nextCalled, true);
});

test('state-changing requests need our own Origin (CSRF)', () => {
  assert.equal(run('POST', { host: '127.0.0.1:8088', origin: 'https://evil.example' }).statusCode, 403);
  assert.equal(run('POST', { host: '127.0.0.1:8088' }).statusCode, 403, 'missing Origin is refused');
  assert.equal(run('DELETE', { host: '127.0.0.1:8088', origin: 'http://127.0.0.1:8088' }).nextCalled, true);
});

function upgrade(headers: Record<string, string>, url: string): boolean {
  return upgradeAllowed(sec, { headers, url } as unknown as IncomingMessage);
}

test('terminal upgrade needs our Host, our Origin and the session token', () => {
  const good = { host: '127.0.0.1:8088', origin: 'http://127.0.0.1:8088' };
  assert.equal(upgrade(good, `/ws/terminal?token=${sec.token}`), true);
  assert.equal(upgrade(good, '/ws/terminal'), false, 'missing token');
  assert.equal(upgrade(good, '/ws/terminal?token=nope'), false, 'wrong token');
  assert.equal(upgrade({ ...good, origin: 'https://evil.example' }, `/ws/terminal?token=${sec.token}`), false, 'cross-site WebSocket');
  assert.equal(upgrade({ ...good, host: 'evil.example' }, `/ws/terminal?token=${sec.token}`), false, 'foreign host');
});

test('each run gets a fresh random token', () => {
  assert.notEqual(createSecurity(8088).token, sec.token);
  assert.equal(sec.token.length, 64);
});
