from __future__ import annotations

import json
import os
import platform
import pwd
import grp
import shutil
import socket
import subprocess
import time
from pathlib import Path

_CPU_CACHE: tuple[float, float] | None = None
_DETAIL_CACHE: tuple[float, dict] | None = None
_DETAIL_TTL = 15.0


def _read_os_release() -> dict[str, str]:
    data: dict[str, str] = {}
    path = Path('/etc/os-release')
    if not path.exists():
        return data
    for line in path.read_text(errors='replace').splitlines():
        if '=' not in line:
            continue
        key, value = line.split('=', 1)
        data[key] = value.strip().strip('"')
    return data


def _meminfo() -> dict[str, int]:
    values: dict[str, int] = {}
    try:
        for line in Path('/proc/meminfo').read_text().splitlines():
            key, rest = line.split(':', 1)
            number = int(rest.strip().split()[0]) * 1024
            values[key] = number
    except (OSError, ValueError):
        pass
    return values


def _cpu_times() -> tuple[float, float]:
    try:
        fields = Path('/proc/stat').read_text().splitlines()[0].split()[1:]
        nums = [float(x) for x in fields]
        total = sum(nums)
        idle = nums[3] + (nums[4] if len(nums) > 4 else 0.0)
        return total, idle
    except (OSError, ValueError, IndexError):
        return 0.0, 0.0


def _cpu_percent() -> float:
    global _CPU_CACHE
    now = _cpu_times()
    old = _CPU_CACHE
    _CPU_CACHE = now
    if old is None:
        return 0.0
    dt = now[0] - old[0]
    di = now[1] - old[1]
    if dt <= 0:
        return 0.0
    return round(max(0.0, min(100.0, (dt - di) * 100.0 / dt)), 1)


def _uptime() -> float:
    try:
        return float(Path('/proc/uptime').read_text().split()[0])
    except (OSError, ValueError, IndexError):
        return 0.0


def _loadavg() -> list[float]:
    try:
        return [round(x, 2) for x in os.getloadavg()]
    except OSError:
        return [0.0, 0.0, 0.0]


def _run_json(argv: list[str], timeout: float = 2.5):
    if not argv or not shutil.which(argv[0]):
        return None
    try:
        proc = subprocess.run(
            argv,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            timeout=timeout,
            shell=False,
            check=False,
        )
        if proc.returncode != 0 or not proc.stdout.strip():
            return None
        return json.loads(proc.stdout)
    except (OSError, subprocess.TimeoutExpired, json.JSONDecodeError):
        return None


def _run_text(argv: list[str], timeout: float = 2.5) -> str:
    if not argv or not shutil.which(argv[0]):
        return ''
    try:
        proc = subprocess.run(
            argv,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            timeout=timeout,
            shell=False,
            check=False,
        )
        return proc.stdout.strip() if proc.returncode == 0 else ''
    except (OSError, subprocess.TimeoutExpired):
        return ''


def _mounts() -> list[dict]:
    pseudo = {
        'proc', 'sysfs', 'devtmpfs', 'devpts', 'tmpfs', 'cgroup', 'cgroup2',
        'mqueue', 'securityfs', 'debugfs', 'tracefs', 'pstore', 'fusectl', 'nsfs',
    }
    rows: list[dict] = []
    seen: set[str] = set()
    try:
        for line in Path('/proc/mounts').read_text(errors='replace').splitlines():
            parts = line.split()
            if len(parts) < 4:
                continue
            device, mountpoint, fstype, options = parts[:4]
            mountpoint = mountpoint.replace('\\040', ' ')
            if mountpoint in seen or fstype in pseudo:
                continue
            seen.add(mountpoint)
            try:
                usage = shutil.disk_usage(mountpoint)
            except OSError:
                continue
            rows.append({
                'device': device,
                'mountpoint': mountpoint,
                'filesystem': fstype,
                'options': options,
                'total': usage.total,
                'used': usage.used,
                'free': usage.free,
                'percent': round(usage.used * 100 / usage.total, 1) if usage.total else 0.0,
            })
    except OSError:
        pass

    if not any(x['mountpoint'] == '/' for x in rows):
        try:
            usage = shutil.disk_usage('/')
            rows.insert(0, {
                'device': 'root',
                'mountpoint': '/',
                'filesystem': '',
                'options': '',
                'total': usage.total,
                'used': usage.used,
                'free': usage.free,
                'percent': round(usage.used * 100 / usage.total, 1) if usage.total else 0.0,
            })
        except OSError:
            pass

    rows.sort(key=lambda x: (x['mountpoint'] != '/', x['mountpoint']))
    return rows[:40]


def _network() -> dict:
    interfaces: list[dict] = []
    raw = _run_json(['ip', '-j', 'address', 'show'])
    if isinstance(raw, list):
        for item in raw:
            addresses = []
            for addr in item.get('addr_info', []) or []:
                local = addr.get('local')
                prefix = addr.get('prefixlen')
                if local:
                    addresses.append({
                        'family': addr.get('family', ''),
                        'address': f'{local}/{prefix}' if prefix is not None else str(local),
                        'scope': addr.get('scope', ''),
                    })
            interfaces.append({
                'name': item.get('ifname', ''),
                'state': item.get('operstate', 'UNKNOWN'),
                'mtu': item.get('mtu'),
                'mac': item.get('address', ''),
                'addresses': addresses,
            })
    else:
        sys_net = Path('/sys/class/net')
        if sys_net.exists():
            for entry in sorted(sys_net.iterdir()):
                try:
                    state = (entry / 'operstate').read_text().strip()
                except OSError:
                    state = 'unknown'
                try:
                    mac = (entry / 'address').read_text().strip()
                except OSError:
                    mac = ''
                interfaces.append({'name': entry.name, 'state': state, 'mtu': None, 'mac': mac, 'addresses': []})

    routes = _run_json(['ip', '-j', 'route', 'show'])
    if not isinstance(routes, list):
        routes = []
    routes = [
        {
            'dst': r.get('dst', 'default'),
            'gateway': r.get('gateway', ''),
            'dev': r.get('dev', ''),
            'prefsrc': r.get('prefsrc', ''),
            'protocol': r.get('protocol', ''),
        }
        for r in routes[:50]
    ]

    listening = []
    raw_ports = _run_text(['ss', '-H', '-lntu'])
    if raw_ports:
        for line in raw_ports.splitlines()[:100]:
            parts = line.split()
            local = parts[4] if len(parts) > 4 else ''
            listening.append({
                'protocol': parts[0] if parts else '',
                'state': parts[1] if len(parts) > 1 else '',
                'local': local,
                'raw': line[:400],
            })

    zt_interfaces = [x for x in interfaces if x['name'].lower().startswith('zt')]
    return {
        'interfaces': interfaces,
        'routes': routes,
        'listening': listening,
        'zerotier': {
            'running': _process_running('zerotier-one'),
            'interfaces': zt_interfaces,
            'cli': shutil.which('zerotier-cli') or '',
            'daemon': shutil.which('zerotier-one') or '',
            'openrc_service': Path('/etc/init.d/zerotier-one').exists(),
        },
    }


def _users() -> list[dict]:
    rows: list[dict] = []
    try:
        for user in pwd.getpwall():
            try:
                group = grp.getgrgid(user.pw_gid).gr_name
            except KeyError:
                group = str(user.pw_gid)
            rows.append({
                'name': user.pw_name,
                'uid': user.pw_uid,
                'gid': user.pw_gid,
                'group': group,
                'home': user.pw_dir,
                'shell': user.pw_shell,
                'system': user.pw_uid < 1000 and user.pw_uid != 0,
                'root': user.pw_uid == 0,
            })
    except OSError:
        pass
    rows.sort(key=lambda x: (x['uid'], x['name']))
    return rows[:200]


def _process_running(name: str) -> bool:
    proc = Path('/proc')
    try:
        entries = proc.iterdir()
    except OSError:
        return False
    for entry in entries:
        if not entry.name.isdigit():
            continue
        try:
            comm = (entry / 'comm').read_text(errors='replace').strip()
            if comm == name:
                return True
            cmd = (entry / 'cmdline').read_bytes().replace(b'\x00', b' ').decode(errors='replace')
            if name in cmd:
                return True
        except OSError:
            continue
    return False


def _details() -> dict:
    global _DETAIL_CACHE
    now = time.monotonic()
    if _DETAIL_CACHE and now - _DETAIL_CACHE[0] < _DETAIL_TTL:
        return _DETAIL_CACHE[1]
    value = {
        'mounts': _mounts(),
        'network': _network(),
        'users': _users(),
        'ssh': {
            'daemon_present': bool(shutil.which('sshd')),
            'running': _process_running('sshd'),
            'config_present': Path('/etc/ssh/sshd_config').exists(),
            'openrc_service': Path('/etc/init.d/sshd').exists(),
            'port': 22,
        },
    }
    _DETAIL_CACHE = (now, value)
    return value


def get_system_info() -> dict:
    osr = _read_os_release()
    mem = _meminfo()
    total = mem.get('MemTotal', 0)
    available = mem.get('MemAvailable', mem.get('MemFree', 0))
    used = max(0, total - available)
    disk = shutil.disk_usage('/')
    details = _details()
    return {
        'hostname': socket.gethostname(),
        'os': osr.get('PRETTY_NAME', osr.get('NAME', platform.system())),
        'version': osr.get('VERSION_ID', ''),
        'kernel': platform.release(),
        'architecture': platform.machine(),
        'uptime_seconds': _uptime(),
        'vcpus': os.cpu_count() or 1,
        'load_average': _loadavg(),
        'cpu_percent': _cpu_percent(),
        'memory': {
            'total': total,
            'used': used,
            'available': available,
            'percent': round((used * 100 / total), 1) if total else 0.0,
        },
        'disk': {
            'total': disk.total,
            'used': disk.used,
            'free': disk.free,
            'percent': round((disk.used * 100 / disk.total), 1) if disk.total else 0.0,
        },
        **details,
        'timestamp': time.time(),
    }


def get_processes(limit: int = 20) -> list[dict]:
    rows: list[dict] = []
    proc = Path('/proc')
    for entry in proc.iterdir():
        if not entry.name.isdigit():
            continue
        try:
            statm = (entry / 'statm').read_text().split()
            status = (entry / 'status').read_text(errors='replace').splitlines()
            cmdline_raw = (entry / 'cmdline').read_bytes().replace(b'\x00', b' ').decode(errors='replace').strip()
            name = entry.name
            uid = None
            for line in status:
                if line.startswith('Name:'):
                    name = line.split(':', 1)[1].strip()
                elif line.startswith('Uid:'):
                    uid = int(line.split()[1])
            rss_pages = int(statm[1]) if len(statm) > 1 else 0
            rows.append({
                'pid': int(entry.name),
                'name': name,
                'uid': uid,
                'rss': rss_pages * os.sysconf('SC_PAGE_SIZE'),
                'command': cmdline_raw[:240] or name,
            })
        except (OSError, ValueError, IndexError):
            continue
    rows.sort(key=lambda x: x['rss'], reverse=True)
    return rows[: max(1, min(limit, 100))]
