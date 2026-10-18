set -e
# Read the unit on the node, parse it here (keeps the node read-only and works over ssh too).
cfg=$(on_node "$NODE_WORKER1" systemctl cat kubelet | grep -o -- '--config=[^[:space:]"]*' | tail -n 1 | cut -d= -f2)
[[ -n "$cfg" ]]
echo "$cfg" > "$Q_DIR/kubelet-config.txt"
on_node "$NODE_WORKER1" cat "$cfg" | sed -n 's/^staticPodPath:[[:space:]]*//p' > "$Q_DIR/static-pod-path.txt"
[[ -s "$Q_DIR/static-pod-path.txt" ]]
