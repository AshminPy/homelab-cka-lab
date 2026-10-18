set -e
kubectl -n lab1-q3 expose deployment shop --name=shop --type=ClusterIP --port=80 --target-port=80
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Service
metadata:
  name: shop-np
  namespace: lab1-q3
spec:
  type: NodePort
  selector:
    app: shop
  ports:
    - port: 80
      targetPort: 80
      nodePort: 30080
EOF

# Wait until both Services list the two ready Pods.
ready() {
  kubectl -n lab1-q3 get endpointslices -l "kubernetes.io/service-name=$1" \
    -o jsonpath='{range .items[*].endpoints[*]}{.conditions.ready}{"\n"}{end}' | grep -c '^true$' || true
}
for i in $(seq 1 60); do
  if [[ "$(ready shop)" == 2 && "$(ready shop-np)" == 2 ]]; then exit 0; fi
  sleep 2
done
echo "Services did not get 2 ready endpoints in time" >&2
exit 1
