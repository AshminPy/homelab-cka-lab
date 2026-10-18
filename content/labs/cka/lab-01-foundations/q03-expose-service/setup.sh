set -e
ensure_ns lab1-q3
kubectl -n lab1-q3 create deployment shop --image=nginx:1.27-alpine --replicas=2 --port=80 \
  --dry-run=client -o yaml | kubectl apply -f - >/dev/null
kubectl -n lab1-q3 rollout status deployment/shop --timeout=120s >/dev/null
