import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { AttemptService, HttpError } from './attempts.ts';
import { loadCatalog } from './content.ts';
import { ProgressStore } from './progress.ts';
import { FakeOps, tempDir, writeContent } from './testkit.ts';

function setup(targetOk = true) {
  const catalog = loadCatalog(
    writeContent(tempDir(), [
      { id: 'q01-a', domain: 'Troubleshooting', checks: [{ id: 'a', points: 2 }, { id: 'b', points: 1 }] },
      { id: 'q02-b', domain: 'Workloads & Scheduling', checks: [{ id: 'c', points: 3 }] },
    ]),
  );
  const file = path.join(tempDir(), 'progress.json');
  const store = new ProgressStore(file);
  const ops = new FakeOps();
  const health = { ok: targetOk };
  const service = new AttemptService({
    catalog,
    store,
    ops,
    courseDir: '/tmp/course',
    nodes: () => ({ worker1: 'cka-worker' }),
    ensureTarget: async () => ({ ok: health.ok, error: health.ok ? undefined : 'cluster down', targetId: 'kind-cka' }),
  });
  return { service, store, ops, file, health };
}

const status = (fn: () => unknown) =>
  (err: unknown) => err instanceof HttpError && err.status === fn();

test('starting an attempt runs every setup and persists the attempt', async () => {
  const { service, ops, file } = setup();
  const a = await service.start('cka', 'lab-01', 'exam');
  assert.deepEqual(ops.prepared.sort(), ['q01-a', 'q02-b']);
  assert.equal(a.mode, 'exam');
  assert.equal(a.durationMinutes, 30);
  assert.equal(new ProgressStore(file).data.activeAttempt?.id, a.id, 'survives a restart');
});

test('a failed setup is recorded on the question instead of blocking the attempt', async () => {
  const { service, ops } = setup();
  ops.failSetup.add('q02-b');
  const a = await service.start('cka', 'lab-01', 'practice');
  assert.match(a.questions['q02-b']?.setupError ?? '', /setup exploded/);
  assert.equal(a.questions['q01-a']?.setupError, undefined);
  ops.failSetup.clear();
  const s = await service.reset(a.id, 'q02-b');
  assert.equal(s.setupError, undefined);
});

test('only one attempt can be in progress', async () => {
  const { service } = setup();
  await service.start('cka', 'lab-01', 'exam');
  await assert.rejects(service.start('cka', 'lab-01', 'exam'), status(() => 409));
});

test('an unreachable cluster blocks starting', async () => {
  const { service, store } = setup(false);
  await assert.rejects(service.start('cka', 'lab-01', 'exam'), (err: unknown) => err instanceof HttpError && err.status === 503 && /cluster down/.test(err.message));
  assert.equal(store.data.activeAttempt, null);
});

test('single-question checks are rejected in Exam mode', async () => {
  const { service } = setup();
  const a = await service.start('cka', 'lab-01', 'exam');
  await assert.rejects(service.check(a.id, 'q01-a'), status(() => 403));
});

test('in Practice mode the solution unlocks only after checking that question', async () => {
  const { service, ops } = setup();
  const a = await service.start('cka', 'lab-01', 'practice');
  assert.throws(() => service.solution(a.id, 'q01-a'), status(() => 403));
  ops.passing.add('q01-a/a');
  const r = await service.check(a.id, 'q01-a');
  assert.equal(r.score, 2);
  assert.equal(r.maxScore, 3);
  const sol = service.solution(a.id, 'q01-a');
  assert.equal(sol.markdown.trim(), 'Answer for /tmp/course/1 on cka-worker');
  assert.throws(() => service.solution(a.id, 'q02-b'), status(() => 403), 'other questions stay locked');
});

test('flag and done marks persist', async () => {
  const { service, file } = setup();
  const a = await service.start('cka', 'lab-01', 'exam');
  service.mark(a.id, 'q02-b', { flagged: true });
  service.mark(a.id, 'q01-a', { done: true });
  const saved = new ProgressStore(file).data.activeAttempt!;
  assert.equal(saved.questions['q02-b']?.flagged, true);
  assert.equal(saved.questions['q01-a']?.done, true);
  assert.throws(() => service.mark(a.id, 'q01-a', { flagged: 'yes' }), status(() => 400));
  assert.throws(() => service.mark(a.id, 'nope', { flagged: true }), status(() => 404));
});

test('finishing grades every question, scores against the pass mark, and unlocks solutions', async () => {
  const { service, store, ops } = setup();
  const a = await service.start('cka', 'lab-01', 'exam');
  ops.passing.add('q01-a/a');
  ops.passing.add('q02-b/c');
  const done = await service.finish(a.id);
  assert.equal(done.summary?.score, 5);
  assert.equal(done.summary?.maxScore, 6);
  assert.equal(done.summary?.percent, 83.3);
  assert.equal(done.summary?.passed, true);
  assert.deepEqual(done.summary?.domains.map((d) => [d.domain, d.score, d.maxScore]), [
    ['Troubleshooting', 2, 3],
    ['Workloads & Scheduling', 3, 3],
  ]);
  assert.equal(store.data.activeAttempt, null);
  assert.equal(store.data.attempts.length, 1);
  assert.ok(service.solution(a.id, 'q02-b').markdown.length > 0);
  await assert.rejects(service.check(a.id, 'q01-a'), status(() => 409), 'finished attempts are read-only');
});

test('a cluster outage blocks finish, check and reset instead of recording false fails', async () => {
  const { service, store, ops, health } = setup();
  const a = await service.start('cka', 'lab-01', 'practice');
  ops.passing.add('q01-a/a');
  health.ok = false;
  await assert.rejects(service.finish(a.id), (err: unknown) => err instanceof HttpError && err.status === 503 && /still open/.test(err.message));
  await assert.rejects(service.check(a.id, 'q01-a'), status(() => 503));
  await assert.rejects(service.reset(a.id, 'q01-a'), status(() => 503));
  assert.equal(store.data.activeAttempt?.id, a.id, 'attempt stays open');
  assert.equal(store.data.attempts.length, 0, 'nothing written to history');
  assert.equal(store.data.activeAttempt?.questions['q01-a']?.result, undefined);
  health.ok = true;
  const done = await service.finish(a.id);
  assert.equal(done.summary?.score, 2);
});

test('abandoning frees the slot for a new attempt', async () => {
  const { service, store } = setup();
  const a = await service.start('cka', 'lab-01', 'exam');
  await service.abandon(a.id);
  assert.equal(store.data.activeAttempt, null);
  assert.equal(store.data.attempts.length, 0);
  await service.start('cka', 'lab-01', 'practice');
});
