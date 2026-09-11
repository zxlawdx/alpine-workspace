from __future__ import annotations

import logging
import os
import signal
import subprocess
import threading
import time
import uuid
from collections import deque
from dataclasses import dataclass, field


logger = logging.getLogger('pibic-workspace.jobs')


@dataclass
class Job:
    id: str
    title: str
    command_display: str
    status: str = 'queued'
    started_at: float | None = None
    finished_at: float | None = None
    output: str = ''
    return_code: int | None = None
    _process: subprocess.Popen | None = field(default=None, repr=False, compare=False)

    def public(self) -> dict:
        return {
            'id': self.id,
            'title': self.title,
            'command_display': self.command_display,
            'status': self.status,
            'started_at': self.started_at,
            'finished_at': self.finished_at,
            'output': self.output,
            'return_code': self.return_code,
        }


class JobManager:
    def __init__(self, max_jobs: int = 50, max_output: int = 256 * 1024) -> None:
        self.jobs: dict[str, Job] = {}
        self.order: deque[str] = deque()
        self.max_jobs = max_jobs
        self.max_output = max_output
        self.lock = threading.Lock()

    def _append(self, job: Job, text: str) -> None:
        with self.lock:
            job.output = (job.output + text)[-self.max_output:]

    def create(self, title: str, command_display: str, argv: list[str], env: dict | None = None) -> Job:
        job = Job(id=uuid.uuid4().hex, title=title, command_display=command_display)
        with self.lock:
            self.jobs[job.id] = job
            self.order.append(job.id)
            while len(self.order) > self.max_jobs:
                old = self.order.popleft()
                self.jobs.pop(old, None)
        thread = threading.Thread(target=self._run, args=(job, argv, env), daemon=True)
        thread.start()
        return job

    def _run(self, job: Job, argv: list[str], env: dict | None) -> None:
        with self.lock:
            job.status = 'running'
            job.started_at = time.time()
        try:
            proc = subprocess.Popen(
                argv,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                shell=False,
                env=env,
                start_new_session=True,
            )
            job._process = proc
            assert proc.stdout is not None
            for line in proc.stdout:
                self._append(job, line)
            rc = proc.wait()
            with self.lock:
                job.return_code = rc
                job.status = 'success' if rc == 0 else 'failed'
                job.finished_at = time.time()
        except Exception:
            logger.exception('Falha ao executar job %s', job.id)
            self._append(job, '\nFalha interna ao iniciar ou acompanhar o processo solicitado.\n')
            with self.lock:
                job.return_code = -1
                job.status = 'failed'
                job.finished_at = time.time()
        finally:
            job._process = None

    def get(self, job_id: str) -> dict | None:
        with self.lock:
            job = self.jobs.get(job_id)
            return job.public() if job else None

    def list(self) -> list[dict]:
        with self.lock:
            return [self.jobs[j].public() for j in reversed(self.order) if j in self.jobs]

    def stop(self, job_id: str) -> bool:
        with self.lock:
            job = self.jobs.get(job_id)
            proc = job._process if job else None
        if not proc or proc.poll() is not None:
            return False
        try:
            os.killpg(proc.pid, signal.SIGTERM)
        except (ProcessLookupError, PermissionError):
            try:
                proc.terminate()
            except ProcessLookupError:
                return False
        return True


job_manager = JobManager()
