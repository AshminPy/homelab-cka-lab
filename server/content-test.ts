// Proves every question's checks on a live target:
//   cleanup -> setup -> NO check may pass yet -> solution.sh -> every check passes -> cleanup
//
// Usage: LAB_TARGET=kind-cka-labtest npm run test:content [-- <exam>[/<lab>[/<question>]]]
// Env:   CONTENT_TEST_CONCURRENCY (default 3), CONTENT_TEST_KEEP=1 to leave resources for debugging.
import path from 'node:path';
import { CONTENT_DIR, STATE_DIR, TARGETS_FILE } from './config.ts';
import { loadCatalog } from './content.ts';
import { gradeQuestion, mapLimit } from './grading.ts';
import { LabRunner } from './labrunner.ts';
import { passed } from './runner.ts';
import { loadTargets, probeTarget } from './target.ts';

const tail = (s: string): string => s.trim().split('\n').slice(-4).join(' | ') || '(no output)';

const filter = process.argv[2] ?? '';
const { defaultId, targets } = loadTargets(TARGETS_FILE);
const targetId = process.env.LAB_TARGET ?? defaultId;
const target = targets.find((t) => t.id === targetId);
if (!target) {
  console.error(`Unknown target "${targetId}". Known: ${targets.map((t) => t.id).join(', ')}`);
  process.exit(2);
}

// Own state dir, so a running app's kubeconfig is never swapped underneath it.
const { status, kubeconfigPath } = await probeTarget(target, path.join(STATE_DIR, 'content-test'));
if (!status.ok || !kubeconfigPath) {
  console.error(`Target ${target.id} is not ready: ${status.error ?? 'unknown error'}\n  ${status.hint ?? ''}`);
  process.exit(2);
}

const catalog = loadCatalog(CONTENT_DIR);
const runner = new LabRunner(() => ({ target, kubeconfigPath }), () => {});
const items = catalog.labs
  .flatMap((lab) => lab.questions.map((q) => ({ lab, q, key: `${lab.examId}/${lab.id}/${q.id}` })))
  .filter((i) => i.key.startsWith(filter));
if (items.length === 0) {
  console.error(`No questions match "${filter}"`);
  process.exit(2);
}

console.log(`Content test on ${target.id} (${status.serverVersion ?? '?'}): ${items.length} question(s)\n`);

const results = await mapLimit(items, Number(process.env.CONTENT_TEST_CONCURRENCY ?? 3), async ({ lab, q, key }) => {
  const started = Date.now();
  const problems: string[] = [];
  const check = (qq: typeof q, i: number) => runner.check(lab, qq, i);

  const prep = await runner.prepare(lab, q);
  if (!passed(prep)) {
    problems.push(`setup failed: ${tail(prep.output)}`);
  } else {
    const before = await gradeQuestion(q, check);
    for (const c of before.checks.filter((x) => x.passed)) {
      problems.push(`check "${c.id}" passes straight after setup, so it gives free points; gate it on the task being done`);
    }
    const sol = await runner.solve(lab, q);
    if (!passed(sol)) problems.push(`solution.sh failed: ${tail(sol.output)}`);
    const after = await gradeQuestion(q, check);
    for (const c of after.checks.filter((x) => !x.passed)) problems.push(`after the solution, check "${c.id}" fails: ${tail(c.output)}`);
  }
  if (!process.env.CONTENT_TEST_KEEP) await runner.cleanup(lab, q);

  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`${problems.length ? 'FAIL' : 'PASS'} ${key} (${secs}s)${problems.map((p) => `\n     - ${p}`).join('')}`);
  return problems.length === 0;
});

const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} questions passed`);
process.exit(failed ? 1 : 0);
