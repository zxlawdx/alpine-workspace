#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$ROOT"

echo "Atualizando Alpine Workspace a partir do GitHub..."
git pull --ff-only

if [ "$(id -u)" -eq 0 ]; then
    sh deploy/apply.sh
elif command -v doas >/dev/null 2>&1; then
    doas sh deploy/apply.sh
elif command -v sudo >/dev/null 2>&1; then
    sudo sh deploy/apply.sh
else
    echo "[ERRO] Preciso de root para aplicar em /opt/pibic-workspace."
    exit 1
fi
