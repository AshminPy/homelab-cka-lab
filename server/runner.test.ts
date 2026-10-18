import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { passed, runBash, runFile } from './runner.ts';
import { tempDir } from './testkit.ts';

const dir = tempDir();
const lib = path.join(dir, 'lib.sh');
writeFileSync(lib, 'greet() { echo "hello $1"; }\n');
const env = { PATH: process.env.PATH ?? '/usr/bin:/bin', LAB_LIB: lib, Q_DIR: '/tmp/course/9' };

test('exit 0 passes and helper functions from LAB_LIB are available', async () => {
  const r = await runBash('greet world', [], { env, timeoutMs: 5_000 });
  assert.equal(r.exitCode, 0);
  assert.equal(r.output.trim(), 'hello world');
  assert.ok(passed(r));
});

test('non-zero exit fails and stderr is captured', async () => {
  const r = await runBash('echo oops >&2; exit 3', [], { env, timeoutMs: 5_000 });
  assert.equal(r.exitCode, 3);
  assert.match(r.output, /oops/);
  assert.equal(passed(r), false);
});

test('pipefail is on, so a failing pipeline stage fails the check', async () => {
  const r = await runBash('false | cat', [], { env, timeoutMs: 5_000 });
  assert.equal(passed(r), false);
});

test('a hanging script is killed at the timeout, including its children', async () => {
  const started = Date.now();
  const r = await runBash('sleep 30 & wait', [], { env, timeoutMs: 300 });
  assert.equal(r.timedOut, true);
  assert.equal(passed(r), false);
  assert.ok(Date.now() - started < 5_000);
});

test('only the given environment reaches the script', async () => {
  process.env.LAB_SECRET_TEST = 'leak';
  try {
    const r = await runBash('echo "q=$Q_DIR s=${LAB_SECRET_TEST:-none}"', [], { env, timeoutMs: 5_000 });
    assert.equal(r.output.trim(), 'q=/tmp/course/9 s=none');
  } finally {
    delete process.env.LAB_SECRET_TEST;
  }
});

test('script files run with the library sourced', async () => {
  const file = path.join(dir, 'setup.sh');
  writeFileSync(file, 'set -e\ngreet file\n');
  const r = await runFile(file, { env, timeoutMs: 5_000 });
  assert.equal(r.output.trim(), 'hello file');
});
