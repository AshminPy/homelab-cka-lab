import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Catalog } from './content.ts';
import { percentOf } from './grading.ts';
import type { Attempt, AttemptListItem, DomainStat, ExamStats, ProgressResponse } from './shared.ts';

export interface ProgressData {
  version: 1;
  activeAttempt: Attempt | null;
  attempts: Attempt[];
}

const WEAK_BELOW_PERCENT = 80;

/** Single-user progress file, written atomically (temp file + rename). */
export class ProgressStore {
  readonly file: string;
  data: ProgressData;

  constructor(file: string) {
    this.file = file;
    this.data = this.read();
  }

  private read(): ProgressData {
    if (!existsSync(this.file)) return { version: 1, activeAttempt: null, attempts: [] };
    const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as ProgressData;
    if (parsed?.version !== 1 || !Array.isArray(parsed.attempts)) {
      throw new Error(`${this.file}: unsupported progress file format`);
    }
    return parsed;
  }

  save(): void {
    mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    renameSync(tmp, this.file);
  }
}

/** Whole days from today (local time) to a YYYY-MM-DD date; null without a date. */
export function daysUntil(date: string | undefined, now: Date): number | null {
  if (!date) return null;
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return null;
  const target = new Date(y, m - 1, d).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((target - today) / 86_400_000);
}

function isFinished(a: Attempt): a is Attempt & { finishedAt: string; summary: NonNullable<Attempt['summary']> } {
  return Boolean(a.finishedAt && a.summary);
}

export function toListItem(a: Attempt & { finishedAt: string; summary: NonNullable<Attempt['summary']> }): AttemptListItem {
  return {
    id: a.id,
    examId: a.examId,
    labId: a.labId,
    labTitle: a.labTitle,
    mode: a.mode,
    startedAt: a.startedAt,
    finishedAt: a.finishedAt,
    durationSec: Math.max(0, Math.round((Date.parse(a.finishedAt) - Date.parse(a.startedAt)) / 1000)),
    percent: a.summary.percent,
    passed: a.summary.passed,
  };
}

/** Dashboard numbers, computed from finished attempts only. */
export function computeProgress(data: ProgressData, catalog: Catalog, now: Date): ProgressResponse {
  const finished = data.attempts.filter(isFinished).sort((a, b) => a.finishedAt.localeCompare(b.finishedAt));

  const exams: ExamStats[] = catalog.exams.map((exam) => {
    const mine = finished.filter((a) => a.examId === exam.id);

    const totals = new Map<string, { score: number; maxScore: number }>();
    for (const a of mine) {
      for (const d of a.summary.domains) {
        const t = totals.get(d.domain) ?? { score: 0, maxScore: 0 };
        t.score += d.score;
        t.maxScore += d.maxScore;
        totals.set(d.domain, t);
      }
    }
    const domains: DomainStat[] = exam.domains.map((d) => {
      const t = totals.get(d.name) ?? { score: 0, maxScore: 0 };
      return { domain: d.name, weight: d.weight, score: t.score, maxScore: t.maxScore, percent: t.maxScore > 0 ? percentOf(t.score, t.maxScore) : null };
    });
    const weakest = domains
      .filter((d): d is DomainStat & { percent: number } => d.percent !== null && d.percent < WEAK_BELOW_PERCENT)
      .sort((a, b) => a.percent - b.percent)
      .slice(0, 2)
      .map((d) => d.domain);

    const labs = catalog.labs
      .filter((l) => l.examId === exam.id)
      .map((l) => {
        const runs = mine.filter((a) => a.labId === l.id);
        return {
          labId: l.id,
          title: l.title,
          attempts: runs.length,
          bestPercent: runs.length ? Math.max(...runs.map((a) => a.summary.percent)) : null,
          lastPercent: runs.at(-1)?.summary.percent ?? null,
        };
      });

    return {
      examId: exam.id,
      short: exam.short,
      attempts: mine.length,
      targetDate: exam.targetDate,
      daysToTarget: daysUntil(exam.targetDate, now),
      passPercent: exam.passPercent,
      domains,
      weakest,
      labs,
    };
  });

  const history = [...finished].reverse().map(toListItem);
  return { exams, history };
}
