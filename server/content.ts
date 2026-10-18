import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import type { Difficulty } from './shared.ts';

export interface Check {
  id: string;
  description: string;
  points: number;
  run: string;
}

export interface Question {
  id: string;
  dir: string;
  title: string;
  domain: string;
  difficulty: Difficulty;
  context: string;
  tasks: string;
  checks: Check[];
  points: number;
  hasCleanup: boolean;
}

export interface Lab {
  id: string;
  examId: string;
  dir: string;
  title: string;
  description: string;
  level?: string;
  durationMinutes: number;
  questions: Question[];
}

export interface Exam {
  id: string;
  short: string;
  name: string;
  passPercent: number;
  durationMinutes: number;
  kubernetesVersion: string;
  targetDate?: string;
  domains: { name: string; weight: number }[];
}

export interface Catalog {
  exams: Exam[];
  labs: Lab[];
}

export class ContentError extends Error {}

const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

type Obj = Record<string, unknown>;

function readYaml(file: string): Obj {
  if (!existsSync(file)) throw new ContentError(`${file}: file not found`);
  const parsed: unknown = YAML.parse(readFileSync(file, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ContentError(`${file}: expected a YAML mapping`);
  }
  return parsed as Obj;
}

function str(obj: Obj, field: string, file: string, optional = false): string {
  const v = obj[field];
  if (v === undefined || v === null || v === '') {
    if (optional) return '';
    throw new ContentError(`${file}: missing required field "${field}"`);
  }
  if (typeof v !== 'string') throw new ContentError(`${file}: field "${field}" must be a string`);
  return v;
}

function num(obj: Obj, field: string, file: string): number {
  const v = obj[field];
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
    throw new ContentError(`${file}: field "${field}" must be a positive number`);
  }
  return v;
}

function id(obj: Obj, field: string, file: string): string {
  const v = str(obj, field, file);
  if (!ID_RE.test(v)) throw new ContentError(`${file}: field "${field}" must be lowercase letters, digits and dashes`);
  return v;
}

function loadExams(contentDir: string): Exam[] {
  const file = path.join(contentDir, 'exams.yaml');
  const doc = readYaml(file);
  if (!Array.isArray(doc.exams) || doc.exams.length === 0) {
    throw new ContentError(`${file}: missing required field "exams"`);
  }
  const seen = new Set<string>();
  return doc.exams.map((raw: unknown, i: number) => {
    const where = `${file} exams[${i}]`;
    const e = raw as Obj;
    const examId = id(e, 'id', where);
    if (seen.has(examId)) throw new ContentError(`${where}: duplicate exam id "${examId}"`);
    seen.add(examId);
    if (!Array.isArray(e.domains) || e.domains.length === 0) {
      throw new ContentError(`${where}: missing required field "domains"`);
    }
    const domains = e.domains.map((d: unknown, j: number) => {
      const dw = `${where} domains[${j}]`;
      return { name: str(d as Obj, 'name', dw), weight: num(d as Obj, 'weight', dw) };
    });
    const targetDate = str(e, 'targetDate', where, true) || undefined;
    if (targetDate && Number.isNaN(Date.parse(targetDate))) {
      throw new ContentError(`${where}: field "targetDate" must be a date (YYYY-MM-DD)`);
    }
    return {
      id: examId,
      short: str(e, 'short', where),
      name: str(e, 'name', where),
      passPercent: num(e, 'passPercent', where),
      durationMinutes: num(e, 'durationMinutes', where),
      kubernetesVersion: str(e, 'kubernetesVersion', where),
      targetDate,
      domains,
    };
  });
}

function loadQuestion(labDir: string, qid: string, exam: Exam): Question {
  const dir = path.join(labDir, qid);
  const file = path.join(dir, 'question.yaml');
  const q = readYaml(file);
  const declared = id(q, 'id', file);
  if (declared !== qid) throw new ContentError(`${file}: id "${declared}" does not match folder "${qid}"`);

  const domain = str(q, 'domain', file);
  if (!exam.domains.some((d) => d.name === domain)) {
    throw new ContentError(`${file}: unknown domain "${domain}" for exam ${exam.short}`);
  }
  const difficulty = str(q, 'difficulty', file) as Difficulty;
  if (!DIFFICULTIES.includes(difficulty)) {
    throw new ContentError(`${file}: field "difficulty" must be one of ${DIFFICULTIES.join(', ')}`);
  }

  if (!Array.isArray(q.checks) || q.checks.length === 0) {
    throw new ContentError(`${file}: missing required field "checks"`);
  }
  const checkIds = new Set<string>();
  const checks: Check[] = q.checks.map((raw: unknown, i: number) => {
    const where = `${file} checks[${i}]`;
    const c = raw as Obj;
    const checkId = id(c, 'id', where);
    if (checkIds.has(checkId)) throw new ContentError(`${where}: duplicate check id "${checkId}"`);
    checkIds.add(checkId);
    const points = num(c, 'points', where);
    if (!Number.isInteger(points)) throw new ContentError(`${where}: field "points" must be a whole number`);
    return { id: checkId, description: str(c, 'description', where), points, run: str(c, 'run', where) };
  });

  for (const required of ['setup.sh', 'solution.sh', 'solution.md']) {
    if (!existsSync(path.join(dir, required))) {
      throw new ContentError(`${dir}: missing required file "${required}"`);
    }
  }

  return {
    id: qid,
    dir,
    title: str(q, 'title', file),
    domain,
    difficulty,
    context: str(q, 'context', file, true),
    tasks: str(q, 'tasks', file),
    checks,
    points: checks.reduce((sum, c) => sum + c.points, 0),
    hasCleanup: existsSync(path.join(dir, 'cleanup.sh')),
  };
}

function loadLab(examDir: string, labFolder: string, exam: Exam): Lab {
  const dir = path.join(examDir, labFolder);
  const file = path.join(dir, 'lab.yaml');
  const l = readYaml(file);
  const labId = id(l, 'id', file);
  if (labId !== labFolder) throw new ContentError(`${file}: id "${labId}" does not match folder "${labFolder}"`);
  if (!Array.isArray(l.questions) || l.questions.length === 0) {
    throw new ContentError(`${file}: missing required field "questions"`);
  }
  const seen = new Set<string>();
  const questions = l.questions.map((qid: unknown) => {
    if (typeof qid !== 'string' || !ID_RE.test(qid)) throw new ContentError(`${file}: invalid question id "${String(qid)}"`);
    if (seen.has(qid)) throw new ContentError(`${file}: duplicate question "${qid}"`);
    seen.add(qid);
    return loadQuestion(dir, qid, exam);
  });
  return {
    id: labId,
    examId: exam.id,
    dir,
    title: str(l, 'title', file),
    description: str(l, 'description', file, true),
    level: str(l, 'level', file, true) || undefined,
    durationMinutes: num(l, 'durationMinutes', file),
    questions,
  };
}

/** Load and validate all exams, labs and questions. Throws ContentError naming the file and field. */
export function loadCatalog(contentDir: string): Catalog {
  const exams = loadExams(contentDir);
  const labs: Lab[] = [];
  for (const exam of exams) {
    const examDir = path.join(contentDir, 'labs', exam.id);
    if (!existsSync(examDir)) continue;
    const folders = readdirSync(examDir)
      .filter((f) => statSync(path.join(examDir, f)).isDirectory())
      .sort();
    for (const folder of folders) labs.push(loadLab(examDir, folder, exam));
  }
  return { exams, labs };
}

export function findLab(catalog: Catalog, examId: string, labId: string): Lab | undefined {
  return catalog.labs.find((l) => l.examId === examId && l.id === labId);
}

export interface RenderVars {
  nodes: Record<string, string>;
  qdir: string;
}

/** Replace {{nodes.<key>}} and {{qdir}} placeholders. Unknown node keys stay visible so authors notice. */
export function renderText(text: string, vars: RenderVars): string {
  return text.replace(/\{\{\s*(nodes\.([A-Za-z0-9]+)|qdir)\s*\}\}/g, (match, _whole: string, nodeKey?: string) => {
    if (nodeKey === undefined) return vars.qdir;
    return vars.nodes[nodeKey] ?? match;
  });
}

/** Node keys referenced by a piece of content, used to warn when a target lacks one. */
export function nodeKeysIn(text: string): string[] {
  return [...text.matchAll(/\{\{\s*nodes\.([A-Za-z0-9]+)\s*\}\}/g)].map((m) => m[1] as string);
}

/** Answer-file folder for a question: /tmp/course/<position in lab>. */
export function qdirFor(courseDir: string, lab: Lab, questionId: string): string {
  const index = lab.questions.findIndex((q) => q.id === questionId);
  return path.join(courseDir, String(index + 1));
}
