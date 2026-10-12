#!/usr/bin/env bash
# Deploys the back end on this server (docs/06 6.1, infra/RUNBOOK.md):
#   sudo infra/stack/deploy.sh testnet        # or: mainnet
# 1. pulls the checked-out branch, 2. decrypts the env file with SOPS into memory,
# 3. builds the images, 4. migrates by starting the services, 5. waits until all are healthy,
# 6. checks the API through localhost. Nothing secret is written to disk.
set -euo pipefail

NETWORK="${1:-}"
case "${NETWORK}" in
  testnet | mainnet) ;;
  *)
    echo "usage: $0 testnet|mainnet" >&2
    exit 2
    ;;
esac

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${HERE}/../.." && pwd)"
RUN_DIR=/run/mohonaut # tmpfs: gone at reboot, never on disk
export ENV_FILE="${RUN_DIR}/stack.env"
export SECRETS_DIR="${SECRETS_DIR:-/etc/mohonaut/secrets}"
export DEPLOYMENT_DIR="${ROOT}/deployments"

for f in postgres_password keeper_keystore keeper_password; do
  if [[ ! -s "${SECRETS_DIR}/${f}" ]]; then
    echo "missing ${SECRETS_DIR}/${f} (see infra/RUNBOOK.md)" >&2
    exit 1
  fi
done

echo "== code"
git -C "${ROOT}" pull --ff-only
git -C "${ROOT}" log -1 --format='   %h %s'

echo "== secrets"
install -d -m 0700 "${RUN_DIR}"
umask 077
SOPS_AGE_KEY_FILE="${SOPS_AGE_KEY_FILE:-/etc/mohonaut/age.key}" \
  sops --decrypt --input-type dotenv --output-type dotenv \
  "${HERE}/secrets.${NETWORK}.enc.env" >"${ENV_FILE}"

compose() { docker compose --project-directory "${HERE}" -f "${HERE}/compose.yml" "$@"; }

echo "== build"
compose build --pull

echo "== start"
compose up -d --remove-orphans

echo "== health"
for _ in $(seq 1 60); do
  unhealthy="$(compose ps --format '{{.Service}} {{.Health}} {{.State}}' |
    awk '($2 != "" && $2 != "healthy") || $3 != "running" {print $1}')"
  [[ -z "${unhealthy}" ]] && break
  sleep 5
done
if [[ -n "${unhealthy:-}" ]]; then
  echo "not healthy: ${unhealthy}" >&2
  compose ps
  exit 1
fi

echo "== smoke"
curl -fsS http://127.0.0.1:8787/healthz >/dev/null
curl -fsS http://127.0.0.1:8787/world >/dev/null
curl -fsS http://127.0.0.1:9464/metrics | grep -q '^indexer_block'
echo "deployed ${NETWORK}: $(git -C "${ROOT}" rev-parse --short HEAD)"
