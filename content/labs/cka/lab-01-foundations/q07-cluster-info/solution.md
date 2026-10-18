## Solution

**1. All node names, sorted:**

```bash
k get nodes
k get nodes -o name | sed 's|^node/||' | sort > {{qdir}}/nodes.txt
cat {{qdir}}/nodes.txt
```

`-o name` prints `node/<name>`; `sed 's|^node/||'` cuts off the `node/` prefix; `sort` puts the lines in alphabetical order. An equivalent without `sed`:

```bash
k get nodes -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' | sort > {{qdir}}/nodes.txt
```

**2. The control-plane node.** Look at the `ROLES` column of `k get nodes`, or select on the role label that kubeadm puts on control-plane nodes:

```bash
k get nodes -l node-role.kubernetes.io/control-plane -o jsonpath='{.items[*].metadata.name}' > {{qdir}}/control-plane.txt
cat {{qdir}}/control-plane.txt
```

**3. The server version.** `kubectl version` prints two versions: your local kubectl (`Client Version`) and the API server (`Server Version`). The task asks for the server:

```bash
k version
k version | awk '/^Server Version:/ {print $3}' > {{qdir}}/version.txt
cat {{qdir}}/version.txt
```

`awk '/^Server Version:/ {print $3}'` picks the line starting with `Server Version:` and prints its third word.

**How to picture it:** the cluster is an office. The control-plane node is the manager's room (API server, scheduler, etcd live there), the workers are the desks where the actual work (your Pods) happens. `k get nodes` is the seating plan.

**Good to know:** the `VERSION` column of `k get nodes` shows each node's **kubelet** version. It is usually the same as the server version, but during an upgrade they differ, so read the server version from `kubectl version`.

**Exam tip:** for "write the answer to a file" tasks, always `cat` the file afterwards. Extra words like `Server Version:` or a `node/` prefix make an otherwise correct answer wrong.
