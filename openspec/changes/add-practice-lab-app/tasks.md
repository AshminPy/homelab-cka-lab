# Tasks

## 1. Scaffold

- [x] 1.1 Create package.json (scripts: start, dev, build, typecheck, test, test:content), tsconfig files, Vite config, .gitignore, and a postinstall step that makes node-pty's spawn-helper executable; verify `npm install` and `npm run typecheck` succeed

## 2. Content model

- [x] 2.1 Write `content/exams.yaml` (CKA/CKAD/CKS, pass marks 66/66/67, domains + weights, target dates) and `config/targets.yaml` (`kind-cka`, `kind-cka-labtest`, `range` placeholder); verify both parse
- [x] 2.2 Implement the content loader with validation (required fields, known domains, unique ids, files present, `{{nodes.*}}` rendering) and unit tests for a valid lab, a question missing checks, an unknown domain and node rendering; verify `npm test` passes
- [x] 2.3 Write `content/lib/check-lib.sh` helpers (namespace/resource getters, jsonpath equality, file assertions, wait helpers) and document them in `docs/authoring.md`; verify with a shellcheck-free `bash -n` syntax check

## 3. Target and runner

- [x] 3.1 Implement target handling: write the dedicated kubeconfig (0600, single context), probe API and nodes, expose status; unit-test the single-context validation; verify against the live test cluster that `kubectl config get-contexts` through the app kubeconfig lists one context
- [x] 3.2 Implement the script runner (bash -c, check-lib sourced, target env, per-run timeout, truncated output) with unit tests for pass, fail, timeout and env injection; verify `npm test` passes

## 4. Attempts, grading and progress

- [x] 4.1 Implement the progress store (atomic JSON writes, active attempt, history) and dashboard stats (best/last per lab, per-domain accuracy, weakest domains, days to target); unit tests for history-after-reload, weakest domain and no-data cases
- [x] 4.2 Implement the attempt API (start with setup, flag/done, reset question, practice check, finish, solution gate) with unit tests for exam-mode check rejection, solution locked before check, one active attempt, and grading math (points, %, pass mark, per-domain)

## 5. Security and terminal

- [x] 5.1 Implement Host/Origin middleware and the session token, with unit tests for foreign Host, foreign Origin on POST and WebSocket upgrade, and missing token; verify `npm test` passes
- [x] 5.2 Implement the terminal WebSocket (node-pty, resize, cleanup on close), `terminal/bashrc` (k alias, completion, do/now, prompt) and `bin/node-shell`; verify in a live session that `k run x --image=nginx $do` prints YAML and `node-shell <worker>` opens a node shell

## 6. UI

- [x] 6.1 Build the home page (exam tabs, lab list with best score/attempts/resume, target status, progress summary) and start dialog (Practice/Exam); verify in the browser
- [x] 6.2 Build the lab view (header timer + done count + finish, question grid, question panel with flag/done/check/reset/solution/prev/next, xterm terminal pane) and the results page (total %, pass/fail, per-question checks, per-domain bars); verify an attempt end to end in the browser
- [x] 6.3 Build the progress page (attempt history, per-domain accuracy, weakest domains, days to exam); verify with at least one finished attempt

## 7. CKA Lab 1 content

- [x] 7.1 Implement the content test (`npm run test:content`): per question cleanup → setup → no check may pass yet → solution.sh → all checks pass → cleanup; verify it fails on a deliberately broken check
- [x] 7.2 Author CKA Lab 1 (10 Week-1 questions across Workloads, Services & Networking, Troubleshooting and Cluster Architecture) with setup, checks, solution.sh and solution.md; verify `npm run test:content` passes for all 10 on the test cluster

## 8. Integration

- [x] 8.1 Write the README (what it is, prerequisites, create the `cka` cluster, start, safety model, adding labs, switching to `range`) and verify the documented commands run as written
- [x] 8.2 Run a full Exam-mode attempt of CKA Lab 1 in the browser against the test cluster, finish it and confirm the result and progress page are correct; remove the throwaway test cluster afterwards
