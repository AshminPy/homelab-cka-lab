## Solution

**1. Find the container name.** `set image` needs it:

```bash
k -n lab1-q10 get deployment frontend -o wide        # CONTAINERS column: nginx
```

**2. Change the image and watch the rollout:**

```bash
k -n lab1-q10 set image deployment/frontend nginx=nginx:1.27-alpine
k -n lab1-q10 rollout status deployment/frontend
```

`rollout status` returns when all 3 replicas run the new image and are ready.

**3. Read the revision.** Every time the Pod template changes, the Deployment's revision goes up by one:

```bash
k -n lab1-q10 rollout history deployment/frontend
```

The highest number in the list is the current revision (here `2`). Write it:

```bash
echo 2 > {{qdir}}/revision.txt
```

Or read it straight from the annotation the Deployment controller maintains, so you cannot copy the wrong number:

```bash
k -n lab1-q10 get deployment frontend -o jsonpath='{.metadata.annotations.deployment\.kubernetes\.io/revision}' > {{qdir}}/revision.txt
cat {{qdir}}/revision.txt
```

**Verify:**

```bash
k -n lab1-q10 get deployment frontend -o wide        # UP-TO-DATE 3, AVAILABLE 3, IMAGES nginx:1.27-alpine
k -n lab1-q10 get rs                                  # old ReplicaSet scaled to 0, new one at 3
```

**How to picture it:** a rolling update is replacing the tyres of a bus while it keeps driving: one new Pod comes up, one old Pod goes away, until all are new. Each version of the Pod template is kept as a ReplicaSet, which is why `k -n lab1-q10 rollout undo deployment/frontend` can drive back to the previous version in seconds.

**Exam tip:** in `set image` the part before `=` is the **container name**, not the image name. `nginx=nginx:1.27-alpine` only works here because `kubectl create deployment` named the container after the image. If the name is wrong, kubectl prints `unable to find container named ...` and nothing changes.
