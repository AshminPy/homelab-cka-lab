## Solution

**1. Look before you touch.** The `STATUS` column tells you what is wrong:

```bash
k -n lab1-q4 get pod broken-web
```

You will see `ErrImagePull` or `ImagePullBackOff` (the kubelet switches between the two while it retries). Either is the right answer. Save it:

```bash
k -n lab1-q4 get pod broken-web --no-headers | awk '{print $3}' > {{qdir}}/reason.txt
cat {{qdir}}/reason.txt
```

`awk '{print $3}'` prints the third column of the line (`NAME READY STATUS ...`), which is the status.

**2. Find the cause.** `describe` shows the events at the bottom:

```bash
k -n lab1-q4 describe pod broken-web | tail -n 10
```

The events say the image `nginx:1.27-alpne` could not be pulled: `alpne` is a typo for `alpine`.

**3. Fix it.** A Pod's container image is one of the few fields you may change on a running Pod. You need the container name first:

```bash
k -n lab1-q4 get pod broken-web -o jsonpath='{.spec.containers[*].name}'; echo
k -n lab1-q4 set image pod/broken-web web=nginx:1.27-alpine
```

**4. Verify:**

```bash
k -n lab1-q4 get pod broken-web -w
```

Wait for `Running` and `1/1`, then press `Ctrl+C`.

**How to picture it:** the kubelet is a delivery driver trying to fetch a parcel (the image) from a warehouse (the registry). With a wrong address it fails (`ErrImagePull`), then waits longer and longer between attempts (`ImagePullBackOff`, the "back-off"). Fix the address and the next attempt succeeds.

**If `set image` feels unfamiliar:** export, fix, replace. Most Pod fields cannot be edited in place, so this pattern works for any Pod change:

```bash
k -n lab1-q4 get pod broken-web -o yaml > pod.yaml
# fix the image line in pod.yaml
k replace --force -f pod.yaml
```

**Exam tip:** in troubleshooting tasks, run `get` and `describe` before changing anything, and read the `Events` section first. Most Pod start-up problems (bad image, missing ConfigMap, no node fits) are spelled out right there.
