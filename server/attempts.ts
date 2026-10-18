import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { findLab, qdirFor, renderText, type Catalog, type Lab, type Question } from './content.ts';
import { gradeQuestion, mapLimit, summarize } from './grading.ts';
import type { QuestionOps } from './labrunner.ts';
import type { ProgressStore } from './progress.ts';
import { passed, type RunResult } from './runner.ts';
import type { Attempt, Mode, QuestionResult, QuestionState, SolutionResponse } from './shared.ts';

export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface AttemptDeps {
  catalog: Catalog;
  store: ProgressStore;
  ops: QuestionOps;
  ensureTarget: () => Promise<{ ok: boolean; error?: string; targetId: string }>;
  nodes: () => Record<string, string>;
  courseDir: string;
  now?: () => Date;
}

const failureText = (r: RunResult): string =>
  (r.output.trim().split('\n').slice(-6).join('\n') || `exit code ${r.exitCode ?? 'none'}`) + (r.timedOut ? '\n(timed out)' : '');

export class AttemptService {
  private readonly deps: AttemptDeps;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(deps: AttemptDeps) {
    this.deps = deps;
  }

  /** Serialize everything that runs scripts or writes progress, so requests can't interleave. */
  private locked<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.catch(() => undefined);
    return run;
  }

  private now(): Date {
    return this.deps.now ? this.deps.now() : new Date();
  }

  private get data() {
    return this.deps.store.data;
  }

  private labOf(attempt: Attempt): Lab {
    const lab = findLab(this.deps.catalog, attempt.examId, attempt.labId);
    if (!lab) throw new HttpError(410, `Lab ${attempt.examId}/${attempt.labId} no longer exists`);
    return lab;
  }

  private requireActive(id: string): Attempt {
    const a = this.data.activeAttempt;
    if (!a || a.id !== id) throw new HttpError(409, 'That attempt is not in progress');
    return a;
  }

  private questionOf(attempt: Attempt, qid: string): { lab: Lab; q: Question; state: QuestionState } {
    const lab = this.labOf(attempt);
    const q = lab.questions.find((x) => x.id === qid);
    const state = attempt.questions[qid];
    if (!q || !state) throw new HttpError(404, `Unknown question "${qid}"`);
    return { lab, q, state };
  }

  active(): Attempt | null {
    return this.data.activeAttempt;
  }

  get(id: string): Attempt {
    const a = this.data.activeAttempt?.id === id ? this.data.activeAttempt : this.data.attempts.find((x) => x.id === id);
    if (!a) throw new HttpError(404, 'Attempt not found');
    return a;
  }

  start(examId: string, labId: string, mode: Mode): Promise<Attempt> {
    return this.locked(async () => {
      const lab = findLab(this.deps.catalog, examId, labId);
      if (!lab) throw new HttpError(404, `Unknown lab ${examId}/${labId}`);
      const current = this.data.activeAttempt;
      if (current) throw new HttpError(409, `"${current.labTitle}" is still in progress. Resume or abandon it first.`);
      const target = await this.deps.ensureTarget();
      if (!target.ok) throw new HttpError(503, `Practice cluster not available: ${target.error ?? 'unknown error'}`);

      const results = await mapLimit(lab.questions, 4, (q) => this.deps.ops.prepare(lab, q));
      const questions: Record<string, QuestionState> = {};
      lab.questions.forEach((q, i) => {
        const r = results[i] as RunResult;
        questions[q.id] = { flagged: false, done: false, ...(passed(r) ? {} : { setupError: failureText(r) }) };
      });

      const attempt: Attempt = {
        id: randomUUID(),
        examId,
        labId,
        labTitle: lab.title,
        mode,
        target: target.targetId,
        startedAt: this.now().toISOString(),
        durationMinutes: lab.durationMinutes,
        questions,
      };
      this.data.activeAttempt = attempt;
      this.deps.store.save();
      return attempt;
    });
  }

  mark(id: string, qid: string, patch: unknown): QuestionState {
    const attempt = this.requireActive(id);
    const { state } = this.questionOf(attempt, qid);
    const p = (patch ?? {}) as Record<string, unknown>;
    for (const key of ['flagged', 'done'] as const) {
      if (p[key] !== undefined) {
        if (typeof p[key] !== 'boolean') throw new HttpError(400, `"${key}" must be true or false`);
        state[key] = p[key];
      }
    }
    this.deps.store.save();
    return state;
  }

  reset(id: string, qid: string): Promise<QuestionState> {
    return this.locked(async () => {
      const attempt = this.requireActive(id);
      const { lab, q, state } = this.questionOf(attempt, qid);
      await this.requireTarget();
      const r = await this.deps.ops.prepare(lab, q);
      delete state.result;
      if (passed(r)) delete state.setupError;
      else state.setupError = failureText(r);
      this.deps.store.save();
      return state;
    });
  }

  /** Grading an unreachable cluster would record false fails, so refuse instead and keep the attempt open. */
  private async requireTarget(): Promise<void> {
    const target = await this.deps.ensureTarget();
    if (!target.ok) {
      throw new HttpError(503, `Practice cluster not available: ${target.error ?? 'unknown error'}. Your attempt is still open; try again when the cluster is back.`);
    }
  }

  check(id: string, qid: string): Promise<QuestionResult> {
    return this.locked(async () => {
      const attempt = this.requireActive(id);
      if (attempt.mode !== 'practice') {
        throw new HttpError(403, 'Checks are only available in Practice mode. Finish the attempt to see your score.');
      }
      const { lab, q, state } = this.questionOf(attempt, qid);
      await this.requireTarget();
      const result = await gradeQuestion(q, (qq, i) => this.deps.ops.check(lab, qq, i));
      state.result = result;
      this.deps.store.save();
      return result;
    });
  }

  finish(id: string): Promise<Attempt> {
    return this.locked(async () => {
      const attempt = this.requireActive(id);
      const lab = this.labOf(attempt);
      const exam = this.deps.catalog.exams.find((e) => e.id === attempt.examId);
      if (!exam) throw new HttpError(410, `Exam ${attempt.examId} no longer exists`);
      await this.requireTarget();
      const graded = await mapLimit(lab.questions, 3, (q) => gradeQuestion(q, (qq, i) => this.deps.ops.check(lab, qq, i)));
      const results: Record<string, QuestionResult> = {};
      for (const r of graded) {
        results[r.questionId] = r;
        const state = attempt.questions[r.questionId];
        if (state) state.result = r;
      }
      attempt.summary = summarize(exam, lab, results);
      attempt.finishedAt = this.now().toISOString();
      this.data.attempts.push(attempt);
      this.data.activeAttempt = null;
      this.deps.store.save();
      return attempt;
    });
  }

  abandon(id: string): Promise<void> {
    return this.locked(async () => {
      this.requireActive(id);
      this.data.activeAttempt = null;
      this.deps.store.save();
    });
  }

  solution(id: string, qid: string): SolutionResponse {
    const attempt = this.get(id);
    const { lab, q, state } = this.questionOf(attempt, qid);
    const unlocked = Boolean(attempt.finishedAt) || (attempt.mode === 'practice' && Boolean(state.result));
    if (!unlocked) {
      throw new HttpError(403, attempt.mode === 'practice' ? 'Check this question first to unlock its solution.' : 'Solutions unlock when you finish the attempt.');
    }
    const raw = readFileSync(path.join(q.dir, 'solution.md'), 'utf8');
    const markdown = renderText(raw, { nodes: this.deps.nodes(), qdir: qdirFor(this.deps.courseDir, lab, q.id) });
    return { questionId: q.id, markdown };
  }
}
