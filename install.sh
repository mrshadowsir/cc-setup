#!/usr/bin/env bash
# Termux / Linux:  bash install.sh   (baad me sirf: ccs)
# Seedha:  curl -fsSL https://raw.githubusercontent.com/mrshadowsir/cc-setup/main/install.sh | bash
REPO="mrshadowsir/cc-setup"
DEST="$HOME/cc-setup"
have() { command -v "$1" >/dev/null 2>&1; }

if [[ "${PREFIX:-}" == *com.termux* ]]; then
  BIN="$PREFIX/bin"
  need=""
  have node || need="$need nodejs-lts"
  have git  || need="$need git"
  have curl || need="$need curl"
  if [ -n "$need" ]; then
    echo "[*] install ho raha hai:$need"
    pkg update -y -o Dpkg::Options::=--force-confold || { echo "[!] termux-change-repo chalao, mirror badlo, phir dobara"; exit 1; }
    pkg install -y $need || exit 1
  fi
else
  BIN="$HOME/.local/bin"; mkdir -p "$BIN"
fi

have node || { echo "[!] node nahi mila"; exit 1; }
node -e 'process.exit(parseInt(process.versions.node,10)>=18?0:1)' || { echo "[!] Node 18+ chahiye"; exit 1; }

# Files kahan hain? (curl se chalaya ho to GitHub se laao)
SRC="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd)"
if [ ! -f "$SRC/cc.js" ]; then
  if [ -d "$DEST/.git" ]; then git -C "$DEST" pull --ff-only || git -C "$DEST" fetch --depth 1 origin main && git -C "$DEST" reset --hard FETCH_HEAD
  else git clone --depth 1 "https://github.com/$REPO" "$DEST" || exit 1; fi
  SRC="$DEST"
fi

# 'cc' naam clang ka hai, isliye command ka naam: ccs
printf '#!/bin/sh\nexec node "%s/cc.js" "$@"\n' "$SRC" > "$BIN/ccs"
chmod +x "$BIN/ccs"
echo "[ok] command ban gaya: ccs"
echo "     Ab har baar sirf likho:  ccs"
case ":$PATH:" in *":$BIN:"*) ;; *) echo "[!] $BIN ko PATH me jodo: export PATH=\"$BIN:\$PATH\"" ;; esac
exec node "$SRC/cc.js"
