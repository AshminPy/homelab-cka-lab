import { mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { createApp } from './app.ts';
import { AttemptService, HttpError } from './attempts.ts';
import { CONTENT_DIR, COURSE_DIR, DEV, HOST, PORT, STATE_DIR, TARGETS_FILE, TERMINAL_RC, WEB_DIST } from './config.ts';
import { loadCatalog, nodeKeysIn } from './content.ts';
import { LabRunner } from './labrunner.ts';
import { ProgressStore } from './progress.ts';
import { createSecurity } from './security.ts';
import type { TargetStatus } from './shared.ts';
import { childEnv, loadTargets, probeTarget, type TargetContext } from './target.ts';
import { attachTerminal } from './terminal.ts';

const catalog = loadCatalog(CONTENT_DIR);
const { defaultId, targets } = loadTargets(TARGETS_FILE);
const targetId = process.env.LAB_TARGET ?? defaultId;
const target = targets.find((t) => t.id === targetId);
if (!target) {
  console.error(`Unknown target "${targetId}". Known targets: ${targets.map((t) => t.id).join(', ')}`);
  process.exit(1);
}

for (const lab of catalog.labs) {
  for (const q of lab.questions) {
    for (const key of nodeKeysIn(`${q.context}\n${q.tasks}`)) {
      if (!target.nodes[key]) console.warn(`warning: ${lab.id}/${q.id} uses {{nodes.${key}}} but target ${target.id} has no such node`);
    }
  }
}

const store = new ProgressStore(path.join(STATE_DIR, 'progress.json'));

let ctx: TargetContext | null = null;
let status: TargetStatus | null = null;
let checkedAt = 0;
let inflight: Promise<TargetStatus> | null = null;

/** Probe the target (cached 10s); refreshes the single-context kubeconfig as a side effect. */
function targetStatus(force = false): Promise<TargetStatus> {
  if (!force && status && Date.now() - checkedAt < 10_000) return Promise.resolve(status);
  inflight ??= probeTarget(target!, STATE_DIR)
    .then((r) => {
      status = r.status;
      checkedAt = Date.now();
      ctx = r.kubeconfigPath ? { target: target!, kubeconfigPath: r.kubeconfigPath } : null;
      return r.status;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

const ops = new LabRunner(() => {
  if (!ctx) throw new HttpError(503, 'Practice cluster not available');
  return ctx;
});

const service = new AttemptService({
  catalog,
  store,
  ops,
  courseDir: COURSE_DIR,
  nodes: () => target.nodes,
  ensureTarget: async () => {
    const s = await targetStatus(true);
    return { ok: s.ok, error: s.error, targetId: target.id };
  },
});

const security = createSecurity(PORT, DEV ? ['http://127.0.0.1:5173', 'http://localhost:5173'] : []);
const app = createApp({
  catalog,
  store,
  service,
  security,
  targetStatus,
  nodes: () => target.nodes,
  courseDir: COURSE_DIR,
  staticDir: WEB_DIST,
});

const server = createServer(app);
attachTerminal(server, {
  security,
  env: () => (ctx && status?.ok ? childEnv(ctx) : null),
  rcfile: TERMINAL_RC,
  cwd: COURSE_DIR,
});

mkdirSync(COURSE_DIR, { recursive: true });
const first = await targetStatus(true);
server.listen(PORT, HOST, () => {
  console.log(`Kubernetes Lab running on http://${HOST}:${PORT}`);
  console.log(`Target ${target.id}: ${first.ok ? `ready (${first.serverVersion}, ${first.nodes.length} nodes)` : `NOT READY - ${first.error}\n  Fix: ${first.hint ?? ''}`}`);
  console.log(`Labs: ${catalog.labs.length} · progress: ${store.file}`);
});
