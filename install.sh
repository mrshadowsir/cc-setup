#!/usr/bin/env bash
# Termux / Linux / Mac launcher:  bash install.sh   (ya ./install.sh)
set -e
cd "$(dirname "$0")"

if [[ "${PREFIX:-}" == *com.termux* ]]; then
  if ! command -v node >/dev/null 2>&1 || ! command -v git >/dev/null 2>&1; then
    echo "[*] Termux: packages update + node/git install..."
    pkg update -y -o Dpkg::Options::=--force-confold
    pkg install -y nodejs-lts git
  fi
fi

if ! command -v node >/dev/null 2>&1; then
  echo "[!] Node.js 18+ nahi mila. Pehle Node install karo, phir dobara chalao."
  exit 1
fi

exec node setup.js "$@"
