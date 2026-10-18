set -e
reset_qdir
ensure_ns lab1-q8

# name env tier
pods="alpha:prod:db bravo:test:web charlie:prod:web delta:prod:db echo:test:db foxtrot:prod:web"
for entry in $pods; do
  name=${entry%%:*}
  rest=${entry#*:}
  env=${rest%%:*}
  tier=${rest#*:}
  kubectl apply -f - >/dev/null <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: $name
  namespace: lab1-q8
  labels:
    env: $env
    tier: $tier
spec:
  terminationGracePeriodSeconds: 1
  containers:
    - name: app
      image: busybox:1.37
      command: ["sleep", "3600"]
EOF
done
kubectl -n lab1-q8 wait --for=condition=Ready pod --all --timeout=120s >/dev/null
