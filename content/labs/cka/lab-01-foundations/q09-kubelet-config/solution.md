## Solution

**0. A little systemd first.** On Linux, long-running programs (services) are started and watched by **systemd**. Each service is described by a **unit file**. Extra settings can be added in **drop-in** files in a folder named `<service>.service.d/`, which override or extend the main file. Three commands cover most of what you need:

| Command | What it shows |
|---|---|
| `systemctl status kubelet` | is it running, since when, the last few log lines |
| `systemctl cat kubelet` | the unit file **plus every drop-in**, each with its path as a `#` comment |
| `journalctl -u kubelet -n 50 --no-pager` | the last 50 log lines of the service (add `-f` to follow live) |

**1. Open a shell on the node and look at the unit:**

```bash
node-shell {{nodes.worker1}}
systemctl status kubelet --no-pager
systemctl cat kubelet
```

In the output, find the drop-in (usually `/etc/systemd/system/kubelet.service.d/10-kubeadm.conf` or `/usr/lib/systemd/system/kubelet.service.d/10-kubeadm.conf`). It contains a line like:

```
Environment="KUBELET_CONFIG_ARGS=--config=/var/lib/kubelet/config.yaml"
```

and an `ExecStart=` line that passes `$KUBELET_CONFIG_ARGS` to the kubelet. So the config file is the path after `--config=`. A quick way to pull it out:

```bash
systemctl cat kubelet | grep -- '--config'
```

You can double-check against the running process: `ps -ef | grep [k]ubelet` shows the same `--config=...` flag.

**2. Read `staticPodPath` from that file:**

```bash
grep staticPodPath /var/lib/kubelet/config.yaml      # use the path you found
exit                                                  # back to your terminal
```

**3. Write the answers on your terminal** (not on the node, the node cannot see `{{qdir}}`). Use the values you found, for example:

```bash
echo /var/lib/kubelet/config.yaml > {{qdir}}/kubelet-config.txt
echo /etc/kubernetes/manifests    > {{qdir}}/static-pod-path.txt
cat {{qdir}}/kubelet-config.txt {{qdir}}/static-pod-path.txt
```

Or without copying by hand, run single commands on the node from your terminal:

```bash
node-shell {{nodes.worker1}} -- grep staticPodPath /var/lib/kubelet/config.yaml
```

**How to picture it:** systemd is the building's caretaker with a binder of instructions (unit files). The main page says "start the kubelet"; sticky notes added later (drop-ins) say "and give it this config file". `systemctl cat` shows you the main page and every sticky note together, so you never miss an override.

**Why it matters:** every file in `staticPodPath` is run as a Pod by the kubelet itself, without the scheduler. That is how kubeadm runs the API server, scheduler and etcd on the control-plane node. A typo in a manifest there, or the wrong path in the config, is a classic troubleshooting task.

**Exam tip:** in the exam you `ssh` to a node and often need `sudo -i` for root. Remember that answer files are expected on the machine the task names (usually your main terminal), so `exit` the node before writing them. After editing kubelet config in a real task you would need `systemctl daemon-reload` (only if unit files changed) and `systemctl restart kubelet`; this task is read-only, so do neither.
