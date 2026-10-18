# homelab-cka-lab

A local, killer.sh-style simulator for **CKA, CKAD and CKS** practice: timed labs, a built-in exam-style terminal, automatic grading of every task, and progress tracking by exam domain. It runs against your own cluster: the kind cluster `cka` today, the homelab `range` cluster later.

- **Practice mode:** check any question as you go; its solution unlocks once you've checked it.
- **Exam mode:** a timer and no checks until you finish, then a full score report against the real pass mark (CKA 66%, CKAD 66%, CKS 67%).
- **Progress:** best and last score per lab, accuracy per exam domain, your weakest domains, and days left to each exam.
- **Labs are files.** Every question ships with an automated reference solution, and a content test proves its checks fail before the solution and pass after it.

## Prerequisites

- macOS or Linux with Node.js 24+, Docker (colima or Docker Desktop), `kind` and `kubectl`
- A kind cluster named `cka` with 1 control plane and 2 workers:

```bash
cat > ~/kind-cka.yaml <<'EOF'
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
- role: control-plane
- role: worker
- role: worker
EOF
```
```bash
kind create cluster --name cka --config ~/kind-cka.yaml
```

## Run

```bash
npm install
```
```bash
npm start
```

Open http://127.0.0.1:8088. If the cluster isn't ready, the Labs page tells you why and how to fix it.

| Command | What it does |
|---|---|
| `npm start` | build the UI and serve everything on 127.0.0.1:8088 |
| `npm run serve` | serve without rebuilding the UI |
| `npm run dev:server` + `npm run dev:web` | development with live reload (UI on :5173) |
| `npm test` | unit tests |
| `npm run typecheck` | TypeScript checks for server and UI |
| `LAB_TARGET=kind-cka-labtest npm run test:content` | prove every question on a throwaway cluster (see [docs/authoring.md](docs/authoring.md)) |

Environment: `LAB_TARGET` (target id, default `kind-cka`), `PORT` (default 8088), `LAB_STATE_DIR` (default `~/.local/state/homelab-cka-lab`), `LAB_COURSE_DIR` (answer files, default `/tmp/course`).

## The terminal

Same shortcuts as the exam hosts: `k` (with completion), `$do` (`--dry-run=client -o yaml`), `$now` (`--force --grace-period 0`). Use `node-shell <node>` to get a root shell on a node, or `node-shell <node> -- <command>` to run one command there. Answer files go under `/tmp/course/<question number>/`.

## Safety model

Your Mac holds kube contexts for real clusters, so the app is built to prevent accidental use of them:

- The app writes a kubeconfig containing **only** the practice target's context (mode 0600, in the state dir). The terminal, setup scripts, checks and solutions all run with `KUBECONFIG` pointing at that file. Run `kubectl config get-contexts` in the terminal to see that only the target is listed. Your `~/.kube/config` is never changed.
- The server listens on 127.0.0.1 only. It rejects requests whose `Host` or `Origin` isn't its own, and the terminal needs a per-run token that other web pages can't read.
- The terminal is a real shell on your machine, not a sandbox. The dedicated kubeconfig stops *accidental* use of other clusters; it is not a boundary. Deliberately pointing kubectl at `~/.kube/config` still works, and so does anything else on your filesystem. Don't expose the port, and on a shared Mac remember any local user who can reach 127.0.0.1:8088 can fetch the terminal token.

## Targets: kind now, homelab later

Targets live in [config/targets.yaml](config/targets.yaml). Each one defines where its kubeconfig comes from, the context name, the node names, and how to reach a node (`docker exec` for kind, `ssh` for the homelab). When the `range` cluster is built, update its entry and run:

```bash
LAB_TARGET=range npm start
```

Lab content is target-neutral: questions refer to nodes as `{{nodes.worker1}}` and the target fills in the real names.

## Adding labs

See [docs/authoring.md](docs/authoring.md). In short: add `content/labs/<exam>/<lab>/<question>/` with `question.yaml`, `setup.sh`, `cleanup.sh`, `solution.sh` and `solution.md`, list the question in `lab.yaml`, and run the content test until it passes. Write tasks from the public curriculum only. Recalled exam questions break the Linux Foundation certification rules.

## Layout

```
server/        Node.js server: content loader, runner, grading, attempts, progress, terminal, security
web/           React UI (Vite)
content/       exams.yaml, check helpers, labs
config/        practice targets
terminal/      exam-style bashrc for the built-in terminal
bin/node-shell node access helper on the terminal's PATH
openspec/      the spec and design for this app
```
