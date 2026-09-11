from __future__ import annotations

import base64
import grp
import hashlib
import mimetypes
import os
import pwd
import shutil
import stat
from datetime import datetime
from pathlib import Path
from typing import Iterable

from fastapi import HTTPException

from app.core.errors import api_error

MAX_PREVIEW = 2 * 1024 * 1024
MAX_WRITE = 4 * 1024 * 1024
MAX_UPLOAD = 8 * 1024 * 1024
MAX_SEARCH_RESULTS = 200
MAX_SEARCH_DIRS = 5000
PROTECTED_DELETE = {
    Path('/'), Path('/bin'), Path('/sbin'), Path('/usr'), Path('/etc'), Path('/lib'),
    Path('/lib64'), Path('/boot'), Path('/dev'), Path('/proc'), Path('/sys'), Path('/run')
}
TEXT_SUFFIXES = {
    '.txt', '.py', '.js', '.mjs', '.cjs', '.html', '.htm', '.css', '.json', '.yaml', '.yml',
    '.md', '.sh', '.toml', '.conf', '.ini', '.cfg', '.xml', '.csv', '.sql', '.log'
}


def user_home() -> Path:
    try:
        return Path(pwd.getpwuid(os.getuid()).pw_dir).resolve(strict=False)
    except (KeyError, OSError):
        return Path('/tmp')


def resolve_path(raw: str | None, base: Path | None = None, *, follow_leaf: bool = True) -> Path:
    if raw is None or '\x00' in raw:
        raise api_error(400, 'INVALID_PATH', 'Caminho inválido.')
    raw = raw.strip()
    home = user_home()
    if not raw or raw == '~':
        p = home
    elif raw.startswith('~/'):
        p = home / raw[2:]
    else:
        p = Path(raw)
    if not p.is_absolute():
        p = (base or home) / p
    try:
        if follow_leaf or p == Path('/') or p.name in {'.', '..', ''}:
            return p.resolve(strict=False)
        # Resolve os diretórios pais, mas preserva o último componente. Isso evita
        # que excluir/renomear/copiar um symlink opere acidentalmente no alvo.
        return p.parent.resolve(strict=False) / p.name
    except (OSError, RuntimeError) as exc:
        raise api_error(400, 'INVALID_PATH', 'Não foi possível resolver o caminho.', str(exc))


def _mode_text(mode: int) -> str:
    return stat.filemode(mode)


def _kind(path: Path, st: os.stat_result) -> str:
    if stat.S_ISDIR(st.st_mode):
        return 'directory'
    if stat.S_ISLNK(st.st_mode):
        return 'symlink'
    if stat.S_ISREG(st.st_mode):
        return 'file'
    return 'other'


def _entry(path: Path) -> dict:
    st = path.lstat()
    try:
        owner = pwd.getpwuid(st.st_uid).pw_name
    except KeyError:
        owner = str(st.st_uid)
    try:
        group = grp.getgrgid(st.st_gid).gr_name
    except KeyError:
        group = str(st.st_gid)
    return {
        'name': path.name or str(path),
        'path': str(path),
        'type': _kind(path, st),
        'size': st.st_size,
        'modified': st.st_mtime,
        'modified_iso': datetime.fromtimestamp(st.st_mtime).isoformat(timespec='seconds'),
        'permissions': _mode_text(st.st_mode),
        'mode': stat.S_IMODE(st.st_mode),
        'uid': st.st_uid,
        'gid': st.st_gid,
        'owner': owner,
        'group': group,
        'hidden': path.name.startswith('.'),
        'symlink_target': os.readlink(path) if stat.S_ISLNK(st.st_mode) else None,
    }


def list_dir(raw: str, show_hidden: bool = False) -> dict:
    path = resolve_path(raw)
    if not path.exists():
        raise api_error(404, 'NOT_FOUND', 'Diretório não encontrado.')
    if not path.is_dir():
        raise api_error(400, 'NOT_DIRECTORY', 'O caminho não é um diretório.')
    try:
        items = []
        with os.scandir(path) as it:
            for dent in it:
                if not show_hidden and dent.name.startswith('.'):
                    continue
                try:
                    items.append(_entry(Path(dent.path)))
                except OSError:
                    continue
        items.sort(key=lambda x: (x['type'] != 'directory', x['name'].casefold()))
        return {
            'path': str(path),
            'parent': str(path.parent),
            'items': items,
        }
    except PermissionError:
        raise api_error(403, 'PERMISSION_DENIED', 'Você não possui permissão para listar este diretório.')
    except OSError as exc:
        raise api_error(500, 'FS_ERROR', 'Falha ao listar diretório.', str(exc))


def file_hash(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        while True:
            chunk = f.read(65536)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def read_file(raw: str) -> dict:
    path = resolve_path(raw)
    if not path.exists():
        raise api_error(404, 'NOT_FOUND', 'Arquivo não encontrado.')
    if not path.is_file():
        raise api_error(400, 'NOT_FILE', 'O caminho não é um arquivo regular.')
    try:
        st = path.stat()
        if st.st_size > MAX_PREVIEW:
            raise api_error(413, 'FILE_TOO_LARGE', f'Pré-visualização limitada a {MAX_PREVIEW // 1024 // 1024} MiB.')
        data = path.read_bytes()
        is_text = path.suffix.lower() in TEXT_SUFFIXES or b'\x00' not in data[:4096]
        if not is_text:
            raise api_error(415, 'BINARY_FILE', 'Arquivo binário. Use Download para obter o conteúdo.')
        return {
            'path': str(path),
            'content': data.decode('utf-8', errors='replace'),
            'mtime_ns': st.st_mtime_ns,
            'hash': hashlib.sha256(data).hexdigest(),
            'size': st.st_size,
        }
    except PermissionError:
        raise api_error(403, 'PERMISSION_DENIED', 'Você não possui permissão para ler este arquivo.')
    except HTTPException:
        raise
    except OSError as exc:
        raise api_error(500, 'FS_ERROR', 'Falha ao ler arquivo.', str(exc))


def write_file(raw: str, content: str, expected_mtime_ns: int | None = None, force: bool = False, create_only: bool = False) -> dict:
    path = resolve_path(raw)
    payload = content.encode('utf-8')
    if len(payload) > MAX_WRITE:
        raise api_error(413, 'FILE_TOO_LARGE', f'Escrita limitada a {MAX_WRITE // 1024 // 1024} MiB.')
    if path.exists() and path.is_dir():
        raise api_error(400, 'IS_DIRECTORY', 'Não é possível gravar conteúdo em um diretório.')
    try:
        if path.exists() and create_only:
            raise api_error(409, 'ALREADY_EXISTS', 'Já existe um arquivo com esse caminho.')
        if path.exists() and expected_mtime_ns is not None and not force:
            current = path.stat().st_mtime_ns
            if current != expected_mtime_ns:
                raise api_error(409, 'FILE_CHANGED', 'O arquivo foi modificado fora do editor.')
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_name(f'.{path.name}.pibic-tmp-{os.getpid()}')
        try:
            tmp.write_bytes(payload)
            if path.exists():
                try:
                    shutil.copymode(path, tmp)
                except OSError:
                    pass
            os.replace(tmp, path)
        except PermissionError:
            # Linux may allow writing an existing file while denying creation in
            # its parent directory. In that case preserve normal file semantics.
            try:
                if tmp.exists():
                    tmp.unlink()
            except OSError:
                pass
            if path.exists() and os.access(path, os.W_OK):
                path.write_bytes(payload)
            else:
                raise
        st = path.stat()
        return {'ok': True, 'path': str(path), 'mtime_ns': st.st_mtime_ns, 'hash': hashlib.sha256(payload).hexdigest()}
    except PermissionError:
        raise api_error(403, 'PERMISSION_DENIED', 'Você não possui permissão para alterar este arquivo.')
    except OSError as exc:
        raise api_error(500, 'FS_ERROR', 'Falha ao salvar arquivo.', str(exc))


def mkdir(raw: str) -> dict:
    path = resolve_path(raw)
    try:
        path.mkdir(parents=False, exist_ok=False)
        return {'ok': True, 'path': str(path)}
    except FileExistsError:
        raise api_error(409, 'ALREADY_EXISTS', 'Já existe um item com esse nome.')
    except PermissionError:
        raise api_error(403, 'PERMISSION_DENIED', 'Você não possui permissão para criar esta pasta.')
    except OSError as exc:
        raise api_error(500, 'FS_ERROR', 'Falha ao criar pasta.', str(exc))


def touch(raw: str) -> dict:
    path = resolve_path(raw)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open('x', encoding='utf-8'):
            pass
        return {'ok': True, 'path': str(path)}
    except FileExistsError:
        raise api_error(409, 'ALREADY_EXISTS', 'Já existe um item com esse nome.')
    except PermissionError:
        raise api_error(403, 'PERMISSION_DENIED', 'Você não possui permissão para criar este arquivo.')
    except OSError as exc:
        raise api_error(500, 'FS_ERROR', 'Falha ao criar arquivo.', str(exc))


def rename(src_raw: str, new_name: str) -> dict:
    if not new_name or '/' in new_name or '\x00' in new_name or new_name in {'.', '..'}:
        raise api_error(400, 'INVALID_NAME', 'Nome inválido.')
    src = resolve_path(src_raw, follow_leaf=False)
    dst = resolve_path(str(src.parent / new_name), follow_leaf=False)
    if dst.exists():
        raise api_error(409, 'ALREADY_EXISTS', 'Já existe um item com esse nome.')
    try:
        src.rename(dst)
        return {'ok': True, 'path': str(dst)}
    except FileNotFoundError:
        raise api_error(404, 'NOT_FOUND', 'Item não encontrado.')
    except PermissionError:
        raise api_error(403, 'PERMISSION_DENIED', 'Você não possui permissão para renomear este item.')
    except OSError as exc:
        raise api_error(500, 'FS_ERROR', 'Falha ao renomear item.', str(exc))


def _not_protected_delete(path: Path) -> None:
    if path in PROTECTED_DELETE:
        raise api_error(403, 'PROTECTED_PATH', 'Este caminho é protegido contra exclusão pelo Workspace.')


def delete(raw_paths: Iterable[str]) -> dict:
    deleted: list[str] = []
    for raw in raw_paths:
        path = resolve_path(raw, follow_leaf=False)
        _not_protected_delete(path)
        try:
            if path.is_symlink() or path.is_file():
                path.unlink()
            elif path.is_dir():
                shutil.rmtree(path)
            else:
                path.unlink()
            deleted.append(str(path))
        except FileNotFoundError:
            continue
        except PermissionError:
            raise api_error(403, 'PERMISSION_DENIED', f'Sem permissão para excluir {path}.')
        except OSError as exc:
            raise api_error(500, 'FS_ERROR', f'Falha ao excluir {path}.', str(exc))
    return {'ok': True, 'deleted': deleted}


def copy_items(raw_paths: Iterable[str], destination_raw: str, move: bool = False) -> dict:
    destination = resolve_path(destination_raw)
    if not destination.is_dir():
        raise api_error(400, 'NOT_DIRECTORY', 'O destino precisa ser um diretório.')
    results = []
    for raw in raw_paths:
        src = resolve_path(raw, follow_leaf=False)
        dst = destination / src.name
        if dst.exists():
            raise api_error(409, 'ALREADY_EXISTS', f'Já existe {dst.name} no destino.')
        try:
            if move:
                shutil.move(str(src), str(dst))
            elif src.is_dir():
                shutil.copytree(src, dst, symlinks=True)
            else:
                shutil.copy2(src, dst, follow_symlinks=False)
            results.append(str(dst))
        except PermissionError:
            raise api_error(403, 'PERMISSION_DENIED', f'Sem permissão para operar em {src}.')
        except OSError as exc:
            raise api_error(500, 'FS_ERROR', f'Falha ao operar em {src}.', str(exc))
    return {'ok': True, 'items': results}


def upload_file(directory_raw: str, name: str, content_b64: str) -> dict:
    if not name or '/' in name or '\x00' in name or name in {'.', '..'}:
        raise api_error(400, 'INVALID_NAME', 'Nome de arquivo inválido.')
    directory = resolve_path(directory_raw)
    try:
        data = base64.b64decode(content_b64, validate=True)
    except Exception:
        raise api_error(400, 'INVALID_UPLOAD', 'Conteúdo de upload inválido.')
    if len(data) > MAX_UPLOAD:
        raise api_error(413, 'FILE_TOO_LARGE', f'Upload limitado a {MAX_UPLOAD // 1024 // 1024} MiB.')
    path = resolve_path(str(directory / name))
    if path.exists():
        raise api_error(409, 'ALREADY_EXISTS', 'Já existe um arquivo com esse nome.')
    try:
        path.write_bytes(data)
        return {'ok': True, 'path': str(path), 'size': len(data)}
    except PermissionError:
        raise api_error(403, 'PERMISSION_DENIED', 'Você não possui permissão para enviar arquivo para esta pasta.')
    except OSError as exc:
        raise api_error(500, 'FS_ERROR', 'Falha no upload.', str(exc))


def properties(raw: str) -> dict:
    path = resolve_path(raw, follow_leaf=False)
    try:
        return _entry(path)
    except FileNotFoundError:
        raise api_error(404, 'NOT_FOUND', 'Item não encontrado.')
    except PermissionError:
        raise api_error(403, 'PERMISSION_DENIED', 'Sem permissão para consultar propriedades.')


def search_files(raw: str, query: str, show_hidden: bool = False) -> list[dict]:
    root = resolve_path(raw)
    query = query.strip().casefold()
    if not query:
        return []
    if not root.is_dir():
        raise api_error(400, 'NOT_DIRECTORY', 'A busca precisa iniciar em um diretório.')
    results: list[dict] = []
    visited_dirs = 0
    for current, dirs, files in os.walk(root, topdown=True, followlinks=False):
        visited_dirs += 1
        if visited_dirs > MAX_SEARCH_DIRS:
            break
        if not show_hidden:
            dirs[:] = [d for d in dirs if not d.startswith('.')]
            files = [f for f in files if not f.startswith('.')]
        names = [(name, True) for name in dirs] + [(name, False) for name in files]
        for name, _ in names:
            if query in name.casefold():
                p = Path(current) / name
                try:
                    results.append(_entry(p))
                except OSError:
                    continue
                if len(results) >= MAX_SEARCH_RESULTS:
                    return results
    return results
