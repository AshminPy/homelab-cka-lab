set -e
ensure_ns lab1-q5
kubectl apply -f - >/dev/null <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: payments
  namespace: lab1-q5
  labels:
    app: payments
spec:
  replicas: 2
  selector:
    matchLabels:
      app: payments
  template:
    metadata:
      labels:
        app: payments
    spec:
      containers:
        - name: nginx
          image: nginx:1.27-alpine
          ports:
            - containerPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: payments
  namespace: lab1-q5
spec:
  type: ClusterIP
  selector:
    app: payment
  ports:
    - port: 80
      targetPort: 80
EOF
kubectl -n lab1-q5 rollout status deployment/payments --timeout=120s >/dev/null
