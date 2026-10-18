import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TARGETS_FILE } from './config.ts';
import { childEnv, extractContext, loadTargets } from './target.ts';

const kubeconfig = {
  apiVersion: 'v1',
  kind: 'Config',
  'current-context': 'prod',
  clusters: [
    { name: 'kind-cka', cluster: { server: 'https://127.0.0.1:6443' } },
    { name: 'prod-cluster', cluster: { server: 'https://prod.example' } },
  ],
  users: [
    { name: 'kind-cka', user: { token: 'x' } },
    { name: 'prod-user', user: { token: 'y' } },
  ],
  contexts: [
    { name: 'kind-cka', context: { cluster: 'kind-cka', user: 'kind-cka' } },
    { name: 'prod', context: { cluster: 'prod-cluster', user: 'prod-user' } },
  ],
};

test('the app kubeconfig keeps exactly the target context, its cluster and user', () => {
  const out = extractContext(kubeconfig, 'kind-cka') as Record<string, unknown[]>;
  assert.equal(out.contexts?.length, 1);
  assert.equal(out.clusters?.length, 1);
  assert.equal(out.users?.length, 1);
  assert.equal((out as Record<string, unknown>)['current-context'], 'kind-cka');
  assert.doesNotMatch(JSON.stringify(out), /prod/);
});

test('a missing context is an error, never a fallback to another context', () => {
  assert.throws(() => extractContext(kubeconfig, 'kind-other'), /no context named "kind-other"/);
});

test('the shipped targets file parses and node names are safe', () => {
  const { defaultId, targets } = loadTargets(TARGETS_FILE);
  assert.equal(defaultId, 'kind-cka');
  assert.deepEqual(targets.map((t) => t.id), ['kind-cka', 'kind-cka-labtest', 'range']);
  assert.equal(targets[0]?.nodes.worker1, 'cka-worker');
});

test('child processes get only the target kubeconfig and node variables', () => {
  const { targets } = loadTargets(TARGETS_FILE);
  const prev = process.env.KUBECONFIG;
  process.env.KUBECONFIG = '/Users/someone/.kube/config';
  try {
    const env = childEnv({ target: targets[0]!, kubeconfigPath: '/state/kubeconfig' }, { Q_DIR: '/tmp/course/1' });
    assert.equal(env.KUBECONFIG, '/state/kubeconfig');
    assert.equal(env.NODE_WORKER1, 'cka-worker');
    assert.equal(env.NODE_CONTROLPLANE, 'cka-control-plane');
    assert.equal(env.LAB_NODES, 'cka-control-plane cka-worker cka-worker2');
    assert.equal(env.Q_DIR, '/tmp/course/1');
  } finally {
    if (prev === undefined) delete process.env.KUBECONFIG;
    else process.env.KUBECONFIG = prev;
  }
});
