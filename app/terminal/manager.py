from __future__ import annotations

import asyncio
import fcntl
import os
import pty
import pwd
import signal
import struct
import subprocess
import termios
from dataclasses import dataclass
from pathlib import Path

from fastapi import WebSocket, WebSocketDisconnect


@dataclass
class PTYSession:
    session_id: str
    master_fd: int
    process: subprocess.Popen
    reader_task: asyncio.Task | None = None


class TerminalManager:
    def __init__(self) -> None:
        self.sessions: dict[str, PTYSession] = {}
        self._lock = asyncio.Lock()

    def _spawn(self, session_id: str, cwd: str | None = None, command: list[str] | None = None) -> PTYSession:
        master_fd, slave_fd = pty.openpty()
        try:
            account = pwd.getpwuid(os.getuid())
            home = Path(account.pw_dir)
            shell = account.pw_shell or '/bin/ash'
            username = account.pw_name
        except KeyError:
            home = Path('/tmp')
            shell = '/bin/ash'
            username = str(os.getuid())
        if not Path(shell).exists():
            shell = '/bin/ash'
        argv = command or [shell, '-l']
        run_cwd = cwd or str(home)
        if not Path(run_cwd).is_dir():
            run_cwd = str(home)
        env = os.environ.copy()
        env.update({
            'HOME': str(home),
            'USER': username,
            'LOGNAME': username,
            'SHELL': shell,
            'TERM': 'xterm-256color',
            'COLORTERM': 'truecolor',
        })
        def child_setup() -> None:
            # A real interactive PTY needs a controlling terminal. setsid() creates
            # a new session and TIOCSCTTY attaches the slave as its controlling TTY.
            os.setsid()
            fcntl.ioctl(slave_fd, termios.TIOCSCTTY, 0)

        process = subprocess.Popen(
            argv,
            stdin=slave_fd,
            stdout=slave_fd,
            stderr=slave_fd,
            cwd=run_cwd,
            env=env,
            preexec_fn=child_setup,
            close_fds=True,
        )
        os.close(slave_fd)
        os.set_blocking(master_fd, True)
        return PTYSession(session_id=session_id, master_fd=master_fd, process=process)

    async def _close_session(self, session: PTYSession) -> None:
        try:
            os.close(session.master_fd)
        except OSError:
            pass
        if session.process.poll() is None:
            try:
                os.killpg(session.process.pid, signal.SIGHUP)
            except (ProcessLookupError, PermissionError):
                try:
                    session.process.terminate()
                except ProcessLookupError:
                    pass
            try:
                await asyncio.wait_for(asyncio.to_thread(session.process.wait), timeout=2.0)
            except asyncio.TimeoutError:
                try:
                    os.killpg(session.process.pid, signal.SIGKILL)
                except (ProcessLookupError, PermissionError):
                    pass

    async def _reader(self, websocket: WebSocket, session: PTYSession) -> None:
        try:
            while True:
                data = await asyncio.to_thread(os.read, session.master_fd, 4096)
                if not data:
                    break
                await websocket.send_json({'type': 'output', 'data': data.decode('utf-8', errors='replace')})
        except (OSError, RuntimeError, WebSocketDisconnect):
            pass

    async def _receiver(self, websocket: WebSocket, session: PTYSession) -> None:
        try:
            while True:
                msg = await websocket.receive_json()
                kind = msg.get('type')
                if kind == 'input':
                    data = str(msg.get('data', '')).encode('utf-8')
                    if len(data) <= 64 * 1024:
                        await asyncio.to_thread(os.write, session.master_fd, data)
                elif kind == 'resize':
                    self.resize(session.master_fd, int(msg.get('cols', 80)), int(msg.get('rows', 24)))
                elif kind == 'signal' and msg.get('signal') == 'SIGINT':
                    try:
                        os.killpg(session.process.pid, signal.SIGINT)
                    except ProcessLookupError:
                        pass
        except (WebSocketDisconnect, RuntimeError, ValueError, OSError):
            pass

    @staticmethod
    def resize(master_fd: int, cols: int, rows: int) -> None:
        cols = max(20, min(int(cols), 500))
        rows = max(5, min(int(rows), 200))
        winsize = struct.pack('HHHH', rows, cols, 0, 0)
        fcntl.ioctl(master_fd, termios.TIOCSWINSZ, winsize)

    async def serve(self, websocket: WebSocket, session_id: str, cwd: str | None = None, command: list[str] | None = None) -> None:
        await websocket.accept()
        async with self._lock:
            old = self.sessions.pop(session_id, None)
            if old:
                await self._close_session(old)
            session = self._spawn(session_id, cwd=cwd, command=command)
            self.sessions[session_id] = session
        session.reader_task = asyncio.create_task(self._reader(websocket, session))
        receiver_task = asyncio.create_task(self._receiver(websocket, session))
        try:
            done, pending = await asyncio.wait(
                {session.reader_task, receiver_task},
                return_when=asyncio.FIRST_COMPLETED,
            )
            for task in pending:
                task.cancel()
            await asyncio.gather(*pending, return_exceptions=True)
            await asyncio.gather(*done, return_exceptions=True)
            code = session.process.poll()
            if code is None and session.reader_task in done:
                try:
                    code = await asyncio.wait_for(asyncio.to_thread(session.process.wait), timeout=0.5)
                except asyncio.TimeoutError:
                    code = None
            if session.reader_task in done:
                try:
                    if websocket.client_state.name == 'CONNECTED':
                        await websocket.send_json({'type': 'exit', 'code': code if code is not None else 0})
                except Exception:
                    pass
        finally:
            if not receiver_task.done():
                receiver_task.cancel()
            if session.reader_task and not session.reader_task.done():
                session.reader_task.cancel()
            await asyncio.gather(receiver_task, session.reader_task, return_exceptions=True)
            async with self._lock:
                if self.sessions.get(session_id) is session:
                    self.sessions.pop(session_id, None)
            await self._close_session(session)

    async def shutdown(self) -> None:
        async with self._lock:
            sessions = list(self.sessions.values())
            self.sessions.clear()
        for session in sessions:
            if session.reader_task:
                session.reader_task.cancel()
            await self._close_session(session)


terminal_manager = TerminalManager()
