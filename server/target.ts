import { execFile } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import YAML from 'yaml';
import { BIN_DIR, CHECK_LIB, COURSE_DIR } from './config.ts';
import { ContentError } from './content.ts';
import type { TargetStatus } from './shared.ts';

const execFileP = promisify(execFile);

export interface TargetConfig {
  id: string;
  description: string;
  context: string;
  kubeconfigCommand?: string[];
  kubeconfigPath?: string;
  nodeShell: string;
  nodeExec: string;
  nodes: Record<string, string>;
  createHint: string;
}

export interface TargetContext {
  target: TargetConfig;
  kubeconfigPath: string;
}

type Obj = Record<string, unknown>;

export function loadTargets(file: string): { defaultId: string; targets: TargetConfig[] } {
  const doc = YAML.parse(readFileSync(file, 'utf8')) as Obj;
  if (!Array.isArray(doc?.targets)) throw new ContentError(`${file}: missing required field "targets"`);
  const targets = doc.targets.map((raw: unknown, i: number) => {
    const t = raw as Obj;
    const where = `${file} targets[${i}]`;
    for (const f of ['id', 'description', 'context', 'nodeShell', 'nodeExec', 'createHint']) {
      if (typeof t[f] !== 'string' || !t[f]) throw new ContentError(`${where}: missing required field "${f}"`);
    }
    const hasCmd = Array.isArray(t.kubeconfigCommand) && t.kubeconfigCommand.every((a) => typeof a === 'string');
    const hasPath = typeof t.kubeconfigPath === 'string';
    if (hasCmd === hasPath) throw new ContentError(`${where}: set exactly one of "kubeconfigCommand" or "kubeconfigPath"`);
    if (!t.nodes || typeof t.nodes !== 'object') throw new ContentError(`${where}: missing required field "nodes"`);
    for (const [key, value] of Object.entries(t.nodes as Obj)) {
      if (!/^[A-Za-z0-9]+$/.test(key) || typeof value !== 'string' || !/^[A-Za-z0-9.-]+$/.test(value)) {
        throw new ContentError(`${where}: invalid node entry "${key}"`);
      }
    }
    return t as unknown as TargetConfig;
  });
  const defaultId = typeof doc.default === 'string' ? doc.default : (targets[0]?.id ?? '');
  return { defaultId, targets };
}

/**
 * Reduce a kubeconfig to exactly one context (plus its cluster and user) so nothing
 * run by the app can reach any other cluster.
 */
export function extractContext(kubeconfig: unknown, contextName: string): Obj {
  const kc = kubeconfig as Obj;
  const byName = (list: unknown, name: unknown) =>
    Array.isArray(list) ? (list as Obj[]).find((e) => e?.name === name) : undefined;
  const ctx = byName(kc?.contexts, contextName);
  if (!ctx) throw new Error(`kubeconfig has no context named "${contextName}"`);
  const ctxBody = ctx.context as Obj | undefined;
  const cluster = byName(kc.clusters, ctxBody?.cluster);
  const user = byName(kc.users, ctxBody?.user);
  if (!cluster || !user) throw new Error(`context "${contextName}" references a missing cluster or user`);
  return {
    apiVersion: 'v1',
    kind: 'Config',
    clusters: [cluster],
    users: [user],
    contexts: [ctx],
    'current-context': contextName,
    preferences: {},
  };
}

function expandHome(p: string): string {
  return p.startsWith('~/') ? path.join(homedir(), p.slice(2)) : p;
}

/** Write the target's single-context kubeconfig (mode 0600) into the state dir and return its path. */
export async function materializeKubeconfig(target: TargetConfig, stateDir: string): Promise<string> {
  let raw: string;
  if (target.kubeconfigCommand) {
    const [cmd, ...args] = target.kubeconfigCommand;
    const { stdout } = await execFileP(cmd as string, args, { timeout: 20_000, maxBuffer: 4 * 1024 * 1024 });
    raw = stdout;
  } else {
    raw = readFileSync(expandHome(target.kubeconfigPath as string), 'utf8');
  }
  let parsed: unknown;
  try {
    parsed = YAML.parse(raw);
  } catch {
    // Never echo the parser message: it can quote kubeconfig lines (credentials).
    throw new Error('kubeconfig output is not valid YAML');
  }
  const minimal = extractContext(parsed, target.context);
  mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const file = path.join(stateDir, 'kubeconfig');
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, YAML.stringify(minimal), { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, file);
  return file;
}

function errorText(err: unknown): string {
  const e = err as { stderr?: string; message?: string };
  return (e.stderr || e.message || String(err)).trim().split('\n').slice(-3).join(' ');
}

/** Materialize the kubeconfig and check the API server and nodes. Never throws. */
export async function probeTarget(target: TargetConfig, stateDir: string): Promise<{ status: TargetStatus; kubeconfigPath?: string }> {
  const base = { id: target.id, description: target.description, context: target.context, checkedAt: new Date().toISOString() };
  let kubeconfigPath: string;
  try {
    kubeconfigPath = await materializeKubeconfig(target, stateDir);
  } catch (err) {
    return { status: { ...base, ok: false, nodes: [], error: `Cannot get a kubeconfig for ${target.id}: ${errorText(err)}`, hint: target.createHint } };
  }
  try {
    const kc = ['--kubeconfig', kubeconfigPath, '--request-timeout=8s'];
    const [nodesOut, versionOut] = await Promise.all([
      execFileP('kubectl', [...kc, 'get', 'nodes', '-o', 'json'], { timeout: 15_000, maxBuffer: 8 * 1024 * 1024 }),
      execFileP('kubectl', [...kc, 'version', '-o', 'json'], { timeout: 15_000 }),
    ]);
    const items = (JSON.parse(nodesOut.stdout).items ?? []) as Obj[];
    const nodes = items.map((n) => {
      const meta = n.metadata as Obj;
      const conds = ((n.status as Obj)?.conditions ?? []) as Obj[];
      return { name: String(meta.name), ready: conds.some((c) => c.type === 'Ready' && c.status === 'True') };
    });
    const serverVersion = (JSON.parse(versionOut.stdout).serverVersion as Obj | undefined)?.gitVersion as string | undefined;
    const ok = nodes.length > 0 && nodes.every((n) => n.ready);
    return {
      status: { ...base, ok, nodes, serverVersion, error: ok ? undefined : 'Not all nodes are Ready', hint: ok ? undefined : 'Wait a minute after creating the cluster, then refresh.' },
      kubeconfigPath,
    };
  } catch (err) {
    return { status: { ...base, ok: false, nodes: [], error: `API server not reachable: ${errorText(err)}`, hint: target.createHint }, kubeconfigPath };
  }
}

/** Environment for every child process: only the target kubeconfig, never the user's own. */
export function childEnv(ctx: TargetContext, extra: Record<string, string> = {}): Record<string, string> {
  const pass = ['HOME', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'TMPDIR', 'TERM', 'DOCKER_HOST', 'DOCKER_CONTEXT', 'SSH_AUTH_SOCK'];
  const env: Record<string, string> = {};
  for (const k of pass) {
    const v = process.env[k];
    if (v) env[k] = v;
  }
  env.PATH = `${BIN_DIR}:${process.env.PATH ?? '/usr/bin:/bin'}`;
  env.KUBECONFIG = ctx.kubeconfigPath;
  env.LAB_LIB = CHECK_LIB;
  env.LAB_TARGET = ctx.target.id;
  env.COURSE_DIR = COURSE_DIR;
  env.LAB_NODES = Object.values(ctx.target.nodes).join(' ');
  env.LAB_NODE_SHELL = ctx.target.nodeShell;
  env.LAB_NODE_EXEC = ctx.target.nodeExec;
  for (const [key, name] of Object.entries(ctx.target.nodes)) env[`NODE_${key.toUpperCase()}`] = name;
  return { ...env, ...extra };
}
