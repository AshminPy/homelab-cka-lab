# Proposal

## Why

CKA, CKAD and CKS are hands-on terminal exams (2 hours, 15-20 tasks, pass at 66% / 66% / 67%). Reading and ad-hoc drills don't show whether a task was actually done right, and there is no record of which domains are weak. A local killer.sh-style simulator gives timed, auto-graded labs against a real cluster (kind now, the homelab `range` cluster later) and tracks progress toward the 31 Dec 2026 target.

## What Changes

- New local web app: pick an exam (CKA / CKAD / CKS), then a lab, then work through questions with a timer, flag/done marks, a question grid and a built-in terminal locked to the practice cluster.
- Two modes: **Practice** (check any question at any time; the solution unlocks after checking) and **Exam** (no checks until you finish, then a full score report with solutions).
- Auto-grading: every question defines scored checks that inspect the live cluster and files; results show pass/fail per check, points per question, total %, and pass/fail against the exam's real pass mark.
- Per-question environment setup (namespaces, broken resources) and reset.
- Progress tracking: attempt history, best/last score per lab, accuracy per exam domain, weakest domains, days left to each exam target.
- Content as files: labs are YAML + shell scripts, so new drills need no code changes. Every question ships an automated reference solution, and a content test proves its checks fail before the solution and pass after it.
- First content: CKA Lab 1 (Week 1 foundations, 10 questions). CKAD and CKS appear as exams with no labs yet.
- The practice cluster is a configuration value (target), so pointing at the homelab later is a config change.

## Capabilities

### New Capabilities
- `practice-labs`: exam/lab catalog, lab attempts (modes, timer, flag/done, reset), the built-in terminal, and auto-grading.
- `progress-tracking`: attempt history, scores and per-domain statistics.
- `lab-content`: the authoring contract for labs and questions, and the content test that proves every question's checks.

### Modified Capabilities
- (none — new project)

## Impact

- New repository `homelab-cka-lab` (Node.js 24 server, React UI, lab content, tests).
- Runs only on the local machine (127.0.0.1). The terminal and checks use a dedicated kubeconfig holding only the target cluster, so the user's work and production contexts are unreachable from the app.
- Dependencies: express, ws, node-pty, yaml, React, xterm.js, Vite, marked, DOMPurify.
- Content is written from the public exam curriculum; no recalled exam questions (Linux Foundation certification rules).
