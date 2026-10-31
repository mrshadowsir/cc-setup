#!/usr/bin/env bash
# Termux / Linux / Mac launcher:  bash install.sh
cd "$(dirname "$0")" || exit 1

have() { command -v "$1" >/dev/null 2>&1; }

if [[ "${PREFIX:-}" == *com.termux* ]]; then
  if ! have node || ! have npm || ! have git; then
    echo "[*] Termux: zaruri packages install ho rahe hain (node, npm, git)..."
    pkg update -y -o Dpkg::Options::=--force-confold || { echo "[!] pkg update fail. Pehle chalao: termux-change-repo (mirror badlo), phir dobara bash install.sh"; exit 1; }
    pkg install -y nodejs-lts git curl || { echo "[!] pkg install fail. termux-change-repo se mirror badlo, phir dobara."; exit 1; }
  fi
fi

for c in node npm git; do
  have "$c" || { echo "[!] '$c' nahi mila. Install karo, phir dobara: bash install.sh"; exit 1; }
done
node -e 'process.exit(parseInt(process.versions.node,10)>=18?0:1)' || { echo "[!] Node 18+ chahiye (abhi: $(node -v))"; exit 1; }

exec node setup.js "$@"
