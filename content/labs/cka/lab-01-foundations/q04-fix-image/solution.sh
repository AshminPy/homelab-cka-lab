set -e
kubectl -n lab1-q4 get pod broken-web --no-headers | awk '{print $3}' > "$Q_DIR/reason.txt"
kubectl -n lab1-q4 set image pod/broken-web web=nginx:1.27-alpine
kubectl -n lab1-q4 wait --for=condition=Ready pod/broken-web --timeout=120s
