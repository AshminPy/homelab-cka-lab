import { useEffect, useState } from 'react';
import type { Attempt, ExamSummary, LabSummary, Mode, TargetStatus } from '../../../server/shared.ts';
import { api, errorMessage } from '../api.ts';
import { clock, pct } from '../format.ts';

interface Props {
  catalog: ExamSummary[] | null;
  target: TargetStatus | null;
  active: Attempt | null;
  onStarted: (a: Attempt) => void;
  onRefreshTarget: () => void;
  onError: (msg: string) => void;
}

const TAB_KEY = 'kubelab.exam';

function readTab(): string {
  try {
    return localStorage.getItem(TAB_KEY) ?? 'cka';
  } catch {
    return 'cka';
  }
}

export function Home({ catalog, target, active, onStarted, onRefreshTarget, onError }: Props) {
  const [examId, setExamId] = useState(readTab);
  const [starting, setStarting] = useState<LabSummary | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    try {
      localStorage.setItem(TAB_KEY, examId);
    } catch {
      // private mode
    }
  }, [examId]);

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);

  if (!catalog) return <div className="page-loading">Loading labs…</div>;
  const exam = catalog.find((e) => e.id === examId) ?? catalog[0];
  if (!exam) return <div className="page-loading">No exams configured.</div>;

  const remaining = active ? Date.parse(active.startedAt) + active.durationMinutes * 60_000 - now : 0;

  return (
    <main className="page">
      <section className="hero">
        <div className="eyebrow">Practice workspace</div>
        <h1>Choose your lab.</h1>
        <p>Timed, auto-graded tasks on your own cluster. Practice mode lets you check as you go; Exam mode scores everything at the end, like the real thing.</p>
      </section>

      {target && !target.ok && (
        <div className="notice bad" role="status">
          <div className="grow">
            <strong>Practice cluster “{target.context}” is not available.</strong>
            <div className="muted">{target.error}</div>
            {target.hint && (
              <pre>
                <code>{target.hint}</code>
              </pre>
            )}
          </div>
          <button type="button" className="btn secondary" onClick={onRefreshTarget}>
            Check again
          </button>
        </div>
      )}

      {active && (
        <div className="notice info" role="status">
          <div className="grow">
            <strong>In progress:</strong> {active.labTitle} · {active.mode === 'exam' ? 'Exam' : 'Practice'} mode ·{' '}
            {remaining > 0 ? `${clock(remaining)} left` : 'time is up'}
          </div>
          <a className="btn" href="#/attempt">
            Resume →
          </a>
        </div>
      )}

      <div className="tabs" role="tablist" aria-label="Exam">
        {catalog.map((e) => (
          <button key={e.id} type="button" role="tab" className="tab" aria-selected={e.id === exam.id} onClick={() => setExamId(e.id)}>
            {e.short}
          </button>
        ))}
      </div>

      <div className="home-grid">
        <section>
          <div className="exam-head">
            <h2>{exam.name}</h2>
            <div className="exam-facts">
              <span>
                Pass mark <strong>{exam.passPercent}%</strong>
              </span>
              <span>
                Exam <strong>{exam.durationMinutes} min</strong>
              </span>
              <span>
                Kubernetes <strong>{exam.kubernetesVersion}</strong>
              </span>
            </div>
          </div>

          {exam.labs.length === 0 ? (
            <p className="empty">No {exam.short} labs yet. They follow the CKA labs in the study plan.</p>
          ) : (
            exam.labs.map((lab, i) => {
              const blocked = Boolean(active) && !lab.inProgress;
              return (
                <article className="lab-row" key={lab.id}>
                  <div className="lab-num">{String(i + 1).padStart(2, '0')}</div>
                  <div>
                    <h3>{lab.title}</h3>
                    <p>{lab.description}</p>
                    <div className="lab-meta">
                      {lab.level && <span className="badge accent">{lab.level}</span>}
                      <span>
                        {lab.questionCount} questions · {lab.durationMinutes} min · {lab.totalPoints} pts
                      </span>
                      {lab.attempts > 0 ? (
                        <span>
                          Best{' '}
                          <span className={`badge ${(lab.bestPercent ?? 0) >= exam.passPercent ? 'ok' : 'warn'}`}>{pct(lab.bestPercent)}</span> · last{' '}
                          {pct(lab.lastPercent)} · {lab.attempts} attempt{lab.attempts === 1 ? '' : 's'}
                        </span>
                      ) : (
                        <span>Not attempted yet</span>
                      )}
                    </div>
                  </div>
                  <div>
                    {lab.inProgress ? (
                      <a className="btn" href="#/attempt">
                        Resume lab →
                      </a>
                    ) : (
                      <button
                        type="button"
                        className="btn"
                        disabled={blocked || !target?.ok}
                        title={blocked ? 'Finish or abandon the lab in progress first' : !target?.ok ? 'The practice cluster is not available' : undefined}
                        onClick={() => setStarting(lab)}
                      >
                        Start lab →
                      </button>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </section>

        <aside className="side card">
          <h3>Countdown</h3>
          <div className="big-number">{exam.daysToTarget ?? '–'}</div>
          <div className="muted" style={{ marginBottom: 16 }}>
            days to the {exam.short} target{exam.targetDate ? ` (${exam.targetDate})` : ''}
          </div>
          <div className="stat">
            <span className="muted">Labs available</span>
            <strong>{exam.labs.length}</strong>
          </div>
          <div className="stat">
            <span className="muted">Attempts</span>
            <strong>{exam.labs.reduce((s, l) => s + l.attempts, 0)}</strong>
          </div>
          <a href="#/progress" className="btn secondary small" style={{ marginTop: 12 }}>
            View progress
          </a>
        </aside>
      </div>

      {starting && (
        <StartDialog
          exam={exam}
          lab={starting}
          target={target}
          onCancel={() => setStarting(null)}
          onStart={async (mode) => {
            try {
              const attempt = await api.start(exam.id, starting.id, mode);
              setStarting(null);
              onStarted(attempt);
            } catch (err) {
              onError(errorMessage(err));
              throw err;
            }
          }}
        />
      )}
    </main>
  );
}

function StartDialog({
  exam,
  lab,
  target,
  onCancel,
  onStart,
}: {
  exam: ExamSummary;
  lab: LabSummary;
  target: TargetStatus | null;
  onCancel: () => void;
  onStart: (mode: Mode) => Promise<void>;
}) {
  const [mode, setMode] = useState<Mode>('practice');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  return (
    <div className="modal-backdrop" role="presentation" onClick={() => !busy && onCancel()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="start-title" onClick={(e) => e.stopPropagation()}>
        <div className="eyebrow">{exam.short}</div>
        <h2 id="start-title">{lab.title}</h2>
        <p className="muted" style={{ margin: 0 }}>
          {lab.questionCount} questions · {lab.durationMinutes} minutes · pass mark {exam.passPercent}%
        </p>
        <div className="mode-options">
          <button type="button" className="mode-option" aria-pressed={mode === 'practice'} onClick={() => setMode('practice')}>
            <strong>Practice</strong>
            <span>Check any question as you go. Its solution unlocks after you check it. Best while learning.</span>
          </button>
          <button type="button" className="mode-option" aria-pressed={mode === 'exam'} onClick={() => setMode('exam')}>
            <strong>Exam</strong>
            <span>No checks until you finish. Then a full score report with every solution. Like the real exam.</span>
          </button>
        </div>
        <p className="muted" style={{ fontSize: 13 }}>
          Setup prepares each question's namespace on <code>{target?.context ?? 'the practice cluster'}</code>. The first run pulls images and can take a
          minute.
        </p>
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onStart(mode);
              } catch {
                setBusy(false);
              }
            }}
          >
            {busy ? (
              <>
                <span className="spinner" /> Preparing environment…
              </>
            ) : (
              `Start in ${mode === 'exam' ? 'Exam' : 'Practice'} mode`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
