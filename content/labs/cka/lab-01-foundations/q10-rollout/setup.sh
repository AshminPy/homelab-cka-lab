set -e
reset_qdir
ensure_ns lab1-q10
kubectl -n lab1-q10 create deployment frontend --image=nginx:1.26-alpine --replicas=3 --port=80 \
  --dry-run=client -o yaml | kubectl apply -f - >/dev/null
kubectl -n lab1-q10 rollout status deployment/frontend --timeout=120s >/dev/null
