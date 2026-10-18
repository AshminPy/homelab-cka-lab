import type { Exam, Lab, Question } from './content.ts';
import { passed, type RunResult } from './runner.ts';
import type { AttemptSummary, CheckResult, QuestionResult } from './shared.ts';

export type CheckRunner = (q: Question, index: number) => Promise<RunResult>;

/** Run every check of a question in order; a check's points count only when it passes. */
export async function gradeQuestion(q: Question, run: CheckRunner): Promise<QuestionResult> {
  const checks: CheckResult[] = [];
  for (const [i, c] of q.checks.entries()) {
    const r = await run(q, i);
    checks.push({
      id: c.id,
      description: c.description,
      points: c.points,
      passed: passed(r),
      output: r.output.trim(),
      durationMs: r.durationMs,
    });
  }
  const score = checks.filter((c) => c.passed).reduce((sum, c) => sum + c.points, 0);
  return { questionId: q.id, domain: q.domain, score, maxScore: q.points, checks, gradedAt: new Date().toISOString() };
}

export const round1 = (n: number): number => Math.round(n * 10) / 10;
export const percentOf = (score: number, max: number): number => (max > 0 ? round1((score / max) * 100) : 0);

/** Totals for an attempt. Ungraded questions score 0 of their points. */
export function summarize(exam: Exam, lab: Lab, results: Record<string, QuestionResult | undefined>): AttemptSummary {
  let score = 0;
  let maxScore = 0;
  const byDomain = new Map<string, { score: number; maxScore: number }>();
  for (const q of lab.questions) {
    const s = results[q.id]?.score ?? 0;
    score += s;
    maxScore += q.points;
    const d = byDomain.get(q.domain) ?? { score: 0, maxScore: 0 };
    d.score += s;
    d.maxScore += q.points;
    byDomain.set(q.domain, d);
  }
  const domains = exam.domains
    .filter((d) => byDomain.has(d.name))
    .map((d) => {
      const t = byDomain.get(d.name)!;
      return { domain: d.name, score: t.score, maxScore: t.maxScore, percent: percentOf(t.score, t.maxScore) };
    });
  const percent = percentOf(score, maxScore);
  return { score, maxScore, percent, passPercent: exam.passPercent, passed: percent >= exam.passPercent, domains };
}

/** Run `fn` over `items` with at most `limit` in flight, keeping result order. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i] as T, i);
    }
  });
  await Promise.all(workers);
  return out;
}
