import { pct } from '../format.ts';

export interface BarItem {
  label: string;
  percent: number | null;
  detail?: string;
}

/** Horizontal bars with a tick at the pass mark; bars below it use the warning colour. */
export function DomainBars({ items, passPercent }: { items: BarItem[]; passPercent: number }) {
  return (
    <div className="bars">
      {items.map((it) => (
        <div className="bar-row" key={it.label}>
          <span>
            {it.label}
            {it.detail && <span className="muted"> · {it.detail}</span>}
          </span>
          <div
            className="bar-track"
            role="meter"
            aria-label={it.label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={it.percent ?? undefined}
            aria-valuetext={it.percent === null ? 'no data' : pct(it.percent)}
          >
            {it.percent !== null && (
              <div className={`bar-fill${it.percent < passPercent ? ' below' : ''}`} style={{ width: `${Math.max(2, it.percent)}%` }} />
            )}
            <div className="bar-mark" style={{ left: `${passPercent}%` }} title={`Pass mark ${passPercent}%`} />
          </div>
          <span className="bar-value">{it.percent === null ? <span className="muted">no data</span> : pct(it.percent)}</span>
        </div>
      ))}
    </div>
  );
}
