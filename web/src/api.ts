import type {
  Attempt,
  ExamSummary,
  LabDetail,
  Mode,
  ProgressResponse,
  QuestionResult,
  QuestionState,
  SolutionResponse,
  TargetStatus,
} from '../../server/shared.ts';

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? `${res.status} ${res.statusText}`);
  return data as T;
}

const seg = encodeURIComponent;

export const api = {
  session: () => request<{ token: string }>('GET', '/api/session'),
  target: (refresh = false) => request<TargetStatus>('GET', `/api/target${refresh ? '?refresh=1' : ''}`),
  catalog: () => request<ExamSummary[]>('GET', '/api/catalog'),
  lab: (examId: string, labId: string) => request<LabDetail>('GET', `/api/labs/${seg(examId)}/${seg(labId)}`),
  active: () => request<{ attempt: Attempt | null }>('GET', '/api/attempts/active'),
  start: (examId: string, labId: string, mode: Mode) => request<Attempt>('POST', '/api/attempts', { examId, labId, mode }),
  attempt: (id: string) => request<Attempt>('GET', `/api/attempts/${seg(id)}`),
  mark: (id: string, qid: string, patch: { flagged?: boolean; done?: boolean }) =>
    request<QuestionState>('PATCH', `/api/attempts/${seg(id)}/questions/${seg(qid)}`, patch),
  reset: (id: string, qid: string) => request<QuestionState>('POST', `/api/attempts/${seg(id)}/questions/${seg(qid)}/reset`, {}),
  check: (id: string, qid: string) => request<QuestionResult>('POST', `/api/attempts/${seg(id)}/questions/${seg(qid)}/check`, {}),
  solution: (id: string, qid: string) => request<SolutionResponse>('GET', `/api/attempts/${seg(id)}/questions/${seg(qid)}/solution`),
  finish: (id: string) => request<Attempt>('POST', `/api/attempts/${seg(id)}/finish`, {}),
  abandon: (id: string) => request<void>('DELETE', `/api/attempts/${seg(id)}`),
  progress: () => request<ProgressResponse>('GET', '/api/progress'),
};

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
