import { useCallback, useEffect, useState } from 'react';
import type { Attempt, ExamSummary, TargetStatus } from '../../server/shared.ts';
import { api, errorMessage } from './api.ts';
import { TopBar } from './components/TopBar.tsx';
import { Home } from './pages/Home.tsx';
import { LabView } from './pages/LabView.tsx';
import { Progress } from './pages/Progress.tsx';
import { Results } from './pages/Results.tsx';

export type Route = { name: 'home' } | { name: 'attempt' } | { name: 'results'; id: string } | { name: 'progress' };

function parseHash(): Route {
  const h = window.location.hash.replace(/^#\/?/, '');
  if (h === 'attempt') return { name: 'attempt' };
  if (h === 'progress') return { name: 'progress' };
  if (h.startsWith('results/')) return { name: 'results', id: decodeURIComponent(h.slice('results/'.length)) };
  return { name: 'home' };
}

export function navigate(path: string): void {
  window.location.hash = `#/${path}`;
}

export function App() {
  const [route, setRoute] = useState<Route>(parseHash);
  const [token, setToken] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<ExamSummary[] | null>(null);
  const [target, setTarget] = useState<TargetStatus | null>(null);
  const [active, setActive] = useState<Attempt | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [c, a] = await Promise.all([api.catalog(), api.active()]);
      setCatalog(c);
      setActive(a.attempt);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoaded(true);
    }
  }, []);

  const refreshTarget = useCallback(async (force = false) => {
    try {
      setTarget(await api.target(force));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    api
      .session()
      .then((s) => setToken(s.token))
      .catch((err) => setError(errorMessage(err)));
    void refreshTarget();
  }, [refreshTarget]);

  // Always reload on mount and on every route change, including a browser refresh on #/attempt.
  useEffect(() => {
    void refresh();
  }, [route, refresh]);

  let page;
  if (route.name === 'attempt') {
    if (active && token) {
      page = (
        <LabView
          key={active.id}
          attempt={active}
          token={token}
          target={target}
          onChange={setActive}
          onFinished={(a) => {
            setActive(null);
            navigate(`results/${a.id}`);
          }}
          onAbandoned={() => {
            setActive(null);
            navigate('');
          }}
          onError={setError}
        />
      );
    } else if (!loaded || !token) {
      page = <div className="page-loading">Loading…</div>;
    } else {
      page = (
        <main className="page narrow">
          <p className="muted">No lab is in progress.</p>
          <a className="btn" href="#/">
            Choose a lab
          </a>
        </main>
      );
    }
  } else if (route.name === 'results') {
    page = <Results id={route.id} onError={setError} />;
  } else if (route.name === 'progress') {
    page = <Progress onError={setError} />;
  } else {
    page = (
      <Home
        catalog={catalog}
        target={target}
        active={active}
        onStarted={(a) => {
          setActive(a);
          navigate('attempt');
        }}
        onRefreshTarget={() => refreshTarget(true)}
        onError={setError}
      />
    );
  }

  return (
    <div className="app">
      {route.name !== 'attempt' && <TopBar route={route.name} target={target} />}
      {error && (
        <div className="toast" role="alert">
          <span>{error}</span>
          <button type="button" className="btn ghost small" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}
      {page}
    </div>
  );
}
