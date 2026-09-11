from __future__ import annotations

import json
import shutil
import subprocess

from app.core.errors import api_error
from app.services.jobs import job_manager

PRIV_HELPER = '/usr/local/libexec/pibic-workspace-priv'


def docker_installed() -> bool:
    return shutil.which('docker') is not None


def _run_helper(args: list[str], timeout: int = 10) -> tuple[int, str]:
    try:
        p = subprocess.run(['doas', '-n', PRIV_HELPER, 'docker', *args], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=timeout, shell=False)
        return p.returncode, p.stdout.strip()
    except (OSError, subprocess.TimeoutExpired) as exc:
        return 1, str(exc)


def docker_overview() -> dict:
    if not docker_installed():
        return {'installed': False, 'daemon': False, 'error': None}
    rc, out = _run_helper(['info'])
    return {'installed': True, 'daemon': rc == 0, 'server_version': out if rc == 0 else None, 'error': None if rc == 0 else out}


def containers() -> list[dict]:
    if not docker_installed():
        return []
    rc, out = _run_helper(['containers'])
    if rc != 0:
        return []
    rows = []
    for line in out.splitlines():
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        rows.append({
            'id': obj.get('ID', ''),
            'name': obj.get('Names', ''),
            'image': obj.get('Image', ''),
            'state': obj.get('State', ''),
            'status': obj.get('Status', ''),
            'ports': obj.get('Ports', ''),
        })
    return rows


def resources(kind: str) -> list[dict]:
    if kind not in {'images', 'volumes', 'networks'}:
        raise api_error(400, 'INVALID_DOCKER_RESOURCE', 'Recurso Docker inválido.')
    if not docker_installed():
        return []
    rc, out = _run_helper([kind])
    if rc != 0:
        return []
    rows = []
    for line in out.splitlines():
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            pass
    return rows


def container_action(container: str, action: str) -> dict:
    _validate_container(container)
    if action not in {'start', 'stop', 'restart'}:
        raise api_error(400, 'INVALID_ACTION', 'Ação Docker inválida.')
    if not docker_installed():
        raise api_error(404, 'DOCKER_NOT_INSTALLED', 'Docker não está instalado.')
    argv = ['doas', '-n', PRIV_HELPER, 'docker', 'action', action, container]
    job = job_manager.create(f'{action.title()} container', f'docker {action} {container}', argv)
    return job.public()


def container_logs(container: str, tail: int = 300) -> str:
    _validate_container(container)
    tail = max(10, min(int(tail), 2000))
    rc, out = _run_helper(['logs', container, str(tail)], timeout=12)
    if rc != 0:
        raise api_error(400, 'DOCKER_ERROR', 'Não foi possível ler os logs do container.', out[-1000:])
    return out[-256 * 1024:]


def docker_exec_command(container: str) -> list[str]:
    _validate_container(container)
    return ['doas', '-n', PRIV_HELPER, 'docker', 'exec', container]


def _validate_container(container: str) -> None:
    if not container or len(container) > 128 or container.startswith('-') or any(c.isspace() for c in container):
        raise api_error(400, 'INVALID_CONTAINER', 'Container inválido.')
