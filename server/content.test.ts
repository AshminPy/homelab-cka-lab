import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ContentError, loadCatalog, qdirFor, renderText } from './content.ts';
import { tempDir, writeContent } from './testkit.ts';

test('loads a valid lab with question points summed from checks', () => {
  const dir = writeContent(tempDir(), [
    { id: 'q01-a', checks: [{ id: 'x', points: 2 }, { id: 'y', points: 3 }] },
    { id: 'q02-b', domain: 'Workloads & Scheduling' },
  ]);
  const catalog = loadCatalog(dir);
  assert.equal(catalog.exams[0]?.passPercent, 66);
  const lab = catalog.labs[0];
  assert.ok(lab);
  assert.equal(lab.questions.length, 2);
  assert.equal(lab.questions[0]?.points, 5);
  assert.equal(lab.questions[0]?.hasCleanup, true);
  assert.equal(qdirFor('/tmp/course', lab, 'q02-b'), '/tmp/course/2');
});

test('rejects a question without checks, naming the file and field', () => {
  const dir = writeContent(tempDir(), [{ id: 'q01-a', checks: null }]);
  assert.throws(() => loadCatalog(dir), (err: unknown) => {
    assert.ok(err instanceof ContentError);
    assert.match(err.message, /q01-a\/question\.yaml: missing required field "checks"/);
    return true;
  });
});

test('rejects a domain that the exam does not have', () => {
  const dir = writeContent(tempDir(), [{ id: 'q01-a', domain: 'Storage' }]);
  assert.throws(() => loadCatalog(dir), /unknown domain "Storage" for exam CKA/);
});

test('rejects a question missing solution.sh', () => {
  const dir = writeContent(tempDir(), [{ id: 'q01-a', omitFiles: ['solution.sh'] }]);
  assert.throws(() => loadCatalog(dir), /missing required file "solution.sh"/);
});

test('rejects duplicate check ids and non-integer points', () => {
  const dup = writeContent(tempDir(), [{ id: 'q01-a', checks: [{ id: 'x', points: 1 }, { id: 'x', points: 1 }] }]);
  assert.throws(() => loadCatalog(dup), /duplicate check id "x"/);
  const frac = writeContent(tempDir(), [{ id: 'q01-a', checks: [{ id: 'x', points: 1.5 }] }]);
  assert.throws(() => loadCatalog(frac), /"points" must be a whole number/);
});

test('renders node and answer-folder placeholders, leaving unknown nodes visible', () => {
  const out = renderText('ssh {{nodes.worker1}}, write to {{qdir}}/x, {{ nodes.gpu }}', {
    nodes: { worker1: 'cka-worker' },
    qdir: '/tmp/course/3',
  });
  assert.equal(out, 'ssh cka-worker, write to /tmp/course/3/x, {{ nodes.gpu }}');
});
