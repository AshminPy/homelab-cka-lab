# Helpers sourced by every check, setup, cleanup and solution script.
# Must work on macOS /bin/bash 3.2: no associative arrays, no ${var,,}, no `set -u` with empty arrays.
#
# Environment provided by the app:
#   KUBECONFIG  single-context kubeconfig for the practice target
#   COURSE_DIR  root for answer files (default /tmp/course)
#   Q_DIR       this question's answer folder, e.g. /tmp/course/3
#   NODE_CONTROLPLANE, NODE_WORKER1, NODE_WORKER2 ...  node names for the target
#   LAB_NODES, LAB_NODE_SHELL, LAB_NODE_EXEC           used by bin/node-shell

# kubectl shorthand (aliases don't expand in non-interactive bash).
k() { kubectl "$@"; }

# jp <namespace> <resource> <name> <jsonpath>  -> prints the value ('' if missing)
jp() {
  kubectl -n "$1" get "$2" "$3" -o "jsonpath=$4" 2>/dev/null
}

# expect_eq <actual> <expected>  -> fails with a readable message
expect_eq() {
  if [[ "$1" == "$2" ]]; then return 0; fi
  echo "expected '$2', got '$1'"
  return 1
}

# jp_eq <namespace> <resource> <name> <jsonpath> <expected>
jp_eq() {
  expect_eq "$(jp "$1" "$2" "$3" "$4")" "$5"
}

# exists <namespace> <resource> <name>
exists() {
  kubectl -n "$1" get "$2" "$3" >/dev/null 2>&1
}

# count <namespace> <resource> [selector]  -> prints the number of objects
count() {
  if [[ -n "${3:-}" ]]; then
    kubectl -n "$1" get "$2" -l "$3" --no-headers 2>/dev/null | grep -c .
  else
    kubectl -n "$1" get "$2" --no-headers 2>/dev/null | grep -c .
  fi
}

# svc_ready_endpoints <namespace> <service>  -> prints the number of ready endpoints behind a Service
svc_ready_endpoints() {
  kubectl -n "$1" get endpointslices -l "kubernetes.io/service-name=$2" \
    -o jsonpath='{range .items[*].endpoints[*]}{.conditions.ready}{"\n"}{end}' 2>/dev/null | grep -c '^true$'
}

# pod_ready <namespace> <pod> [timeout]  -> waits briefly for Ready
pod_ready() {
  kubectl -n "$1" wait --for=condition=Ready "pod/$2" --timeout="${3:-10s}" >/dev/null 2>&1
}

# rollout_done <namespace> <deployment> [timeout]
rollout_done() {
  kubectl -n "$1" rollout status "deployment/$2" --timeout="${3:-10s}" >/dev/null 2>&1
}

# file_exists <path>
file_exists() {
  if [[ -s "$1" ]]; then return 0; fi
  echo "file $1 is missing or empty"
  return 1
}

# file_trim <path>  -> file content without surrounding whitespace / blank lines
file_trim() {
  sed -e 's/[[:space:]]*$//' "$1" 2>/dev/null | sed -e '/^$/d'
}

# file_eq <path> <expected>  -> trimmed content equals expected (expected may contain newlines)
file_eq() {
  file_exists "$1" || return 1
  expect_eq "$(file_trim "$1")" "$2"
}

# file_has <path> <extended-regex>
file_has() {
  file_exists "$1" || return 1
  if grep -Eq -- "$2" "$1"; then return 0; fi
  echo "file $1 does not match /$2/"
  return 1
}

# ensure_ns <namespace>...  -> create if missing (idempotent)
ensure_ns() {
  local ns
  for ns in "$@"; do
    kubectl create namespace "$ns" --dry-run=client -o yaml | kubectl apply -f - >/dev/null
  done
}

# delete_ns <namespace>...  -> delete and wait (idempotent)
delete_ns() {
  kubectl delete namespace "$@" --ignore-not-found --wait=true --timeout=120s >/dev/null
}

# reset_qdir  -> empty this question's answer folder (only ever inside COURSE_DIR)
reset_qdir() {
  if [[ -z "${Q_DIR:-}" || -z "${COURSE_DIR:-}" || "$Q_DIR" != "$COURSE_DIR"/* ]]; then
    echo "refusing to reset Q_DIR='${Q_DIR:-}'" >&2
    return 1
  fi
  rm -rf "$Q_DIR"
  mkdir -p "$Q_DIR"
}

# on_node <node> <command...>  -> run a command on a cluster node (non-interactive)
on_node() {
  node-shell "$1" -- "${@:2}"
}
