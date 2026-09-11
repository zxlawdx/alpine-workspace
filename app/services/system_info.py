from __future__ import annotations

import os
import platform
import shutil
import socket
import time
from pathlib import Path

_BOOT_CACHE: tuple[int, int] | None = None
_CPU_CACHE: tuple[float, float] | None = None


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


def get_system_info() -> dict:
    osr = _read_os_release()
    mem = _meminfo()
    total = mem.get('MemTotal', 0)
    available = mem.get('MemAvailable', mem.get('MemFree', 0))
    used = max(0, total - available)
    disk = shutil.disk_usage('/')
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
