from __future__ import annotations

import json
import os
import pwd
import shutil
import subprocess
from pathlib import Path


_PSEUDO_FS = {
    'proc', 'sysfs', 'devtmpfs', 'devpts', 'cgroup', 'cgroup2', 'mqueue',
    'securityfs', 'debugfs', 'tracefs', 'configfs', 'fusectl', 'pstore',
    'hugetlbfs', 'rpc_pipefs', 'binfmt_misc', 'autofs',
}


def _run(argv: list[str], timeout: int = 4) -> tuple[int, str]:
    try:
        proc = subprocess.run(
            argv,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=timeout,
            shell=False,
            check=False,
        )
        return proc.returncode, proc.stdout.strip()
    except (OSError, subprocess.TimeoutExpired) as exc:
        return 1, str(exc)


def _decode_mount(value: str) -> str:
    return (
        value.replace('\\040', ' ')
        .replace('\\011', '\t')
        .replace('\\012', '\n')
        .replace('\\134', '\\')
    )


def get_storage_info() -> dict:
    mounts: list[dict] = []
    seen: set[str] = set()
    path = Path('/proc/mounts')
    if path.exists():
        for line in path.read_text(errors='replace').splitlines():
            parts = line.split()
            if len(parts) < 4:
                continue
            source, target, fstype, options = parts[:4]
            target = _decode_mount(target)
            source = _decode_mount(source)
            if target in seen or fstype in _PSEUDO_FS:
                continue
            seen.add(target)
            try:
                usage = shutil.disk_usage(target)
            except OSError:
                continue
            mounts.append({
                'source': source,
                'mountpoint': target,
                'fstype': fstype,
                'options': options,
                'total': usage.total,
                'used': usage.used,
                'free': usage.free,
                'percent': round((usage.used * 100 / usage.total), 1) if usage.total else 0.0,
            })
    mounts.sort(key=lambda item: (item['mountpoint'] != '/', item['mountpoint']))
    return {'mounts': mounts}


def _sysfs_interface(name: str) -> dict:
    base = Path('/sys/class/net') / name

    def text(filename: str, default: str = '') -> str:
        try:
            return (base / filename).read_text().strip()
        except OSError:
            return default

    def integer(filename: str) -> int:
        try:
            return int(text(filename, '0'))
        except ValueError:
            return 0

    return {
        'name': name,
        'state': text('operstate', 'unknown'),
        'mac': text('address'),
        'mtu': integer('mtu'),
        'rx_bytes': integer('statistics/rx_bytes'),
        'tx_bytes': integer('statistics/tx_bytes'),
        'addresses': [],
    }


def _interfaces() -> list[dict]:
    root = Path('/sys/class/net')
    by_name: dict[str, dict] = {}
    if root.exists():
        for entry in sorted(root.iterdir(), key=lambda p: p.name.casefold()):
            by_name[entry.name] = _sysfs_interface(entry.name)

    ip = shutil.which('ip')
    if ip:
        rc, output = _run([ip, '-j', 'address', 'show'])
        if rc == 0:
            try:
                rows = json.loads(output or '[]')
            except json.JSONDecodeError:
                rows = []
            for row in rows:
                name = str(row.get('ifname', ''))
                if not name:
                    continue
                item = by_name.setdefault(name, _sysfs_interface(name))
                item['state'] = str(row.get('operstate') or item.get('state') or 'unknown').lower()
                item['mtu'] = int(row.get('mtu') or item.get('mtu') or 0)
                item['mac'] = str(row.get('address') or item.get('mac') or '')
                addresses = []
                for addr in row.get('addr_info') or []:
                    local = addr.get('local')
                    prefix = addr.get('prefixlen')
                    if local is None:
                        continue
                    addresses.append({
                        'family': str(addr.get('family') or ''),
                        'address': f'{local}/{prefix}' if prefix is not None else str(local),
                        'scope': str(addr.get('scope') or ''),
                    })
                item['addresses'] = addresses
    return list(by_name.values())


def _routes() -> list[dict]:
    ip = shutil.which('ip')
    if not ip:
        return []
    rc, output = _run([ip, '-j', 'route', 'show'])
    if rc != 0:
        return []
    try:
        rows = json.loads(output or '[]')
    except json.JSONDecodeError:
        return []
    result = []
    for row in rows[:80]:
        result.append({
            'dst': str(row.get('dst') or 'default'),
            'gateway': str(row.get('gateway') or ''),
            'dev': str(row.get('dev') or ''),
            'prefsrc': str(row.get('prefsrc') or ''),
            'protocol': str(row.get('protocol') or ''),
            'metric': row.get('metric'),
        })
    return result


def _listening_ports() -> list[dict]:
    ss = shutil.which('ss')
    if not ss:
        return []
    rc, output = _run([ss, '-lntuH'])
    if rc != 0:
        return []
    result = []
    for line in output.splitlines()[:120]:
        parts = line.split()
        if len(parts) < 5:
            continue
        proto = parts[0]
        state = parts[1] if proto.lower().startswith('tcp') else 'UNCONN'
        local = parts[4] if len(parts) > 4 else ''
        result.append({'protocol': proto, 'state': state, 'local': local})
    return result


def _dns_servers() -> list[str]:
    path = Path('/etc/resolv.conf')
    if not path.exists():
        return []
    servers = []
    for line in path.read_text(errors='replace').splitlines():
        line = line.strip()
        if line.startswith('nameserver '):
            value = line.split(None, 1)[1].strip()
            if value:
                servers.append(value)
    return servers


def get_network_info() -> dict:
    return {
        'interfaces': _interfaces(),
        'routes': _routes(),
        'listening_ports': _listening_ports(),
        'dns_servers': _dns_servers(),
    }


def get_users() -> dict:
    active: set[str] = set()
    who = shutil.which('who')
    if who:
        rc, output = _run([who])
        if rc == 0:
            for line in output.splitlines():
                fields = line.split()
                if fields:
                    active.add(fields[0])

    users = []
    for entry in pwd.getpwall():
        shell = entry.pw_shell or ''
        interactive = shell not in {'', '/sbin/nologin', '/usr/sbin/nologin', '/bin/false'}
        users.append({
            'name': entry.pw_name,
            'uid': entry.pw_uid,
            'gid': entry.pw_gid,
            'home': entry.pw_dir,
            'shell': shell,
            'interactive': interactive,
            'active': entry.pw_name in active,
            'system': entry.pw_uid < 1000 and entry.pw_uid != 0,
        })
    users.sort(key=lambda item: (item['system'], item['uid'], item['name']))
    return {
        'current_uid': os.getuid(),
        'users': users,
        'active_users': sorted(active),
    }
