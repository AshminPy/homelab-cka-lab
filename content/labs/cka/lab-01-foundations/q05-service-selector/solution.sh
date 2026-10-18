set -e
kubectl -n lab1-q5 patch service payments -p '{"spec":{"selector":{"app":"payments"}}}'

# Wait until the Service lists both ready Pods.
for i in $(seq 1 60); do
  n=$(kubectl -n lab1-q5 get endpointslices -l kubernetes.io/service-name=payments \
    -o jsonpath='{range .items[*].endpoints[*]}{.conditions.ready}{"\n"}{end}' | grep -c '^true$' || true)
  if [[ "$n" == 2 ]]; then exit 0; fi
  sleep 2
done
echo "Service payments did not get 2 ready endpoints in time" >&2
exit 1
