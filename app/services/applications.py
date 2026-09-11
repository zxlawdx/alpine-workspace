from __future__ import annotations

import shutil
import subprocess
from dataclasses import dataclass


@dataclass(frozen=True)
class ApplicationSpec:
    id: str
    name: str
    commands: tuple[str, ...]
    categories: tuple[str, ...]
    icon: str
    launch_app: str
    package: str | None = None
    service: str | None = None
    version_args: tuple[str, ...] = ("--version",)


BUILTINS = [
    {
        "id": "terminal",
        "name": "Terminal",
        "categories": ["development", "system"],
        "icon": "terminal",
        "launch_app": "terminal",
        "source": "workspace",
        "version": "Alpine Workspace",
        "package": None,
        "service": None,
        "command": None,
    },
    {
        "id": "code",
        "name": "Código",
        "categories": ["development"],
        "icon": "code",
        "launch_app": "code",
        "source": "workspace",
        "version": "Alpine Workspace",
        "package": None,
        "service": None,
        "command": None,
    },
    {
        "id": "files",
        "name": "Arquivos",
        "categories": ["system"],
        "icon": "files",
        "launch_app": "files",
        "source": "workspace",
        "version": "Alpine Workspace",
        "package": None,
        "service": None,
        "command": None,
    },
    {
        "id": "settings",
        "name": "Configurações",
        "categories": ["system"],
        "icon": "settings",
        "launch_app": "settings",
        "source": "workspace",
        "version": "Alpine Workspace",
        "package": None,
        "service": None,
        "command": None,
    },
]


SPECS = [
    ApplicationSpec("docker", "Docker", ("docker",), ("development", "system"), "docker", "docker", "docker", "docker"),
    ApplicationSpec("python3", "Python 3", ("python3",), ("development",), "python", "code", "python3"),
    ApplicationSpec("git", "Git", ("git",), ("development",), "git", "terminal", "git"),
    ApplicationSpec("postgresql", "PostgreSQL", ("psql", "postgres"), ("data", "development"), "postgresql", "terminal", "postgresql", "postgresql"),
    ApplicationSpec("nginx", "Nginx", ("nginx",), ("web", "system"), "nginx", "services", "nginx", "nginx", ("-v",)),
    ApplicationSpec("nodejs", "Node.js", ("node",), ("development",), "nodejs", "code", "nodejs"),
    ApplicationSpec("npm", "npm", ("npm",), ("development",), "npm", "terminal", "npm"),
    ApplicationSpec("pip", "pip", ("pip3", "pip"), ("development",), "pip", "terminal", "py3-pip"),
    ApplicationSpec("htop", "htop", ("htop",), ("system",), "htop", "terminal", "htop"),
    ApplicationSpec("vim", "Vim", ("vim",), ("development",), "vim", "code", "vim"),
    ApplicationSpec("nano", "nano", ("nano",), ("development",), "nano", "code", "nano"),
    ApplicationSpec("curl", "curl", ("curl",), ("web", "development"), "curl", "terminal", "curl"),
    ApplicationSpec("wget", "wget", ("wget",), ("web", "development"), "wget", "terminal", "wget"),
    ApplicationSpec("redis", "Redis", ("redis-server", "redis-cli"), ("data",), "redis", "terminal", "redis", "redis"),
    ApplicationSpec("jupyterlab", "JupyterLab", ("jupyter-lab",), ("data", "development", "web"), "jupyter", "terminal", "py3-jupyterlab"),
    ApplicationSpec("code-server", "code-server", ("code-server",), ("development", "web"), "vscode", "code", "code-server"),
    ApplicationSpec("firefox", "Firefox", ("firefox",), ("web",), "firefox", "terminal", "firefox"),
    ApplicationSpec("chromium", "Chromium", ("chromium", "chromium-browser"), ("web",), "chromium", "terminal", "chromium"),
    ApplicationSpec("libreoffice", "LibreOffice", ("libreoffice",), ("system", "data"), "libreoffice", "files", "libreoffice"),
    ApplicationSpec("thunderbird", "Thunderbird", ("thunderbird",), ("web",), "thunderbird", "terminal", "thunderbird"),
]


def _which(commands: tuple[str, ...]) -> tuple[str, str] | None:
    for command in commands:
        path = shutil.which(command)
        if path:
            return command, path
    return None


def _first_line(argv: list[str]) -> str | None:
    try:
        proc = subprocess.run(
            argv,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=3,
            shell=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    text = (proc.stdout or "").strip()
    return text.splitlines()[0][:240] if text else None


def _version(command: str, args: tuple[str, ...]) -> str | None:
    return _first_line([command, *args])


def list_applications() -> list[dict]:
    """Return only applications that really exist on the VM plus Workspace built-ins."""
    rows = [dict(item) for item in BUILTINS]

    for spec in SPECS:
        found = _which(spec.commands)
        if not found:
            continue
        command, path = found
        rows.append(
            {
                "id": spec.id,
                "name": spec.name,
                "categories": list(spec.categories),
                "icon": spec.icon,
                "launch_app": spec.launch_app,
                "source": "system",
                "version": _version(command, spec.version_args),
                "package": spec.package,
                "service": spec.service,
                "command": command,
                "path": path,
            }
        )

    return rows
