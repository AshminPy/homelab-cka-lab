import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadCatalog } from './content.ts';
import { gradeQuestion, mapLimit, summarize } from './grading.ts';
import { tempDir, writeContent } from './testkit.ts';

function fixture() {
  const dir = writeContent(tempDir(), [
    { id: 'q01-a', domain: 'Troubleshooting', checks: [{ id: 'a', points: 2 }, { id: 'b', points: 1 }] },
    { id: 'q02-b', domain: 'Workloads & Scheduling', checks: [{ id: 'c', points: 3 }] },
  ]);
  const catalog = loadCatalog(dir);
  return { exam: catalog.exams[0]!, lab: catalog.labs[0]! };
}

test('a check earns its points only when it passes', async () => {
  const { lab } = fixture();
  const q = lab.questions[0]!;
  const result = await gradeQuestion(q, async (_q, i) => ({ exitCode: i === 0 ? 0 : 1, timedOut: false, output: ' out \n', durationMs: 5 }));
  assert.equal(result.score, 2);
  assert.equal(result.maxScore, 3);
  assert.deepEqual(result.checks.map((c) => c.passed), [true, false]);
  assert.equal(result.checks[0]?.output, 'out');
});

test('a timed-out check fails even with exit code 0', async () => {
  const { lab } = fixture();
  const result = await gradeQuestion(lab.questions[1]!, async () => ({ exitCode: 0, timedOut: true, output: '', durationMs: 1 }));
  assert.equal(result.score, 0);
});

test('summary computes total %, pass mark and per-domain scores; ungraded questions score 0', () => {
  const { exam, lab } = fixture();
  const s = summarize(exam, lab, {
    'q01-a': { questionId: 'q01-a', domain: 'Troubleshooting', score: 2, maxScore: 3, checks: [], gradedAt: '' },
    'q02-b': { questionId: 'q02-b', domain: 'Workloads & Scheduling', score: 3, maxScore: 3, checks: [], gradedAt: '' },
  });
  assert.equal(s.score, 5);
  assert.equal(s.maxScore, 6);
  assert.equal(s.percent, 83.3);
  assert.equal(s.passed, true);
  assert.deepEqual(s.domains.map((d) => [d.domain, d.percent]), [['Troubleshooting', 66.7], ['Workloads & Scheduling', 100]]);

  const empty = summarize(exam, lab, {});
  assert.equal(empty.percent, 0);
  assert.equal(empty.passed, false);
});

test('exactly the pass mark passes', () => {
  const { lab } = fixture();
  const exam = { ...fixture().exam, passPercent: 50 };
  const s = summarize(exam, lab, { 'q02-b': { questionId: 'q02-b', domain: 'Workloads & Scheduling', score: 3, maxScore: 3, checks: [], gradedAt: '' } });
  assert.equal(s.percent, 50);
  assert.equal(s.passed, true);
});

test('mapLimit keeps order and respects the limit', async () => {
  let inFlight = 0;
  let peak = 0;
  const out = await mapLimit([5, 1, 3, 2], 2, async (n) => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, n));
    inFlight--;
    return n * 10;
  });
  assert.deepEqual(out, [50, 10, 30, 20]);
  assert.equal(peak, 2);
});
