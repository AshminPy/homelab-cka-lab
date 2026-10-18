set -e
kubectl get nodes -o name | sed 's|^node/||' | sort > "$Q_DIR/nodes.txt"
kubectl get nodes -l node-role.kubernetes.io/control-plane -o jsonpath='{.items[*].metadata.name}' > "$Q_DIR/control-plane.txt"
kubectl version | awk '/^Server Version:/ {print $3}' > "$Q_DIR/version.txt"
