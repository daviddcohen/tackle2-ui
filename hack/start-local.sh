#!/bin/bash
set -euo pipefail

DRIVER="podman"
NAMESPACE="konveyor-tackle"
OLM_VERSION="v0.28.0"

echo "==> Checking minikube status..."
STATUS=$(minikube status --format='{{.Host}}' 2>/dev/null || echo "Stopped")

if [ "$STATUS" = "Running" ]; then
  echo "==> minikube already running"
else
  echo "==> Starting minikube..."
  minikube config set memory 9500 2>/dev/null || true
  minikube config set cpus 4 2>/dev/null || true
  minikube start --driver="$DRIVER" --addons=dashboard --addons=ingress
fi

kubectl config use-context minikube >/dev/null 2>&1

if kubectl get namespace "$NAMESPACE" >/dev/null 2>&1; then
  echo "==> Konveyor namespace exists, checking pods..."
  kubectl rollout status deployment/tackle-hub -n "$NAMESPACE" --timeout=120s 2>/dev/null && \
  kubectl rollout status deployment/tackle-ui -n "$NAMESPACE" --timeout=120s 2>/dev/null && \
  echo "==> Hub and UI already running" || {
    echo "==> Pods not ready, restarting deployments..."
    kubectl rollout restart deployment -n "$NAMESPACE"
    kubectl rollout status deployment/tackle-hub -n "$NAMESPACE" --timeout=180s
    kubectl rollout status deployment/tackle-ui -n "$NAMESPACE" --timeout=180s
  }
else
  echo "==> Fresh cluster — installing OLM..."
  curl -sL "https://github.com/operator-framework/operator-lifecycle-manager/releases/download/${OLM_VERSION}/install.sh" | bash -s "$OLM_VERSION"

  echo "==> Installing Konveyor operator..."
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  "$SCRIPT_DIR/setup-operator.sh"
fi

echo ""
echo "==> Verifying hub API..."
kubectl exec -n "$NAMESPACE" deploy/tackle-hub -- curl -sf http://localhost:8080/applications >/dev/null 2>&1 \
  && echo "    Hub API: OK" \
  || echo "    Hub API: FAILED"

echo ""
echo "==> Ready! Start the dev server with:"
echo "    cd $(dirname "$(cd "$(dirname "$0")" && pwd)") && npm run start:dev"
echo ""
echo "    UI will be at: http://localhost:9000"
