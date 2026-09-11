#!/bin/sh
set -eu

if [ "$(id -u)" -ne 0 ]; then
    echo "Execute este script com doas: doas sh ./update-local.sh"
    exit 1
fi

REPO_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
TARGET="/opt/pibic-workspace"
BACKUP_ROOT="/opt/pibic-workspace-backups"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$BACKUP_ROOT/$STAMP"

if [ ! -d "$REPO_DIR/app" ] || [ ! -d "$REPO_DIR/web" ]; then
    echo "[ERRO] Execute o script a partir de um checkout completo do alpine-workspace."
    exit 1
fi

if [ ! -d "$TARGET" ]; then
    echo "[ERRO] $TARGET nao existe. Este script atualiza uma instalacao existente."
    exit 1
fi

mkdir -p "$BACKUP"

echo "=================================================="
echo "ALPINE WORKSPACE - UPDATE LOCAL"
echo "=================================================="
echo "Repositorio: $REPO_DIR"
echo "Destino:     $TARGET"
echo "Backup:      $BACKUP"
echo
echo "SSH, porta 22, rede, DNS, firewall e ZeroTier nao serao alterados."
echo

echo "[1/5] Criando backup..."
cp -a "$TARGET/app" "$BACKUP/app"
cp -a "$TARGET/web" "$BACKUP/web"
[ -f "$TARGET/VERSION" ] && cp -a "$TARGET/VERSION" "$BACKUP/VERSION" || true

echo "[2/5] Sincronizando codigo..."
mkdir -p "$TARGET/app" "$TARGET/web"
cp -a "$REPO_DIR/app/." "$TARGET/app/"
cp -a "$REPO_DIR/web/." "$TARGET/web/"
cp -a "$REPO_DIR/VERSION" "$TARGET/VERSION"
[ -f "$REPO_DIR/requirements.txt" ] && cp -a "$REPO_DIR/requirements.txt" "$TARGET/requirements.txt" || true

rollback() {
    echo
    echo "[ERRO] Atualizacao falhou. Restaurando backup..."
    rm -rf "$TARGET/app" "$TARGET/web"
    cp -a "$BACKUP/app" "$TARGET/app"
    cp -a "$BACKUP/web" "$TARGET/web"
    [ -f "$BACKUP/VERSION" ] && cp -a "$BACKUP/VERSION" "$TARGET/VERSION" || true
    rc-service pibic-workspace restart >/dev/null 2>&1 || true
    echo "Rollback concluido."
    exit 1
}

trap rollback HUP INT TERM

echo "[3/5] Validando Python..."
python3 -m compileall -q "$TARGET/app" || rollback

if command -v node >/dev/null 2>&1; then
    node --check "$TARGET/web/js/alpinews-v4.js" >/dev/null 2>&1 || rollback
fi

echo "[4/5] Reiniciando somente o Workspace..."
rc-service pibic-workspace restart || rollback
sleep 2

echo "[5/5] Health check..."
if ! wget -qO- -T 4 http://127.0.0.1:8765/api/health | grep -q '"ok"'; then
    rollback
fi

trap - HUP INT TERM

echo
echo "Atualizacao aplicada com sucesso."
echo "Versao: $(cat "$TARGET/VERSION" 2>/dev/null || echo desconhecida)"
echo "Workspace: http://127.0.0.1:8765"
echo "A VM nao foi reiniciada."
echo "SSH, rede e ZeroTier permaneceram fora desta atualizacao."
