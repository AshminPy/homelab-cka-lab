## Solution

`kubectl expose` reads the Deployment's selector (`app=shop`) and copies it into the Service, so the Service finds the right Pods without you typing the label.

**1. The ClusterIP Service:**

```bash
k -n lab1-q3 expose deployment shop --name=shop --type=ClusterIP --port=80 --target-port=80
```

**2. The NodePort Service.** `expose` cannot set a fixed node port, so generate YAML, add the `nodePort`, and apply:

```bash
k -n lab1-q3 expose deployment shop --name=shop-np --type=NodePort --port=80 --target-port=80 $do > np.yaml
```

Edit `np.yaml` so the port block looks like this:

```yaml
  ports:
  - port: 80
    targetPort: 80
    nodePort: 30080
```

```bash
k -n lab1-q3 apply -f np.yaml
```

**3. Verify** that both Services found the two Pods:

```bash
k -n lab1-q3 get svc
k -n lab1-q3 get endpointslices -l kubernetes.io/service-name=shop
k -n lab1-q3 get endpointslices -l kubernetes.io/service-name=shop-np
```

Each EndpointSlice should list two Pod IPs. You can also test from inside the cluster:

```bash
k -n lab1-q3 run tmp --rm -it --restart=Never --image=busybox:1.37 -- wget -qO- shop
```

**How to picture it:** Pods come and go and their IPs change, like staff changing desks. A Service is the reception desk phone number that never changes: callers dial the Service, and reception forwards the call to whichever Pod with the right label is free. A ClusterIP number only works inside the building (the cluster). A NodePort also opens the same door number (`30080`) on every node, so you can reach it from outside.

**The three ports, in one line:** `nodePort` (on every node) → `port` (on the Service) → `targetPort` (on the container).

**Exam tip:** avoid `kubectl create service nodeport shop-np ...` here. It sets the selector to `app=shop-np`, which matches no Pods, so the Service has no endpoints. `expose` copies the correct selector for you. Always check endpoints after creating a Service.
