set -e
reset_qdir
ensure_ns lab1-q4
kubectl apply -f - >/dev/null <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: broken-web
  namespace: lab1-q4
  labels:
    app: broken-web
spec:
  containers:
    - name: web
      image: nginx:1.27-alpne
      ports:
        - containerPort: 80
EOF

# Wait until the pull error is visible, so the learner sees it straight away.
for i in $(seq 1 60); do
  reason=$(kubectl -n lab1-q4 get pod broken-web -o jsonpath='{.status.containerStatuses[0].state.waiting.reason}' 2>/dev/null || true)
  case "$reason" in
    ErrImagePull|ImagePullBackOff) exit 0 ;;
  esac
  sleep 2
done
echo "Pod broken-web did not reach ErrImagePull/ImagePullBackOff in time (last reason: '$reason')" >&2
exit 1
