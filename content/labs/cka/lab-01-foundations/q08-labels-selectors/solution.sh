set -e
kubectl -n lab1-q8 label pods -l env=prod,tier=db critical=true
kubectl -n lab1-q8 delete pods -l env=test --wait=true --timeout=120s
kubectl -n lab1-q8 get pods -l tier=web -o name | sed 's|^pod/||' | sort > "$Q_DIR/web-pods.txt"
