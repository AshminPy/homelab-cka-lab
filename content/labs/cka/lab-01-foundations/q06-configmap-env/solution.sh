set -e
kubectl -n lab1-q6 create configmap app-config --from-literal=LOG_LEVEL=debug --from-literal=MODE=blue
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: reader
  namespace: lab1-q6
spec:
  terminationGracePeriodSeconds: 1
  containers:
    - name: reader
      image: busybox:1.37
      command: ["sleep", "3600"]
      env:
        - name: LOG_LEVEL
          valueFrom:
            configMapKeyRef:
              name: app-config
              key: LOG_LEVEL
      volumeMounts:
        - name: config
          mountPath: /etc/app
  volumes:
    - name: config
      configMap:
        name: app-config
EOF
kubectl -n lab1-q6 wait --for=condition=Ready pod/reader --timeout=120s
