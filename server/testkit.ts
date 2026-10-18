// Helpers for unit tests: temporary content trees and fake question runners.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import type { Lab, Question } from './content.ts';
import type { QuestionOps } from './labrunner.ts';
import type { RunResult } from './runner.ts';

export function tempDir(prefix = 'lab-test-'): string {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

export const EXAMS_YAML = YAML.stringify({
  exams: [
    {
      id: 'cka',
      short: 'CKA',
      name: 'Test exam',
      passPercent: 66,
      durationMinutes: 120,
      kubernetesVersion: 'v1.35',
      targetDate: '2026-11-24',
      domains: [
        { name: 'Troubleshooting', weight: 30 },
        { name: 'Workloads & Scheduling', weight: 15 },
      ],
    },
  ],
});

export interface QuestionSpec {
  id: string;
  domain?: string;
  difficulty?: string;
  tasks?: string;
  checks?: { id: string; points: number; run?: string }[] | null;
  omitFiles?: string[];
  solutionMd?: string;
}

/** Write exams.yaml plus one CKA lab with the given questions; returns the content dir. */
export function writeContent(dir: string, questions: QuestionSpec[], labId = 'lab-01'): string {
  writeFileSync(path.join(dir, 'exams.yaml'), EXAMS_YAML);
  const labDir = path.join(dir, 'labs', 'cka', labId);
  mkdirSync(labDir, { recursive: true });
  writeFileSync(
    path.join(labDir, 'lab.yaml'),
    YAML.stringify({ id: labId, title: 'Test lab', durationMinutes: 30, questions: questions.map((q) => q.id) }),
  );
  for (const q of questions) {
    const qDir = path.join(labDir, q.id);
    mkdirSync(qDir, { recursive: true });
    const doc: Record<string, unknown> = {
      id: q.id,
      title: `Question ${q.id}`,
      domain: q.domain ?? 'Troubleshooting',
      difficulty: q.difficulty ?? 'easy',
      tasks: q.tasks ?? 'Do the thing.',
    };
    if (q.checks !== null) {
      doc.checks = (q.checks ?? [{ id: 'one', points: 1 }]).map((c) => ({ id: c.id, description: `check ${c.id}`, points: c.points, run: c.run ?? 'true' }));
    }
    writeFileSync(path.join(qDir, 'question.yaml'), YAML.stringify(doc));
    const files: Record<string, string> = {
      'setup.sh': 'true\n',
      'cleanup.sh': 'true\n',
      'solution.sh': 'true\n',
      'solution.md': q.solutionMd ?? 'Answer for {{qdir}} on {{nodes.worker1}}\n',
    };
    for (const [name, body] of Object.entries(files)) {
      if (!q.omitFiles?.includes(name)) writeFileSync(path.join(qDir, name), body);
    }
  }
  return dir;
}

const ok = (output = ''): RunResult => ({ exitCode: 0, timedOut: false, output, durationMs: 1 });
const fail = (output = 'failed'): RunResult => ({ exitCode: 1, timedOut: false, output, durationMs: 1 });

/** Fake runner: checks pass when listed in `passing` as "<questionId>/<checkId>". */
export class FakeOps implements QuestionOps {
  prepared: string[] = [];
  passing = new Set<string>();
  failSetup = new Set<string>();

  async prepare(_lab: Lab, q: Question): Promise<RunResult> {
    this.prepared.push(q.id);
    return this.failSetup.has(q.id) ? fail('setup exploded') : ok();
  }
  async cleanup(): Promise<RunResult> {
    return ok();
  }
  async solve(): Promise<RunResult> {
    return ok();
  }
  async check(_lab: Lab, q: Question, index: number): Promise<RunResult> {
    const c = q.checks[index];
    return c && this.passing.has(`${q.id}/${c.id}`) ? ok() : fail(`check ${c?.id} failed`);
  }
}
