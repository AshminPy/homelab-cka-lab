import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { useEffect, useRef, useState } from 'react';

type State = 'connecting' | 'open' | 'closed';

/** xterm.js wired to the server's PTY over a token-protected WebSocket. */
export function LabTerminal({ token, context }: { token: string; context?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<State>('connecting');
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    setState('connecting');
    const term = new Terminal({
      fontFamily: "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, monospace",
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      scrollback: 5000,
      allowProposedApi: false,
      theme: {
        background: '#0d1210',
        foreground: '#d8e2dc',
        cursor: '#3db48c',
        selectionBackground: '#2c4a3f',
        green: '#4ccb7a',
        brightGreen: '#6fe39a',
        cyan: '#4fc3c8',
        brightCyan: '#79dde0',
        blue: '#6aa8ff',
        yellow: '#f0c060',
        red: '#f0766b',
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    try {
      fit.fit();
    } catch {
      // not laid out yet
    }

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${window.location.host}/ws/terminal?token=${encodeURIComponent(token)}`);
    const send = (msg: object) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    };
    ws.onopen = () => {
      setState('open');
      send({ type: 'resize', cols: term.cols, rows: term.rows });
      term.focus();
    };
    ws.onmessage = (e) => term.write(typeof e.data === 'string' ? e.data : '');
    ws.onclose = () => {
      setState('closed');
      term.write('\r\n\x1b[33m[disconnected - press Reconnect for a new shell]\x1b[0m\r\n');
    };
    const input = term.onData((data) => send({ type: 'input', data }));
    const observer = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        return;
      }
      send({ type: 'resize', cols: term.cols, rows: term.rows });
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
      input.dispose();
      ws.onclose = null;
      ws.close();
      term.dispose();
    };
  }, [token, generation]);

  return (
    <section className="term-pane" aria-label="Terminal">
      <div className="term-head">
        <span aria-hidden>{'>_'}</span>
        <strong>Terminal</strong>
        <span className="badge">Sandbox</span>
        {context && <span className="muted">context {context}</span>}
        <span className="spacer" />
        <span>{state === 'open' ? 'connected' : state === 'connecting' ? 'connecting…' : 'disconnected'}</span>
        <button type="button" className="btn ghost small" onClick={() => setGeneration((g) => g + 1)} title="Open a fresh shell">
          Reconnect
        </button>
      </div>
      <div className="term-body" ref={host} />
    </section>
  );
}
