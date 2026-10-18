import { spawn } from 'node:child_process';

export interface RunResult {
  exitCode: number | null;
  timedOut: boolean;
  output: string;
  durationMs: number;
}

export interface RunOptions {
  env: Record<string, string>;
  timeoutMs: number;
  cwd?: string;
}

const MAX_OUTPUT = 8_000;

/**
 * Run a bash script with `$LAB_LIB` sourced first. `script` is trusted repo content,
 * never user input. Children run in their own process group so a timeout kills
 * everything they started (e.g. a hanging `kubectl wait`).
 */
export function runBash(script: string, args: string[], opts: RunOptions): Promise<RunResult> {
  const started = Date.now();
  const body = `set -o pipefail\nsource "$LAB_LIB"\n${script}`;
  return new Promise((resolve) => {
    let output = '';
    let timedOut = false;
    const append = (chunk: Buffer) => {
      output += chunk.toString('utf8');
      if (output.length > MAX_OUTPUT * 2) output = output.slice(-MAX_OUTPUT);
    };
    const child = spawn('/bin/bash', ['-c', body, 'lab-script', ...args], {
      env: opts.env,
      cwd: opts.cwd,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        if (child.pid) process.kill(-child.pid, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    }, opts.timeoutMs);
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ exitCode: null, timedOut, output: `failed to start bash: ${err.message}`, durationMs: Date.now() - started });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const trimmed = output.length > MAX_OUTPUT ? `…${output.slice(-MAX_OUTPUT)}` : output;
      resolve({
        exitCode: timedOut ? null : code,
        timedOut,
        output: timedOut ? `${trimmed}\n[timed out after ${opts.timeoutMs / 1000}s]` : trimmed,
        durationMs: Date.now() - started,
      });
    });
  });
}

/** Run a script file (setup.sh, solution.sh, ...) with the helper library sourced. */
export function runFile(file: string, opts: RunOptions): Promise<RunResult> {
  return runBash('source "$1"', [file], opts);
}

export function passed(r: RunResult): boolean {
  return r.exitCode === 0 && !r.timedOut;
}
