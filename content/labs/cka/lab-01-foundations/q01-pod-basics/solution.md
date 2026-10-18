## Solution

One command does it all. `kubectl run` creates a single Pod, and its flags set the label and the port:

```bash
k -n lab1-q1 run web --image=nginx:1.27-alpine --labels=tier=frontend --port=80
```

Check it:

```bash
k -n lab1-q1 get pod web --show-labels -o wide
k -n lab1-q1 get pod web -o jsonpath='{.spec.containers[0].ports[0].containerPort}'; echo
```

`STATUS` should be `Running` and `READY` should be `1/1`.

**How to picture it:** a Pod is a single "flat" with one or more containers living in it. A label like `tier=frontend` is a sticky note on the door, so other objects (Services, Deployments) can find it later by reading the note.

**If you'd rather edit YAML:** generate it, edit it, apply it.

```bash
k -n lab1-q1 run web --image=nginx:1.27-alpine --labels=tier=frontend --port=80 $do > q1.yaml
k -n lab1-q1 apply -f q1.yaml
```

**Exam tip:** always put `-n <namespace>` on every command, or switch with `k config set-context --current --namespace=lab1-q1`. A correct object in the wrong namespace scores zero.
