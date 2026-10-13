#!/usr/bin/env bash
# Self-hosted GitHub Actions runners in WSL (Ubuntu) on the founder's machine.
#
# Run it yourself in a WSL terminal (it asks for your sudo password and for the runner
# registration token; neither is stored or printed):
#
#   bash infra/ci-runner/setup-wsl.sh            # 3 runners
#   RUNNERS=2 bash infra/ci-runner/setup-wsl.sh
#
# The token comes from GitHub: repository Settings -> Actions -> Runners -> New self-hosted runner
# (the value after --token). It is valid for one hour. Re-running the script replaces the runners.
set -euo pipefail

REPO_URL="https://github.com/0xBusuzima/mohonaut"
RUNNER_VERSION="2.338.0"
RUNNERS="${RUNNERS:-3}"
BASE="$HOME/actions-runner"
LABELS="self-hosted,linux,x64,mohonaut"

if [ "$(uname -m)" != "x86_64" ]; then
  echo "This script expects x86_64 (WSL on a PC)." >&2
  exit 1
fi

echo "== 1/4 packages (Docker, jq, age, cloud-init, shellcheck)"
sudo apt-get update -qq
sudo apt-get install -y -qq docker.io docker-buildx docker-compose-v2 jq age cloud-init \
  shellcheck curl tar unzip zstd >/dev/null
# The runner (.NET) needs ICU; its own installdependencies.sh does not know new Ubuntu
# releases, so install whichever libicuNN this release ships.
ICU_PKG="$(apt-cache pkgnames | grep -E '^libicu[0-9]+$' | sort -V | tail -1)"
sudo apt-get install -y -qq "$ICU_PKG" >/dev/null
sudo systemctl enable --now docker
if ! id -nG "$USER" | grep -qw docker; then
  sudo usermod -aG docker "$USER"
fi

echo "== 2/4 runner $RUNNER_VERSION"
TARBALL="actions-runner-linux-x64-$RUNNER_VERSION.tar.gz"
mkdir -p "$BASE"
if [ ! -f "$BASE/$TARBALL" ]; then
  curl -fsSL -o "$BASE/$TARBALL" \
    "https://github.com/actions/runner/releases/download/v$RUNNER_VERSION/$TARBALL"
fi
# The release notes publish the SHA-256 of every package; compare against them.
EXPECTED="$(curl -fsSL "https://api.github.com/repos/actions/runner/releases/tags/v$RUNNER_VERSION" \
  | jq -r '.body' | grep -F "linux-x64-$RUNNER_VERSION.tar.gz" | grep -oE '[0-9a-f]{64}' | head -1)"
ACTUAL="$(sha256sum "$BASE/$TARBALL" | cut -d' ' -f1)"
if [ -z "$EXPECTED" ] || [ "$EXPECTED" != "$ACTUAL" ]; then
  echo "Checksum mismatch for $TARBALL (expected '$EXPECTED', got '$ACTUAL')." >&2
  exit 1
fi

echo "== 3/4 job hook (fixes files that container jobs leave owned by root)"
install -m 0755 "$(dirname "$0")/job-started.sh" "$BASE/job-started.sh"

echo "== 4/4 register $RUNNERS runner(s)"
read -r -s -p "Runner registration token (not shown): " TOKEN
echo
for i in $(seq 1 "$RUNNERS"); do
  dir="$BASE/runner-$i"
  if [ -f "$dir/svc.sh" ] && [ -f "$dir/.service" ]; then
    (cd "$dir" && sudo ./svc.sh stop && sudo ./svc.sh uninstall) || true
  fi
  rm -rf "$dir"
  mkdir -p "$dir"
  tar -xzf "$BASE/$TARBALL" -C "$dir"
  (
    cd "$dir"
    ./config.sh --unattended --replace --url "$REPO_URL" --token "$TOKEN" \
      --name "$(hostname)-$i" --labels "$LABELS" --work _work
    echo "ACTIONS_RUNNER_HOOK_JOB_STARTED=$BASE/job-started.sh" >> .env
    sudo ./svc.sh install "$USER"
    sudo ./svc.sh start
  )
done
unset TOKEN

echo
echo "Done: $RUNNERS runner(s) registered with labels $LABELS."
echo "Open a new WSL terminal (docker group) and check: GitHub -> Settings -> Actions -> Runners."
echo "Keep WSL running in the background: infra/ci-runner/keep-wsl-alive.ps1 (Windows)."
