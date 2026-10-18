import { useEffect, useState } from 'react';
import type { ProgressResponse } from '../../../server/shared.ts';
import { api, errorMessage } from '../api.ts';
import { DomainBars } from '../components/DomainBars.tsx';
import { duration, pct, when } from '../format.ts';

export function Progress({ onError }: { onError: (msg: string) => void }) {
  const [data, setData] = useState<ProgressResponse | null>(null);
  const [examId, setExamId] = useState('cka');

  useEffect(() => {
    api
      .progress()
      .then(setData)
      .catch((err) => onError(errorMessage(err)));
  }, [onError]);

  if (!data) return <div className="page-loading">Loading progress…</div>;
  const exam = data.exams.find((e) => e.examId === examId) ?? data.exams[0];
  if (!exam) return <div className="page-loading">No exams configured.</div>;
  const history = data.history.filter((h) => h.examId === exam.examId);

  return (
    <main className="page">
      <section className="hero">
        <div className="eyebrow">Your progress</div>
        <h1>How you're tracking.</h1>
        <p>Scores from finished attempts. Domains below the pass mark are where your next practice hour goes.</p>
      </section>

      <div className="tabs" role="tablist" aria-label="Exam">
        {data.exams.map((e) => (
          <button key={e.examId} type="button" role="tab" className="tab" aria-selected={e.examId === exam.examId} onClick={() => setExamId(e.examId)}>
            {e.short}
          </button>
        ))}
      </div>

      <div className="home-grid">
        <div>
          <section>
            <h2 style={{ fontSize: 15, margin: '0 0 12px' }}>Accuracy by domain</h2>
            {exam.attempts === 0 ? (
              <p className="empty" style={{ paddingTop: 0 }}>
                No finished {exam.short} attempts yet, so there's no data. Finish a lab to see your domain scores here.
              </p>
            ) : (
              <DomainBars
                passPercent={exam.passPercent}
                items={exam.domains.map((d) => ({ label: d.domain, percent: d.percent, detail: `weight ${d.weight}%` }))}
              />
            )}
          </section>

          <section className="section">
            <h2>Labs</h2>
            <div className="table-wrap">
              <table className="history">
                <thead>
                  <tr>
                    <th>Lab</th>
                    <th>Attempts</th>
                    <th>Best</th>
                    <th>Last</th>
                  </tr>
                </thead>
                <tbody>
                  {exam.labs.length === 0 && (
                    <tr>
                      <td colSpan={4} className="muted">
                        No labs yet.
                      </td>
                    </tr>
                  )}
                  {exam.labs.map((l) => (
                    <tr key={l.labId}>
                      <td>{l.title}</td>
                      <td>{l.attempts}</td>
                      <td>{pct(l.bestPercent)}</td>
                      <td>{pct(l.lastPercent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="section">
            <h2>History</h2>
            {history.length === 0 ? (
              <p className="muted">Nothing yet.</p>
            ) : (
              <div className="table-wrap">
                <table className="history">
                  <thead>
                    <tr>
                      <th>Finished</th>
                      <th>Lab</th>
                      <th>Mode</th>
                      <th>Score</th>
                      <th>Time</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h.id}>
                        <td>{when(h.finishedAt)}</td>
                        <td>{h.labTitle}</td>
                        <td>{h.mode === 'exam' ? 'Exam' : 'Practice'}</td>
                        <td>
                          <span className={`badge ${h.passed ? 'ok' : 'bad'}`}>{pct(h.percent)}</span>
                        </td>
                        <td>{duration(h.durationSec)}</td>
                        <td>
                          <a href={`#/results/${encodeURIComponent(h.id)}`}>Details</a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <aside className="side card">
          <h3>{exam.short} target</h3>
          <div className="big-number">{exam.daysToTarget ?? '–'}</div>
          <div className="muted" style={{ marginBottom: 16 }}>
            days left{exam.targetDate ? ` (${exam.targetDate})` : ''}
          </div>
          <div className="stat">
            <span className="muted">Finished attempts</span>
            <strong>{exam.attempts}</strong>
          </div>
          <div className="stat">
            <span className="muted">Pass mark</span>
            <strong>{exam.passPercent}%</strong>
          </div>
          <h3 style={{ marginTop: 20 }}>Focus next</h3>
          {exam.weakest.length ? (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {exam.weakest.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              {exam.attempts ? 'No domain is below 80%. Try a harder lab or Exam mode.' : 'Finish a lab first.'}
            </p>
          )}
        </aside>
      </div>
    </main>
  );
}
