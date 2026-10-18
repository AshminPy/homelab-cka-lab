## Solution

**1. Confirm the symptom.** A Service with no endpoints has nowhere to send traffic:

```bash
k -n lab1-q5 get endpointslices -l kubernetes.io/service-name=payments
```

The `ENDPOINTS` column is `<unset>`: no Pod matches.

**2. Compare the two sides.** The Service's selector must match the Pods' labels exactly:

```bash
k -n lab1-q5 get svc payments -o wide          # SELECTOR column: app=payment
k -n lab1-q5 get pods --show-labels            # LABELS column:   app=payments
```

`payment` is not `payments`. One missing letter, and the Service matches nothing. You can prove it by asking for Pods with the Service's selector:

```bash
k -n lab1-q5 get pods -l app=payment           # No resources found
```

**3. Fix the Service, not the Deployment:**

```bash
k -n lab1-q5 edit svc payments
```

Change `app: payment` to `app: payments` under `spec.selector`, save and quit. Or in one line:

```bash
k -n lab1-q5 patch svc payments -p '{"spec":{"selector":{"app":"payments"}}}'
```

**4. Verify:**

```bash
k -n lab1-q5 get endpointslices -l kubernetes.io/service-name=payments
```

You should now see two Pod IPs on port 80.

**How to picture it:** the Service is a mail sorter that delivers to every house with a matching name on the mailbox. If the sorter looks for "payment" and every mailbox says "payments", no letter is ever delivered, even though everyone is home.

**Why not change the Pods?** Relabelling Pods or the Deployment would also "work", but the task forbids it, and in real life other things (monitoring, NetworkPolicies) may depend on those labels. Fix the part that is wrong.

**Exam tip:** for "Service not working" tasks, go straight to `get endpointslices` (or `k describe svc`, which shows `Endpoints:`). Empty endpoints almost always means a selector/label mismatch or Pods that are not Ready. A wrong `targetPort` shows endpoints but connections still fail.
