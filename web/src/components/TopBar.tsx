import type { TargetStatus } from '../../../server/shared.ts';

export function Logo() {
  return (
    <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
      <path fill="currentColor" d="M16 2 28 9v14L16 30 4 23V9z" />
      <path fill="var(--surface)" d="M16 8l6 3.5v7L16 22l-6-3.5v-7z" />
    </svg>
  );
}

export function TargetChip({ target }: { target: TargetStatus | null }) {
  if (!target) {
    return (
      <span className="chip">
        <span className="dot" /> checking cluster…
      </span>
    );
  }
  return (
    <span className="chip" title={target.ok ? target.description : target.error}>
      <span className={`dot ${target.ok ? 'ok' : 'bad'}`} />
      {target.ok ? `${target.context} · ${target.serverVersion ?? ''} · ${target.nodes.length} nodes` : `${target.context} not available`}
    </span>
  );
}

export function TopBar({ route, target }: { route: string; target: TargetStatus | null }) {
  return (
    <header className="topbar">
      <a className="brand" href="#/">
        <Logo />
        Kubernetes Lab
      </a>
      <nav className="nav" aria-label="Main">
        <a href="#/" className={route === 'home' ? 'active' : ''}>
          Labs
        </a>
        <a href="#/progress" className={route === 'progress' ? 'active' : ''}>
          Progress
        </a>
      </nav>
      <span className="spacer" />
      <TargetChip target={target} />
    </header>
  );
}
