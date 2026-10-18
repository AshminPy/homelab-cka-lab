// Types shared by the server and the web UI. No runtime code, no Node imports.

export type Mode = 'practice' | 'exam';
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface CheckResult {
  id: string;
  description: string;
  points: number;
  passed: boolean;
  output: string;
  durationMs: number;
}

export interface QuestionResult {
  questionId: string;
  domain: string;
  score: number;
  maxScore: number;
  checks: CheckResult[];
  gradedAt: string;
}

export interface QuestionState {
  flagged: boolean;
  done: boolean;
  result?: QuestionResult;
  setupError?: string;
}

export interface DomainScore {
  domain: string;
  score: number;
  maxScore: number;
  percent: number;
}

export interface AttemptSummary {
  score: number;
  maxScore: number;
  percent: number;
  passPercent: number;
  passed: boolean;
  domains: DomainScore[];
}

export interface Attempt {
  id: string;
  examId: string;
  labId: string;
  labTitle: string;
  mode: Mode;
  target: string;
  startedAt: string;
  durationMinutes: number;
  finishedAt?: string;
  questions: Record<string, QuestionState>;
  summary?: AttemptSummary;
}

export interface PublicQuestion {
  id: string;
  number: number;
  title: string;
  domain: string;
  difficulty: Difficulty;
  points: number;
  context: string;
  tasks: string;
}

export interface LabSummary {
  id: string;
  examId: string;
  title: string;
  description: string;
  level?: string;
  durationMinutes: number;
  questionCount: number;
  totalPoints: number;
  attempts: number;
  bestPercent: number | null;
  lastPercent: number | null;
  inProgress: boolean;
}

export interface ExamSummary {
  id: string;
  short: string;
  name: string;
  passPercent: number;
  durationMinutes: number;
  kubernetesVersion: string;
  targetDate?: string;
  daysToTarget: number | null;
  domains: { name: string; weight: number }[];
  labs: LabSummary[];
}

export interface LabDetail {
  id: string;
  examId: string;
  examShort: string;
  title: string;
  description: string;
  durationMinutes: number;
  passPercent: number;
  questions: PublicQuestion[];
}

export interface TargetStatus {
  id: string;
  description: string;
  context: string;
  ok: boolean;
  nodes: { name: string; ready: boolean }[];
  serverVersion?: string;
  error?: string;
  hint?: string;
  checkedAt: string;
}

export interface DomainStat {
  domain: string;
  weight: number;
  score: number;
  maxScore: number;
  percent: number | null;
}

export interface AttemptListItem {
  id: string;
  examId: string;
  labId: string;
  labTitle: string;
  mode: Mode;
  startedAt: string;
  finishedAt: string;
  durationSec: number;
  percent: number;
  passed: boolean;
}

export interface ExamStats {
  examId: string;
  short: string;
  attempts: number;
  targetDate?: string;
  daysToTarget: number | null;
  passPercent: number;
  domains: DomainStat[];
  weakest: string[];
  labs: { labId: string; title: string; attempts: number; bestPercent: number | null; lastPercent: number | null }[];
}

export interface ProgressResponse {
  exams: ExamStats[];
  history: AttemptListItem[];
}

export interface SolutionResponse {
  questionId: string;
  markdown: string;
}
