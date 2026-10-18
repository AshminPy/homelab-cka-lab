import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { loadCatalog, type Catalog } from './content.ts';
import { computeProgress, daysUntil, ProgressStore } from './progress.ts';
import type { Attempt } from './shared.ts';
import { tempDir, writeContent } from './testkit.ts';

function catalog(): Catalog {
  return loadCatalog(
    writeContent(tempDir(), [
      { id: 'q01-a', domain: 'Troubleshooting' },
      { id: 'q02-b', domain: 'Workloads & Scheduling' },
    ]),
  );
}

function finished(percent: number, domains: [string, number, number][], finishedAt: string): Attempt {
  return {
    id: `a-${finishedAt}`,
    examId: 'cka',
    labId: 'lab-01',
    labTitle: 'Test lab',
    mode: 'exam',
    target: 'kind-cka',
    startedAt: '2026-10-18T10:00:00.000Z',
    finishedAt,
    durationMinutes: 30,
    questions: {},
    summary: {
      score: 0,
      maxScore: 0,
      percent,
      passPercent: 66,
      passed: percent >= 66,
      domains: domains.map(([domain, score, maxScore]) => ({ domain, score, maxScore, percent: (score / maxScore) * 100 })),
    },
  };
}

test('history survives a reload of the progress file', () => {
  const file = path.join(tempDir(), 'progress.json');
  const store = new ProgressStore(file);
  store.data.attempts.push(finished(70, [['Troubleshooting', 7, 10]], '2026-10-18T10:30:00.000Z'));
  store.save();
  const reloaded = new ProgressStore(file);
  assert.equal(reloaded.data.attempts.length, 1);
  assert.equal(reloaded.data.attempts[0]?.summary?.percent, 70);
});

test('weakest domain is the lowest one below 80%', () => {
  const data = {
    version: 1 as const,
    activeAttempt: null,
    attempts: [
      finished(55, [['Troubleshooting', 4, 10], ['Workloads & Scheduling', 7, 10]], '2026-10-18T10:30:00.000Z'),
      finished(80, [['Troubleshooting', 4, 10], ['Workloads & Scheduling', 9, 10]], '2026-10-19T10:30:00.000Z'),
    ],
  };
  const p = computeProgress(data, catalog(), new Date(2026, 9, 18));
  const cka = p.exams[0]!;
  assert.equal(cka.attempts, 2);
  assert.equal(cka.weakest[0], 'Troubleshooting');
  assert.deepEqual(cka.domains.map((d) => [d.domain, d.percent]), [['Troubleshooting', 40], ['Workloads & Scheduling', 80]]);
  assert.deepEqual(cka.weakest, ['Troubleshooting']);
  assert.equal(cka.labs[0]?.bestPercent, 80);
  assert.equal(cka.labs[0]?.lastPercent, 80);
  assert.equal(p.history[0]?.percent, 80, 'history is newest first');
  assert.equal(p.history[0]?.durationSec, 86_400 + 1_800);
});

test('no finished attempts means no data, not zero scores', () => {
  const p = computeProgress({ version: 1, activeAttempt: null, attempts: [] }, catalog(), new Date(2026, 9, 18));
  const cka = p.exams[0]!;
  assert.equal(cka.attempts, 0);
  assert.ok(cka.domains.every((d) => d.percent === null));
  assert.deepEqual(cka.weakest, []);
  assert.equal(cka.labs[0]?.bestPercent, null);
});

test('days until a target date counts whole local days', () => {
  assert.equal(daysUntil('2026-11-24', new Date(2026, 9, 18, 23, 59)), 37);
  assert.equal(daysUntil('2026-10-18', new Date(2026, 9, 18, 8, 0)), 0);
  assert.equal(daysUntil(undefined, new Date()), null);
});
