from __future__ import annotations

import subprocess
from dataclasses import dataclass

from app.core.errors import api_error
from app.services.jobs import job_manager

PRIV_HELPER = '/usr/local/libexec/pibic-workspace-priv'

PACKAGES: dict[str, dict] = {
    'git': {'name': 'Git', 'description': 'Controle de versão distribuído.', 'packages': ['git']},
    'python': {'name': 'Python', 'description': 'Interpretador Python 3.', 'packages': ['python3', 'py3-pip']},
    'pip': {'name': 'pip', 'description': 'Gerenciador de pacotes Python.', 'packages': ['py3-pip']},
    'docker': {'name': 'Docker', 'description': 'Engine de containers.', 'packages': ['docker']},
    'compose': {'name': 'Docker Compose', 'description': 'Compose plugin/CLI para Docker.', 'packages': ['docker-cli-compose']},
    'postgresql': {'name': 'PostgreSQL', 'description': 'Banco de dados relacional e cliente.', 'packages': ['postgresql', 'postgresql-client']},
    'nginx': {'name': 'Nginx', 'description': 'Servidor web e proxy reverso.', 'packages': ['nginx']},
    'curl': {'name': 'curl', 'description': 'Cliente HTTP de linha de comando.', 'packages': ['curl']},
    'wget': {'name': 'wget', 'description': 'Cliente para downloads HTTP/HTTPS.', 'packages': ['wget']},
    'nano': {'name': 'nano', 'description': 'Editor de texto simples.', 'packages': ['nano']},
    'vim': {'name': 'Vim', 'description': 'Editor de texto modal.', 'packages': ['vim']},
    'htop': {'name': 'htop', 'description': 'Monitor interativo de processos.', 'packages': ['htop']},
    'nodejs': {'name': 'Node.js', 'description': 'Runtime JavaScript.', 'packages': ['nodejs']},
    'npm': {'name': 'npm', 'description': 'Gerenciador de pacotes Node.js.', 'packages': ['npm']},
}


def _run_capture(argv: list[str]) -> tuple[int, str]:
    try:
        p = subprocess.run(argv, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=8, shell=False)
        return p.returncode, p.stdout.strip()
    except (OSError, subprocess.TimeoutExpired) as exc:
        return 1, str(exc)


def _installed_version(pkg: str) -> str | None:
    rc, _ = _run_capture(['apk', 'info', '-e', pkg])
    if rc != 0:
        return None
    rc, out = _run_capture(['apk', 'info', '-v', pkg])
    if rc != 0 or not out:
        return 'instalado'
    first = out.splitlines()[0]
    prefix = f'{pkg}-'
    return first[len(prefix):] if first.startswith(prefix) else first


def list_packages() -> list[dict]:
    rows = []
    for key, item in PACKAGES.items():
        versions = [_installed_version(pkg) for pkg in item['packages']]
        installed = all(v is not None for v in versions)
        rows.append({
            'id': key,
            'name': item['name'],
            'description': item['description'],
            'packages': item['packages'],
            'installed': installed,
            'installed_version': ', '.join(v for v in versions if v) if installed else None,
            'protected': key in {'python', 'pip'},
        })
    return rows


def package_action(package_id: str, action: str) -> dict:
    if package_id not in PACKAGES:
        raise api_error(400, 'PACKAGE_NOT_ALLOWED', 'Pacote não permitido pelo catálogo do Workspace.')
    if action not in {'install', 'remove', 'update'}:
        raise api_error(400, 'INVALID_ACTION', 'Ação de pacote inválida.')
    if action == 'remove' and package_id in {'python', 'pip'}:
        raise api_error(403, 'PROTECTED_PACKAGE', 'Python e pip são protegidos porque o Workspace depende deles.')
    title = f"{action.title()} {PACKAGES[package_id]['name']}"
    display = {
        'install': f"apk add --no-cache {' '.join(PACKAGES[package_id]['packages'])}",
        'remove': f"apk del {' '.join(PACKAGES[package_id]['packages'])}",
        'update': f"apk upgrade {' '.join(PACKAGES[package_id]['packages'])}",
    }[action]
    job = job_manager.create(title, display, ['doas', '-n', PRIV_HELPER, 'package', action, package_id])
    return job.public()
