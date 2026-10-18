## Solution

**1. Create the ConfigMap** with one `--from-literal` per key:

```bash
k -n lab1-q6 create configmap app-config --from-literal=LOG_LEVEL=debug --from-literal=MODE=blue
k -n lab1-q6 describe configmap app-config
```

**2. Generate a Pod skeleton.** Everything after `--` becomes the container's `args` (they replace the image's default command; add `--command` to write `command:` instead):

```bash
k -n lab1-q6 run reader --image=busybox:1.37 $do -- sleep 3600 > reader.yaml
```

**3. Add the env reference and the volume.** Edit `reader.yaml` so the Pod spec looks like this (the new parts are `env`, `volumeMounts` and `volumes`):

```yaml
spec:
  containers:
  - name: reader
    image: busybox:1.37
    args: ["sleep", "3600"]
    env:
    - name: LOG_LEVEL
      valueFrom:
        configMapKeyRef:
          name: app-config      # which ConfigMap
          key: LOG_LEVEL        # which key in it
    volumeMounts:
    - name: config              # must match the volume name below
      mountPath: /etc/app
  volumes:
  - name: config
    configMap:
      name: app-config
```

```bash
k -n lab1-q6 apply -f reader.yaml
k -n lab1-q6 wait --for=condition=Ready pod/reader
```

**4. Verify from inside the container:**

```bash
k -n lab1-q6 exec reader -- env | grep LOG_LEVEL      # LOG_LEVEL=debug
k -n lab1-q6 exec reader -- ls /etc/app               # LOG_LEVEL  MODE
k -n lab1-q6 exec reader -- cat /etc/app/MODE         # blue
```

**How to picture it:** a ConfigMap is a settings sheet pinned on the wall outside the container. `configMapKeyRef` copies one line of the sheet into an environment variable when the container starts. A ConfigMap volume hangs the whole sheet inside the container as a folder, one file per key, with the value as the file content.

**Good to know:** environment variables are read once, at start. Files from a mounted ConfigMap are refreshed by the kubelet after you edit the ConfigMap (it takes up to about a minute). That is why apps that reload config usually read files.

**Exam tip:** you do not have to remember this YAML. `k explain pod.spec.containers.env.valueFrom.configMapKeyRef` and the "Configure a Pod to Use a ConfigMap" page in the Kubernetes docs (allowed in the exam) have copy-ready examples. Double-check that `volumeMounts.name` and `volumes.name` match; a mismatch is the most common typo.
