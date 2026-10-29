#!/usr/bin/env bash
# Termux (ya koi bhi bash) launcher - ./install.sh
set -e
cd "$(dirname "$0")"

if [[ "${PREFIX:-}" == *com.termux* ]]; then
  echo "[*] Termux mila - nodejs-lts aur git check kar raha hu..."
  command -v node >/dev/null 2>&1 || pkg install -y nodejs-lts
  command -v git  >/dev/null 2>&1 || pkg install -y git
fi

if ! command -v node >/dev/null 2>&1; then
  echo "[!] Node.js (18+) nahi mila. Pehle Node install karo, phir dobara ./install.sh chalao."
  exit 1
fi

exec node setup.js "$@"
