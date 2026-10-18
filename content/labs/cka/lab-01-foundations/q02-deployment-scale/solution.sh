set -e
kubectl -n lab1-q2 create deployment api --image=nginx:1.27-alpine --replicas=2
kubectl -n lab1-q2 scale deployment api --replicas=4
kubectl -n lab1-q2 rollout status deployment/api --timeout=120s
