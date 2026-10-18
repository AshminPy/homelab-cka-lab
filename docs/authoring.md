# Writing labs

Labs are plain files. Add a folder, restart the app, and the lab appears. Every question must pass the content test before it is used.

## Layout

```
content/
  exams.yaml                                exams, pass marks, domains (names must match exactly)
  lib/check-lib.sh                          helpers available in every script and check
  labs/<exam>/<lab-id>/
    lab.yaml                                title, level, description, durationMinutes, ordered question ids
    <question-id>/
      question.yaml                         title, domain, difficulty, context, tasks, checks
      setup.sh                              builds the starting state
      cleanup.sh                            removes everything the question owns (recommended)
      solution.sh                           automated reference answer (used by the content test)
      solution.md                           the explained answer the learner sees
```

`question.yaml`:

```yaml
id: q01-pod-basics            # must equal the folder name
title: Create a labelled Pod
domain: Workloads & Scheduling # must be one of the exam's domains in exams.yaml
difficulty: easy               # easy | medium | hard
context: |                     # optional story, Markdown
  ...
tasks: |                       # what to do, Markdown; be exact about names, namespaces, images, paths
  ...
checks:
  - id: pod-exists             # unique within the question
    description: Pod web exists in namespace lab1-q1   # shown after grading
    points: 1                  # whole number; question points = sum of its checks
    run: exists lab1-q1 pod web                         # bash; exit 0 = pass
```

## Placeholders

Content must work on every target (kind today, the homelab `range` cluster later), so never hard-code node names or answer paths.

| In `context` / `tasks` / `solution.md` | In scripts and checks | Example (kind `cka`) |
|---|---|---|
| `{{nodes.controlPlane}}` | `$NODE_CONTROLPLANE` | `cka-control-plane` |
| `{{nodes.worker1}}` | `$NODE_WORKER1` | `cka-worker` |
| `{{nodes.worker2}}` | `$NODE_WORKER2` | `cka-worker2` |
| `{{qdir}}` | `$Q_DIR` | `/tmp/course/7` (7 = question position in the lab) |

Run a command on a node with `on_node "$NODE_WORKER1" <command>` (scripts) or `node-shell <node>` (learner terminal).

## Helpers (`content/lib/check-lib.sh`)

| Helper | Use |
|---|---|
| `k ...` | kubectl |
| `jp <ns> <resource> <name> <jsonpath>` | print a field |
| `jp_eq <ns> <resource> <name> <jsonpath> <expected>` | field equals value |
| `exists <ns> <resource> <name>` | object exists |
| `count <ns> <resource> [selector]` | number of objects |
| `svc_ready_endpoints <ns> <service>` | number of ready endpoints behind a Service |
| `pod_ready <ns> <pod> [timeout]` | Pod is Ready (default wait 10s) |
| `rollout_done <ns> <deployment> [timeout]` | rollout complete (default wait 10s) |
| `expect_eq <actual> <expected>` | compare strings with a readable failure |
| `file_exists` / `file_eq` / `file_has <path> <regex>` | answer-file checks (trailing spaces and blank lines ignored) |
| `ensure_ns <ns>...` / `delete_ns <ns>...` | idempotent namespace create / delete-and-wait |
| `reset_qdir` | empty `$Q_DIR` (refuses anything outside `$COURSE_DIR`) |
| `on_node <node> <cmd...>` | run a command on a node |

## Rules

1. **Isolation.** A question owns its namespace(s) (`lab<N>-q<M>`) and its `$Q_DIR`, and touches nothing else. Reset of one question must never affect another. Never modify `kube-system`, nodes, or cluster-wide objects in a Week-1 lab. Cluster-scoped objects are allowed later only if the question creates and deletes them itself, with a unique name.
2. **Idempotent scripts.** `cleanup.sh` then `setup.sh` must work from any state: fresh, half-done, or fully solved. Use `delete_ns` in cleanup and `reset_qdir` when the question uses answer files.
3. **No free points.** Right after setup, *every* check must fail. A "nothing else was broken" check (e.g. "the Deployment still has 2 replicas") must first require the main task to be done, or it rewards doing nothing. The content test enforces this.
4. **Checks are fast and read-only.** Never create or change anything in a check. Waits are short (`pod_ready ... 15s` at most) because they run while the learner waits.
5. **Solutions wait.** `solution.sh` starts with `set -e` and waits for what it created (`kubectl wait ... --timeout=120s`, `rollout status`) so the checks after it are deterministic.
6. **Cluster-wide values are unique.** NodePorts are shared by the whole cluster: give each question its own (Lab 1 q03 owns `30080`) and record new ones here.
7. **Pinned, small images.** `nginx:1.27-alpine`, `nginx:1.26-alpine`, `busybox:1.37`. Never `:latest`.
8. **bash 3.2.** Scripts run under macOS `/bin/bash`: no associative arrays, no `${var,,}`, no `mapfile`, no `set -u`.
9. **Original content.** Write tasks from the public curriculum. Never reproduce recalled exam questions (Linux Foundation certification rules).
10. **Exam-like wording.** Be exact about names, namespaces, images, ports and file paths, like the real exam. Mix in tasks where the learner must investigate first.

## solution.md

Write for a beginner: the commands, why they work, and how to verify. One short analogy when a concept is new. One exam tip (speed or a common trap). Use the placeholders above for node names and paths.

## Test

```bash
LAB_TARGET=kind-cka-labtest npm run test:content -- cka/lab-01-foundations
LAB_TARGET=kind-cka-labtest npm run test:content -- cka/lab-01-foundations/q01-pod-basics
CONTENT_TEST_KEEP=1 ...   # leave the resources in place to debug a failing check
```
