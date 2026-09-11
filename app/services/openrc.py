from __future__ import annotations

import re
import subprocess
from pathlib import Path

from app.core.errors import api_error
from app.services.jobs import job_manager

PRIV_HELPER = '/usr/local/libexec/pibic-workspace-priv'
PROTECTED = {'sshd', 'ssh', 'networking', 'zerotier-one', 'iptables', 'nftables', 'ufw', 'firewalld', 'NetworkManager', 'dhcpcd', 'wpa_supplicant'}
SERVICE_RE = re.compile(r'^[A-Za-z0-9_.-]+$')


def _statuses() -> dict[str, str]:
    result: dict[str, str] = {}
    try:
        p = subprocess.run(['rc-status', '--all'], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=5, shell=False)
        for line in p.stdout.splitlines():
            match = re.match(r'^\s*([^\s]+)\s+\[\s*([^]]+)\s*\]\s*$', line)
            if not match:
                continue
            name, state = match.group(1), match.group(2).strip().lower()
            if 'started' in state or 'running' in state:
                result[name] = 'running'
            elif 'stopped' in state or 'crashed' in state:
                result[name] = 'stopped'
            else:
                result[name] = state or 'unknown'
    except Exception:
        pass
    return result

def _runlevels() -> dict[str, list[str]]:
    result: dict[str, list[str]] = {}
    try:
        p = subprocess.run(['rc-update', 'show'], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, timeout=5, shell=False)
        for line in p.stdout.splitlines():
            if '|' not in line:
                continue
            name, levels = line.split('|', 1)
            result[name.strip()] = [x for x in levels.split() if x]
    except Exception:
        pass
    return result


def list_services() -> list[dict]:
    initd = Path('/etc/init.d')
    levels = _runlevels()
    statuses = _statuses()
    rows = []
    if not initd.exists():
        return rows
    for path in sorted(initd.iterdir(), key=lambda p: p.name.casefold()):
        if not path.is_file() and not path.is_symlink():
            continue
        name = path.name
        rows.append({
            'name': name,
            'status': statuses.get(name, 'unknown'),
            'runlevels': levels.get(name, []),
            'protected': name in PROTECTED,
        })
    return rows


def service_action(name: str, action: str) -> dict:
    if not SERVICE_RE.fullmatch(name) or not (Path('/etc/init.d') / name).exists():
        raise api_error(400, 'INVALID_SERVICE', 'Serviço inválido.')
    if name in PROTECTED:
        raise api_error(403, 'PROTECTED_SERVICE', 'Este serviço é protegido para preservar o acesso remoto.')
    if action not in {'start', 'stop', 'restart', 'enable', 'disable'}:
        raise api_error(400, 'INVALID_ACTION', 'Ação de serviço inválida.')
    display = f"rc-service {name} {action}" if action in {'start','stop','restart'} else f"rc-update {'add' if action == 'enable' else 'del'} {name} default"
    job = job_manager.create(f'{action.title()} {name}', display, ['doas', '-n', PRIV_HELPER, 'service', action, name])
    return job.public()
