set -e
container=$(kubectl -n lab1-q10 get deployment frontend -o jsonpath='{.spec.template.spec.containers[0].name}')
kubectl -n lab1-q10 set image deployment/frontend "$container=nginx:1.27-alpine"
kubectl -n lab1-q10 rollout status deployment/frontend --timeout=120s
kubectl -n lab1-q10 get deployment frontend -o jsonpath='{.metadata.annotations.deployment\.kubernetes\.io/revision}' > "$Q_DIR/revision.txt"
