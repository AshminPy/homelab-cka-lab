## Solution

Create the Deployment. `kubectl create deployment` automatically labels the Pods `app=api` and uses that label as the selector:

```bash
k -n lab1-q2 create deployment api --image=nginx:1.27-alpine --replicas=2
```

Scale it to 4:

```bash
k -n lab1-q2 scale deployment api --replicas=4
```

Wait until every replica is ready:

```bash
k -n lab1-q2 rollout status deployment/api
```

Check it:

```bash
k -n lab1-q2 get deployment api -o wide
k -n lab1-q2 get pods -l app=api
```

`READY` should show `4/4`, and you should see four Pods whose names start with `api-`.

**How to picture it:** a Deployment is a manager with a headcount target. You tell it "I want 4 workers", and it keeps hiring (creating Pods) or letting go (deleting Pods) until the real number matches. If a Pod dies, the manager replaces it. That is the big difference from the bare Pod in question 1.

**Why the label matters:** the Deployment finds "its" Pods by the selector `app=api`. Services use the same label later to send traffic to them.

**Other ways to scale:** `k -n lab1-q2 edit deployment api` and change `spec.replicas`, or `k -n lab1-q2 patch deployment api -p '{"spec":{"replicas":4}}'`. `scale` is the fastest.

**Exam tip:** `kubectl create deployment` accepts `--replicas` directly, so when the task only wants the final number you can skip the separate scale step. Always finish with `rollout status` so you know the replicas really came up before you move on.
