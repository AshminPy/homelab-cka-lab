import path from 'node:path';
import { COURSE_DIR, TIMEOUTS } from './config.ts';
import { qdirFor, type Lab, type Question } from './content.ts';
import { passed, runBash, runFile, type RunResult } from './runner.ts';
import { childEnv, type TargetContext } from './target.ts';

/** Everything the app does to a question's environment. Faked in unit tests. */
export interface QuestionOps {
  /** cleanup (if any) then setup */
  prepare(lab: Lab, q: Question): Promise<RunResult>;
  cleanup(lab: Lab, q: Question): Promise<RunResult>;
  solve(lab: Lab, q: Question): Promise<RunResult>;
  check(lab: Lab, q: Question, index: number): Promise<RunResult>;
}

const NOTHING_TO_DO: RunResult = { exitCode: 0, timedOut: false, output: '', durationMs: 0 };

export class LabRunner implements QuestionOps {
  private readonly getCtx: () => TargetContext;
  private readonly log: (msg: string) => void;

  constructor(getCtx: () => TargetContext, log: (msg: string) => void = (m) => console.log(m)) {
    this.getCtx = getCtx;
    this.log = log;
  }

  private env(lab: Lab, q: Question): Record<string, string> {
    return childEnv(this.getCtx(), { Q_DIR: qdirFor(COURSE_DIR, lab, q.id) });
  }

  private async script(lab: Lab, q: Question, name: 'setup' | 'cleanup' | 'solution'): Promise<RunResult> {
    const r = await runFile(path.join(q.dir, `${name}.sh`), { env: this.env(lab, q), timeoutMs: TIMEOUTS.scriptMs, cwd: q.dir });
    this.log(`${name} ${lab.id}/${q.id} exit=${r.exitCode}${r.timedOut ? ' timeout' : ''} ${r.durationMs}ms`);
    return r;
  }

  cleanup(lab: Lab, q: Question): Promise<RunResult> {
    return q.hasCleanup ? this.script(lab, q, 'cleanup') : Promise.resolve(NOTHING_TO_DO);
  }

  async prepare(lab: Lab, q: Question): Promise<RunResult> {
    const c = await this.cleanup(lab, q);
    if (!passed(c)) return c;
    return this.script(lab, q, 'setup');
  }

  solve(lab: Lab, q: Question): Promise<RunResult> {
    return this.script(lab, q, 'solution');
  }

  async check(lab: Lab, q: Question, index: number): Promise<RunResult> {
    const c = q.checks[index];
    if (!c) throw new Error(`${q.id} has no check #${index}`);
    const r = await runBash(c.run, [], { env: this.env(lab, q), timeoutMs: TIMEOUTS.checkMs, cwd: q.dir });
    this.log(`check ${lab.id}/${q.id}/${c.id} exit=${r.exitCode}${r.timedOut ? ' timeout' : ''} ${r.durationMs}ms`);
    return r;
  }
}
