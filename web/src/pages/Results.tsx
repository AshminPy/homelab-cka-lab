import { useEffect, useState } from 'react';
import type { Attempt, LabDetail } from '../../../server/shared.ts';
import { api, errorMessage } from '../api.ts';
import { DomainBars } from '../components/DomainBars.tsx';
import { Markdown } from '../components/Markdown.tsx';
import { duration, pct, when } from '../format.ts';
import { CheckResults, resultClass } from './LabView.tsx';

export function Results({ id, onError }: { id: string; onError: (msg: string) => void }) {
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [lab, setLab] = useState<LabDetail | null>(null);
  const [solutions, setSolutions] = useState<Record<string, string>>({});

  useEffect(() => {
    api
      .attempt(id)
      .then(async (a) => {
        setAttempt(a);
        setLab(await api.lab(a.examId, a.labId));
      })
      .catch((err) => onError(errorMessage(err)));
  }, [id, onError]);

  if (!attempt || !lab) return <div className="page-loading">Loading results…</div>;
  const s = attempt.summary;
  if (!s || !attempt.finishedAt) {
    return (
      <main className="page narrow">
        <p>This attempt is still in progress.</p>
        <a className="btn" href="#/attempt">
          Resume
        </a>
      </main>
    );
  }
  const used = Math.round((Date.parse(attempt.finishedAt) - Date.parse(attempt.startedAt)) / 1000);

  const loadSolution = async (qid: string) => {
    try {
      const sol = await api.solution(attempt.id, qid);
      setSolutions((prev) => ({ ...prev, [qid]: sol.markdown }));
    } catch (err) {
      onError(errorMessage(err));
    }
  };

  return (
    <main className="page narrow">
      <div className="eyebrow">
        {lab.examShort} · {attempt.mode === 'exam' ? 'Exam' : 'Practice'} mode · {when(attempt.finishedAt)}
      </div>
      <h1 style={{ font: '400 34px/1.15 var(--serif)', margin: '6px 0 24px' }}>{lab.title}: results</h1>

      <section className="card score-hero">
        <div className="big">{pct(s.percent)}</div>
        <div>
          <span className={`badge ${s.passed ? 'ok' : 'bad'}`} style={{ fontSize: 14, padding: '4px 12px' }}>
            {s.passed ? 'PASS' : 'NOT YET'}
          </span>
          <div className="muted" style={{ marginTop: 8 }}>
            {s.score} / {s.maxScore} points · pass mark {s.passPercent}% · time used {duration(used)} of {attempt.durationMinutes} min
          </div>
        </div>
        <span className="spacer" />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a className="btn secondary" href="#/progress">
            Progress
          </a>
          <a className="btn" href="#/">
            Back to labs
          </a>
        </div>
      </section>

      <section className="section">
        <h2>By domain</h2>
        <DomainBars passPercent={s.passPercent} items={s.domains.map((d) => ({ label: d.domain, percent: d.percent, detail: `${d.score}/${d.maxScore} pts` }))} />
      </section>

      <section className="section">
        <h2>Questions</h2>
        {lab.questions.map((q) => {
          const r = attempt.questions[q.id]?.result;
          return (
            <details className="qresult" key={q.id}>
              <summary>
                <span className="lab-num" style={{ fontSize: 18 }}>
                  {String(q.number).padStart(2, '0')}
                </span>
                <span>
                  <strong>{q.title}</strong>
                  <span className="muted"> · {q.domain}</span>
                </span>
                <span className={`badge ${resultClass(r) === 'pass' ? 'ok' : resultClass(r) === 'partial' ? 'warn' : 'bad'}`}>
                  {r ? `${r.score} / ${r.maxScore}` : `0 / ${q.points}`}
                </span>
              </summary>
              <div className="inner">
                {r && <CheckResults result={r} />}
                <div style={{ padding: '12px 10px 0' }}>
                  {solutions[q.id] ? (
                    <div className="solution-box">
                      <Markdown text={solutions[q.id] as string} />
                    </div>
                  ) : (
                    <button type="button" className="btn secondary small" onClick={() => void loadSolution(q.id)}>
                      Show solution
                    </button>
                  )}
                </div>
              </div>
            </details>
          );
        })}
      </section>
    </main>
  );
}
