import { useCallback, useEffect, useRef, useState } from 'react';
import type { Attempt, LabDetail, PublicQuestion, QuestionResult, QuestionState, TargetStatus } from '../../../server/shared.ts';
import { api, errorMessage } from '../api.ts';
import { LabTerminal } from '../components/LabTerminal.tsx';
import { Markdown } from '../components/Markdown.tsx';
import { clock, capitalize } from '../format.ts';

interface Props {
  attempt: Attempt;
  token: string;
  target: TargetStatus | null;
  onChange: (a: Attempt) => void;
  onFinished: (a: Attempt) => void;
  onAbandoned: () => void;
  onError: (msg: string) => void;
}

function store<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // private mode
  }
}

export function resultClass(r: QuestionResult | undefined): string {
  if (!r) return '';
  if (r.score === r.maxScore) return 'pass';
  return r.score > 0 ? 'partial' : 'fail';
}

export function LabView({ attempt, token, target, onChange, onFinished, onAbandoned, onError }: Props) {
  const [lab, setLab] = useState<LabDetail | null>(null);
  const [index, setIndex] = useState(() => store<number>(`kubelab.q.${attempt.id}`, 0));
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [solutions, setSolutions] = useState<Record<string, string>>({});
  const [now, setNow] = useState(Date.now());
  const [termWidth, setTermWidth] = useState(() => store<number>('kubelab.termWidth', 46));
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .lab(attempt.examId, attempt.labId)
      .then(setLab)
      .catch((err) => onError(errorMessage(err)));
  }, [attempt.examId, attempt.labId, onError]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => save(`kubelab.q.${attempt.id}`, index), [attempt.id, index]);

  const updateState = useCallback(
    (qid: string, state: QuestionState) => onChange({ ...attempt, questions: { ...attempt.questions, [qid]: state } }),
    [attempt, onChange],
  );

  if (!lab) return <div className="page-loading">Loading lab…</div>;

  const questions = lab.questions;
  const q: PublicQuestion = questions[Math.min(index, questions.length - 1)] as PublicQuestion;
  const state = attempt.questions[q.id] ?? { flagged: false, done: false };
  const remaining = Date.parse(attempt.startedAt) + attempt.durationMinutes * 60_000 - now;
  const doneCount = Object.values(attempt.questions).filter((s) => s.done).length;
  const flaggedCount = Object.values(attempt.questions).filter((s) => s.flagged).length;
  const practice = attempt.mode === 'practice';

  async function run<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(label);
    try {
      return await fn();
    } catch (err) {
      onError(errorMessage(err));
      return undefined;
    } finally {
      setBusy(null);
    }
  }

  const mark = (patch: { flagged?: boolean; done?: boolean }) =>
    run('mark', async () => updateState(q.id, await api.mark(attempt.id, q.id, patch)));

  const check = () =>
    run('check', async () => {
      const result = await api.check(attempt.id, q.id);
      updateState(q.id, { ...state, result });
    });

  const reset = () => {
    if (!window.confirm(`Reset question ${q.number}? Its namespace and answer files are deleted and set up again.`)) return;
    void run('reset', async () => {
      updateState(q.id, await api.reset(attempt.id, q.id));
      setSolutions((s) => {
        const next = { ...s };
        delete next[q.id];
        return next;
      });
    });
  };

  const showSolution = () =>
    run('solution', async () => {
      const s = await api.solution(attempt.id, q.id);
      setSolutions((prev) => ({ ...prev, [q.id]: s.markdown }));
    });

  const finish = () => {
    const unanswered = questions.length - doneCount;
    const msg = `Finish and score this lab?${unanswered > 0 ? ` ${unanswered} question(s) are not marked done.` : ''} You can't change answers afterwards.`;
    if (!window.confirm(msg)) return;
    void run('finish', async () => onFinished(await api.finish(attempt.id)));
  };

  const abandon = () => {
    if (!window.confirm('Abandon this attempt? It will not be scored or saved to your history.')) return;
    void run('abandon', async () => {
      await api.abandon(attempt.id);
      onAbandoned();
    });
  };

  const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const body = bodyRef.current;
    if (!body) return;
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    handle.classList.add('dragging');
    const rect = body.getBoundingClientRect();
    const move = (ev: PointerEvent) => {
      const w = ((rect.right - ev.clientX) / rect.width) * 100;
      setTermWidth(Math.min(70, Math.max(25, Math.round(w))));
    };
    const up = () => {
      handle.classList.remove('dragging');
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      setTermWidth((w) => {
        save('kubelab.termWidth', w);
        return w;
      });
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  };

  const visible = questions.filter((x) => !flaggedOnly || attempt.questions[x.id]?.flagged);
  const timerClass = remaining <= 0 ? 'over' : remaining < 10 * 60_000 ? 'warn' : '';

  return (
    <div className="lab">
      <header className="lab-top">
        <a className="btn ghost small" href="#/">
          ← Labs
        </a>
        <span className="lab-title">
          {lab.examShort} / {lab.title}
        </span>
        <span className={`badge ${practice ? 'accent' : 'warn'}`}>{practice ? 'Practice' : 'Exam'} mode</span>
        <span className="spacer" />
        <span className={`timer ${timerClass}`} role="timer" aria-live="off" title="Time remaining">
          ◷ {remaining > 0 ? clock(remaining) : `Time's up +${clock(remaining)}`}
        </span>
        <span className="spacer" />
        <span className="muted">
          {doneCount} / {questions.length} done
        </span>
        <button type="button" className="btn danger small" onClick={abandon} disabled={busy !== null}>
          Abandon
        </button>
        <button type="button" className="btn small" onClick={finish} disabled={busy !== null}>
          {busy === 'finish' ? (
            <>
              <span className="spinner" /> Scoring…
            </>
          ) : (
            'Finish & score'
          )}
        </button>
      </header>

      <div className="lab-body" ref={bodyRef} style={{ ['--term-w' as string]: `${termWidth}%` }}>
        <nav className="qnav" aria-label="Questions">
          <div className="qnav-head">
            <span>Questions</span>
            <span className="muted">{questions.length}</span>
          </div>
          <label className="check-row">
            <input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} />
            Flagged only ({flaggedCount})
          </label>
          <div className="qgrid">
            {visible.map((x) => {
              const s = attempt.questions[x.id];
              const cls = ['qcell', x.id === q.id ? 'current' : '', resultClass(s?.result) || (s?.done ? 'done' : ''), s?.flagged ? 'flagged' : '']
                .filter(Boolean)
                .join(' ');
              return (
                <button
                  key={x.id}
                  type="button"
                  className={cls}
                  aria-current={x.id === q.id ? 'step' : undefined}
                  aria-label={`Question ${x.number}${s?.done ? ', done' : ''}${s?.flagged ? ', flagged' : ''}`}
                  onClick={() => setIndex(questions.indexOf(x))}
                >
                  {String(x.number).padStart(2, '0')}
                </button>
              );
            })}
          </div>
          <div className="legend">
            <span>
              <i className="swatch" style={{ background: 'var(--accent-soft)' }} /> Done
            </span>
            <span>
              <i className="swatch" style={{ background: 'var(--flag)', borderRadius: '50%' }} /> Flagged
            </span>
            {practice && (
              <>
                <span>
                  <i className="swatch" style={{ background: 'var(--ok-soft)' }} /> Checked: all pass
                </span>
                <span>
                  <i className="swatch" style={{ background: 'var(--warn-soft)' }} /> Checked: partial
                </span>
              </>
            )}
          </div>
        </nav>

        <main className="qpanel">
          <div className="qmeta">
            <span className="eyebrow">
              Question {q.number} of {questions.length}
            </span>
            <button type="button" className="btn ghost small" onClick={() => mark({ flagged: !state.flagged })} disabled={busy !== null}>
              {state.flagged ? '⚑ Flagged' : '⚐ Flag for review'}
            </button>
          </div>
          <h1>{q.title}</h1>
          <div className="qtags">
            <span className="badge">{q.domain}</span>
            <span className="badge">{capitalize(q.difficulty)}</span>
            <span className="badge accent">{q.points} pts</span>
          </div>

          {state.setupError && (
            <div className="setup-error" role="alert">
              <strong>Setup for this question failed.</strong> Reset it to try again.
              <pre>{state.setupError}</pre>
            </div>
          )}

          <div className="qbody">
            {q.context && <Markdown text={q.context} />}
            <h3>Tasks</h3>
            <Markdown text={q.tasks} />
          </div>

          <div className="qactions">
            {practice && (
              <button type="button" className="btn" onClick={() => void check()} disabled={busy !== null}>
                {busy === 'check' ? (
                  <>
                    <span className="spinner" /> Checking…
                  </>
                ) : (
                  'Check'
                )}
              </button>
            )}
            <button type="button" className="btn secondary" onClick={reset} disabled={busy !== null}>
              {busy === 'reset' ? 'Resetting…' : 'Reset question'}
            </button>
            {practice && state.result && !solutions[q.id] && (
              <button type="button" className="btn secondary" onClick={() => void showSolution()} disabled={busy !== null}>
                Show solution
              </button>
            )}
            <label className="check-row" style={{ marginLeft: 8 }}>
              <input type="checkbox" checked={state.done} onChange={(e) => void mark({ done: e.target.checked })} disabled={busy !== null} />
              Mark as done
            </label>
            <span className="spacer" />
            <button type="button" className="btn ghost small" onClick={() => setIndex(Math.max(0, index - 1))} disabled={q.number === 1}>
              ← Previous
            </button>
            <button type="button" className="btn small" onClick={() => setIndex(Math.min(questions.length - 1, index + 1))} disabled={q.number === questions.length}>
              Next →
            </button>
          </div>

          {state.result && <CheckResults result={state.result} />}
          {solutions[q.id] && (
            <div className="solution-box">
              <Markdown text={solutions[q.id] as string} />
            </div>
          )}
        </main>

        <div className="splitter" role="separator" aria-orientation="vertical" aria-label="Resize terminal" onPointerDown={startDrag} />
        <LabTerminal token={token} context={target?.context} />
      </div>
    </div>
  );
}

export function CheckResults({ result }: { result: QuestionResult }) {
  return (
    <div className="result-box" aria-live="polite">
      <div className="result-head">
        <span>Check result</span>
        <span className={`badge ${resultClass(result) === 'pass' ? 'ok' : resultClass(result) === 'partial' ? 'warn' : 'bad'}`}>
          {result.score} / {result.maxScore} pts
        </span>
      </div>
      <ul className="checks">
        {result.checks.map((c) => (
          <li key={c.id} className={c.passed ? 'pass' : 'fail'}>
            <span className="mark" aria-hidden>
              {c.passed ? '✓' : '✗'}
            </span>
            <span className="sr-only">{c.passed ? 'Passed: ' : 'Failed: '}</span>
            {c.description} <span className="muted">({c.points} pt{c.points === 1 ? '' : 's'})</span>
            {!c.passed && c.output && (
              <details>
                <summary className="muted">details</summary>
                <pre>{c.output}</pre>
              </details>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
