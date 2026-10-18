# Design

## Context

New repository. Runs on the user's Mac (Node.js 24.4, Docker via colima, kind 0.31, macOS `/bin/bash` 3.2; no Homebrew bash). The practice target today is the kind cluster `cka` (1 control plane + 2 workers); later the homelab kubeadm cluster `range`. The same Mac holds kube contexts for real company clusters, including production, so isolation from them is a hard constraint. Motivation: see proposal.md.

Exam facts used by the app (Linux Foundation docs, read 2026-10-17): CKA/CKAD are 2 hours with 15-20 performance tasks; hosts have `kubectl` with the `k` alias and bash completion; pass marks are CKA 66%, CKAD 66%, CKS 67% (https://docs.linuxfoundation.org/tc-docs/certification/tips-cka-and-ckad, https://docs.linuxfoundation.org/tc-docs/certification/faq-cka-ckad-cks).

## Goals / Non-Goals

**Goals:**
- One command (`npm start`) serves the app on 127.0.0.1 and works offline apart from image pulls.
- Content authors (Claude, later the user) add labs by adding files; checks are proven by an automated content test.
- Switching the target cluster is a config value.

**Non-Goals:**
- Multi-user, remote access, authentication beyond local-only protections.
- Multiple clusters per lab (the real exam switches contexts between clusters) — later, once `range` exists.
- Creating or deleting the target cluster from the app (that is the user's own lab-setup drill).
- CKAD/CKS content in this change.

## Decisions

### D1. Node.js server + React UI, TypeScript without a server build step
- **Choice:** Express 5 + `ws` + `node-pty` server written in erasable-syntax TypeScript and run directly by Node 24's built-in type stripping; React + Vite UI. `tsc --noEmit` type-checks both.
- **Why:** the built-in terminal needs a real PTY; `node-pty` + xterm.js is the standard pairing (used by VS Code). Running the server's TS directly avoids a second build pipeline.
- **Alternatives:** Python (FastAPI) + `ttyd` binary in an iframe — two runtimes and an extra binary to install; plain JS UI — the UI has enough state (attempt, timer, grid, results) that React pays for itself.
- **Evidence:** `node-pty` 1.1.0 installed and spawned bash on this Mac once its prebuilt `spawn-helper` was made executable (npm drops the bit; `posix_spawnp failed` otherwise). A `postinstall` step restores it.

### D2. Content as files: YAML + bash
```
content/exams.yaml                       exams, pass marks, domains (+weights), target dates
content/labs/<exam>/<lab>/lab.yaml       title, description, duration, ordered question ids
content/labs/<exam>/<lab>/<qid>/question.yaml   title, domain, difficulty, context, tasks, checks[]
                                 setup.sh  cleanup.sh(optional)  solution.sh  solution.md
content/lib/check-lib.sh                 helpers sourced by every check/setup/solution
```
- Each check is `{id, description, points, run}` where `run` is a bash snippet that exits 0 on pass. Bash + kubectl is what the exam itself uses, and it can test anything (API objects, files, node state) without inventing a DSL.
- Each question owns namespace(s) and files named after it, so setup/cleanup/reset of one question can't touch another.
- `solution.sh` exists for the content test; `solution.md` explains it for the learner.
- Answer files go under `/tmp/course/<n>/` (killer.sh uses `/opt/course`; `/tmp` needs no root on the Mac).

### D3. Targets are configuration; one dedicated kubeconfig
- `config/targets.yaml` defines targets: how to obtain the kubeconfig (a command such as `kind get kubeconfig --name cka`, or a file path), the expected context name, a node map (`controlPlane`, `worker1`, `worker2`, ...) and a node-shell template (`docker exec -it {node} bash` for kind, `ssh {node}` for range). `LAB_TARGET` env selects one; default `kind-cka`.
- At startup and before every attempt the server writes the kubeconfig to `~/.local/state/homelab-cka-lab/kubeconfig` (mode 0600), verifies it has exactly one context matching the target, and probes the API (`kubectl version`, `get nodes`). Every child process (terminal, setup, checks, solutions) gets `KUBECONFIG` pointing only at that file. The user's `~/.kube/config` is never read or written.
- Node names reach content through `{{nodes.<key>}}` placeholders in question text and `NODE_<KEY>` env vars in scripts; `node-shell` is a small script on the terminal's PATH that applies the target's template.

### D4. Grading runs server-side, per check, with timeouts
- A runner executes each snippet as `bash -c` with `check-lib.sh` sourced, target env set, 20 s timeout per check, 180 s per setup/cleanup/solution. Output is captured (truncated) for a "details" view.
- Practice mode: `POST .../check` grades one question. Exam mode: rejected until finish. Finish grades every question, computes points, %, per-domain totals and pass/fail against the exam's mark.
- Solutions: served only if that question has a check result in a Practice attempt or the attempt is finished — enforced on the server, not just hidden in the UI.

### D5. Progress in a JSON file
- `~/.local/state/homelab-cka-lab/progress.json`: `{ version, activeAttempt, attempts[] }`, written atomically (temp file + rename). Single user, a few hundred attempts at most; SQLite would add a native dependency for no benefit.
- Dashboard stats are computed on read from finished attempts.

### D6. Local-only security
- Bind `127.0.0.1` only. Reject any request whose `Host` isn't `127.0.0.1:<port>`/`localhost:<port>` (DNS-rebinding defence) and any state-changing request or WebSocket upgrade whose `Origin` isn't the app's own origin (CSRF / cross-site WebSocket hijacking defence — the terminal is a real shell).
- The terminal WebSocket also requires a random per-run token from `GET /api/session`; another origin can't read that response because no CORS headers are sent.
- Question/lab ids from requests are looked up in the loaded catalog; no request value is ever used as a path or interpolated into a command.

### D7. Terminal shell
- `node-pty` spawns `/bin/bash --rcfile <repo>/terminal/bashrc -i` in `/tmp/course`, environment: target `KUBECONFIG`, `PATH` + `<repo>/bin`, `NODE_*`. The rcfile sets `alias k=kubectl`, completion for `kubectl` and `k`, `do`, `now`, and a prompt showing the target context. One PTY per WebSocket; killed when the socket closes.

### Architecture-quality answers
- **Likely to change:** content (constantly), targets (kind → range), exams' dates. All three are files, not code.
- **New target/provider:** add an entry to `config/targets.yaml`; content is target-neutral via node placeholders.
- **Automation:** environment setup/reset and grading are automated; the content test automates proof of checks.
- **Dependency unavailable:** cluster down → target status shows unavailable + fix, attempts can't start, checks report errors instead of false fails; Docker down → same path.
- **Observability:** server logs each setup/check/solution run (question, check id, exit code, duration); the UI shows per-check output under "details".
- **Testing:** unit tests (`node --test`) for content validation, grading, progress stats, security middleware; content test against a live kind cluster; manual UI run.
- **Deploy/rollback:** local `npm start`; rollback = previous git commit. Progress file is versioned for future migrations.
- **Security boundary:** loopback + Host/Origin checks + session token; dedicated single-context kubeconfig; scripts only from the repo.
- **Scale/cost:** single user, local; zero cost.

## Risks / Trade-offs

- [The terminal is a real shell on the Mac, not a sandbox] → Local-only binding, Host/Origin/token checks; the kubeconfig limits Kubernetes reach, not filesystem reach. Documented in the README.
- [macOS bash 3.2 may not support kubectl's completion script fully] → Load completion defensively; the `k` alias and `$do` don't depend on it. Verified at build time.
- [Image pulls make first setup slow] → Use small, pinned images (`nginx:1.27-alpine`, `busybox:1.37`); setup timeout 180 s; UI shows progress text.
- [Checks that can never fail or a wrong reference solution] → Content test requires that no check passes after setup and every check passes after the solution.
- [Exam mode on a single kind cluster differs from the real multi-cluster exam] → Accepted for Week 1-4; multi-context labs come with `range`.
