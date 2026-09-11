from __future__ import annotations

from pathlib import Path

from app.core.errors import api_error

SOURCES = {
    'workspace': Path('/var/log/pibic-workspace.log'),
    'system': Path('/var/log/messages'),
}


def available_sources() -> list[dict]:
    rows = []
    for key, path in SOURCES.items():
        rows.append({'id': key, 'path': str(path), 'available': path.exists() and path.is_file()})
    return rows


def tail_file(source: str, lines: int = 300) -> dict:
    if source not in SOURCES:
        raise api_error(400, 'INVALID_LOG_SOURCE', 'Fonte de log inválida.')
    path = SOURCES[source]
    lines = max(20, min(int(lines), 2000))
    if not path.exists():
        return {'source': source, 'path': str(path), 'content': '', 'available': False}
    try:
        with path.open('rb') as f:
            f.seek(0, 2)
            pos = f.tell()
            block = 8192
            data = b''
            while pos > 0 and data.count(b'\n') <= lines:
                read_size = min(block, pos)
                pos -= read_size
                f.seek(pos)
                data = f.read(read_size) + data
                if len(data) > 512 * 1024:
                    break
        text = data.decode('utf-8', errors='replace').splitlines()[-lines:]
        return {'source': source, 'path': str(path), 'content': '\n'.join(text), 'available': True}
    except PermissionError:
        raise api_error(403, 'PERMISSION_DENIED', 'Sem permissão para ler este log.')
    except OSError as exc:
        raise api_error(500, 'LOG_ERROR', 'Falha ao ler log.', str(exc))
