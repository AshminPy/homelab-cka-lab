import { mkdirSync } from 'node:fs';
import type { Server } from 'node:http';
import { spawn } from 'node-pty';
import { WebSocketServer, type WebSocket } from 'ws';
import { upgradeAllowed, type Security } from './security.ts';

export interface TerminalOptions {
  security: Security;
  /** Environment for the shell, or null when the practice cluster isn't available. */
  env: () => Record<string, string> | null;
  rcfile: string;
  cwd: string;
  maxSessions?: number;
  log?: (msg: string) => void;
}

type ClientMessage = { type: 'input'; data: string } | { type: 'resize'; cols: number; rows: number };

function parse(raw: unknown): ClientMessage | null {
  try {
    const msg = JSON.parse(String(raw)) as Record<string, unknown>;
    if (msg.type === 'input' && typeof msg.data === 'string') return { type: 'input', data: msg.data };
    const { cols, rows } = msg;
    if (msg.type === 'resize' && Number.isInteger(cols) && Number.isInteger(rows)) {
      const c = cols as number;
      const r = rows as number;
      if (c > 0 && c < 1000 && r > 0 && r < 500) return { type: 'resize', cols: c, rows: r };
    }
  } catch {
    // ignore malformed frames
  }
  return null;
}

/** One bash PTY per WebSocket at /ws/terminal; the shell dies with the socket. */
export function attachTerminal(server: Server, opts: TerminalOptions): void {
  const log = opts.log ?? ((m: string) => console.log(m));
  const max = opts.maxSessions ?? 4;
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
  let open = 0;

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== '/ws/terminal' || !upgradeAllowed(opts.security, req) || open >= max) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws));
  });

  function onConnection(ws: WebSocket): void {
    // An oversized or malformed frame makes ws emit 'error'; unhandled, it would kill the whole server.
    ws.on('error', (err) => log(`terminal socket error: ${err.message}`));
    const env = opts.env();
    if (!env) {
      ws.send('\r\n\x1b[31mThe practice cluster is not available. Check the status on the Labs page.\x1b[0m\r\n');
      ws.close(1011, 'target unavailable');
      return;
    }
    let term: ReturnType<typeof spawn>;
    try {
      mkdirSync(opts.cwd, { recursive: true });
      term = spawn('/bin/bash', ['--rcfile', opts.rcfile, '-i'], {
        name: 'xterm-256color',
        cols: 100,
        rows: 30,
        cwd: opts.cwd,
        env: { ...env, TERM: 'xterm-256color', BASH_SILENCE_DEPRECATION_WARNING: '1' },
      });
    } catch (err) {
      log(`terminal failed to start: ${(err as Error).message}`);
      ws.send(`\r\n\x1b[31mCould not start a shell: ${(err as Error).message}\x1b[0m\r\n`);
      ws.close(1011, 'spawn failed');
      return;
    }
    open += 1;
    log(`terminal opened (pid ${term.pid}, ${open} open)`);

    term.onData((data) => {
      if (ws.readyState === ws.OPEN) ws.send(data);
    });
    term.onExit(() => {
      if (ws.readyState === ws.OPEN) ws.close(1000, 'shell exited');
    });
    ws.on('message', (raw) => {
      const msg = parse(raw);
      if (!msg) return;
      if (msg.type === 'input') term.write(msg.data);
      else term.resize(msg.cols, msg.rows);
    });
    ws.on('close', () => {
      open -= 1;
      try {
        term.kill();
      } catch {
        // already gone
      }
      log(`terminal closed (${open} open)`);
    });
  }
}
