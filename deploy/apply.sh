#!/bin/sh
set -eu

REPO_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
TARGET="/opt/pibic-workspace"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="/opt/pibic-workspace-backups/git-$STAMP"
TMP_APP="$TARGET/.app.new.$STAMP"
TMP_WEB="$TARGET/.web.new.$STAMP"

if [ "$(id -u)" -ne 0 ]; then
    echo "[ERRO] Rode com doas: doas sh deploy/apply.sh"
    exit 1
fi

if [ ! -d "$REPO_DIR/app" ] || [ ! -d "$REPO_DIR/web" ]; then
    echo "[ERRO] Estrutura app/web nao encontrada em $REPO_DIR"
    exit 1
fi

mkdir -p "$BACKUP" "$TARGET"

cleanup() {
    rm -rf "$TMP_APP" "$TMP_WEB" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "=================================================="
echo "ALPINE WORKSPACE - APLICAR REPOSITORIO"
echo "=================================================="
echo "Origem: $REPO_DIR"
echo "Destino: $TARGET"
echo "Backup: $BACKUP"
echo

[ -d "$TARGET/app" ] && cp -a "$TARGET/app" "$BACKUP/app"
[ -d "$TARGET/web" ] && cp -a "$TARGET/web" "$BACKUP/web"
[ -f "$TARGET/VERSION" ] && cp -a "$TARGET/VERSION" "$BACKUP/VERSION"

cp -a "$REPO_DIR/app" "$TMP_APP"
cp -a "$REPO_DIR/web" "$TMP_WEB"

python3 -m py_compile "$TMP_APP/main.py" "$TMP_APP/core/security.py" "$TMP_APP/services/system_info.py"

rm -rf "$TARGET/app.old.$STAMP" "$TARGET/web.old.$STAMP"
[ -d "$TARGET/app" ] && mv "$TARGET/app" "$TARGET/app.old.$STAMP"
[ -d "$TARGET/web" ] && mv "$TARGET/web" "$TARGET/web.old.$STAMP"
mv "$TMP_APP" "$TARGET/app"
mv "$TMP_WEB" "$TARGET/web"

[ -f "$REPO_DIR/VERSION" ] && cp "$REPO_DIR/VERSION" "$TARGET/VERSION"
[ -f "$REPO_DIR/requirements.txt" ] && cp "$REPO_DIR/requirements.txt" "$TARGET/requirements.txt"
chown -R law:law "$TARGET/app" "$TARGET/web" "$TARGET/VERSION" 2>/dev/null || true

rollback() {
    echo "[ERRO] Workspace nao voltou. Restaurando backup..."
    rc-service pibic-workspace stop 2>/dev/null || true
    rm -rf "$TARGET/app" "$TARGET/web"
    [ -d "$BACKUP/app" ] && cp -a "$BACKUP/app" "$TARGET/app"
    [ -d "$BACKUP/web" ] && cp -a "$BACKUP/web" "$TARGET/web"
    [ -f "$BACKUP/VERSION" ] && cp -a "$BACKUP/VERSION" "$TARGET/VERSION"
    chown -R law:law "$TARGET/app" "$TARGET/web" 2>/dev/null || true
    rc-service pibic-workspace start 2>/dev/null || true
    exit 1
}

rc-service pibic-workspace restart || rollback
sleep 2

HEALTH="$(wget -qO- -T 4 http://127.0.0.1:8765/api/health 2>/dev/null || true)"
echo "$HEALTH" | grep -q '"ok"[[:space:]]*:[[:space:]]*true' || rollback

rm -rf "$TARGET/app.old.$STAMP" "$TARGET/web.old.$STAMP"

echo
echo "Aplicacao atualizada com sucesso."
echo "Health: $HEALTH"
echo "A VM, SSH, rede e ZeroTier nao foram reiniciados/alterados."
echo "Atualize o navegador uma vez para carregar os assets v4.1."
