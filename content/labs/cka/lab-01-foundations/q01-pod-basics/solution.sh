set -e
kubectl -n lab1-q1 run web --image=nginx:1.27-alpine --labels=tier=frontend --port=80
kubectl -n lab1-q1 wait --for=condition=Ready pod/web --timeout=120s
