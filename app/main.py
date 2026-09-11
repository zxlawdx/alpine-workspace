from __future__ import annotations

import logging
import os
import shutil
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Request, WebSocket
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app.core.security import (
    SESSION_COOKIE,
    session_payload,
    set_session_cookie,
    validate_request,
    validate_websocket,
)
from app.docker.service import (
    container_action,
    container_logs,
    containers,
    docker_exec_command,
    docker_overview,
    resources as docker_resources,
)
from app.filesystem import service as fs
from app.services.host_details import get_network_info, get_storage_info, get_users
from app.services.jobs import job_manager
from app.services.logs import available_sources, tail_file
from app.services.openrc import list_services, service_action
from app.services.packages import list_packages, package_action
from app.services.system_info import get_processes, get_system_info
from app.terminal.manager import terminal_manager

BASE_DIR = Path(__file__).resolve().parent.parent
WEB_DIR = BASE_DIR / 'web'
logger = logging.getLogger('pibic-workspace')


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await terminal_manager.shutdown()


app = FastAPI(
    title='PIBIC Workspace',
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
    lifespan=lifespan,
)


@app.middleware('http')
async def security_middleware(request: Request, call_next):
    try:
        validate_request(request)
        length = request.headers.get('content-length')
        if length and int(length) > 12 * 1024 * 1024:
            raise HTTPException(status_code=413, detail={'code': 'REQUEST_TOO_LARGE', 'message': 'Corpo da requisição excede 12 MiB.'})
        response = await call_next(request)
    except HTTPException as exc:
        detail = exc.detail if isinstance(exc.detail, dict) else {'code': 'REQUEST_REJECTED', 'message': str(exc.detail)}
        return JSONResponse({'ok': False, 'error': detail}, status_code=exc.status_code)
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['Referrer-Policy'] = 'no-referrer'
    response.headers['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=()'
    response.headers['Cache-Control'] = 'no-store' if request.url.path.startswith('/api/') else 'no-cache'
    response.headers['Content-Security-Policy'] = (
        "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; "
        "script-src 'self'; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
    )
    return response


@app.exception_handler(HTTPException)
async def http_exception_handler(_: Request, exc: HTTPException):
    detail = exc.detail if isinstance(exc.detail, dict) else {'code': 'HTTP_ERROR', 'message': str(exc.detail)}
    return JSONResponse({'ok': False, 'error': detail}, status_code=exc.status_code)


@app.exception_handler(Exception)
async def unhandled_exception_handler(_: Request, exc: Exception):
    logger.exception('Erro não tratado no Workspace', exc_info=exc)
    return JSONResponse(
        {'ok': False, 'error': {'code': 'INTERNAL_ERROR', 'message': 'O Workspace encontrou um erro interno.'}},
        status_code=500,
    )


@app.get('/')
def index():
    response = FileResponse(WEB_DIR / 'index.html')
    set_session_cookie(response)
    return response


@app.get('/api/health')
def health():
    return {'ok': True, 'service': 'pibic-workspace'}


@app.get('/api/session')
def session():
    return {'ok': True, **session_payload()}


@app.get('/api/system')
def system_info():
    return {'ok': True, 'system': get_system_info()}


@app.get('/api/metrics')
def metrics():
    return {'ok': True, 'metrics': get_system_info()}


@app.get('/api/system/processes')
def processes(limit: int = Query(20, ge=1, le=100)):
    return {'ok': True, 'processes': get_processes(limit)}


@app.get('/api/system/storage')
def storage():
    return {'ok': True, **get_storage_info()}


@app.get('/api/system/network')
def network():
    return {'ok': True, **get_network_info()}


@app.get('/api/system/users')
def users():
    return {'ok': True, **get_users()}


class PathModel(BaseModel):
    path: str


class WriteModel(BaseModel):
    path: str
    content: str
    expected_mtime_ns: int | None = None
    force: bool = False
    create_only: bool = False


class MkdirModel(BaseModel):
    path: str


class TouchModel(BaseModel):
    path: str


class RenameModel(BaseModel):
    path: str
    new_name: str


class DeleteModel(BaseModel):
    paths: list[str] = Field(min_length=1, max_length=100)


class CopyMoveModel(BaseModel):
    paths: list[str] = Field(min_length=1, max_length=100)
    destination: str


class UploadModel(BaseModel):
    directory: str
    name: str
    content_b64: str


@app.get('/api/files/list')
def files_list(path: str = Query(default='~'), show_hidden: bool = False):
    return {'ok': True, **fs.list_dir(path, show_hidden)}


@app.get('/api/files/read')
def files_read(path: str):
    return {'ok': True, 'file': fs.read_file(path)}


@app.get('/api/files/properties')
def files_properties(path: str):
    return {'ok': True, 'item': fs.properties(path)}


@app.get('/api/files/search')
def files_search(path: str, q: str, show_hidden: bool = False):
    return {'ok': True, 'items': fs.search_files(path, q, show_hidden)}


@app.get('/api/files/download')
def files_download(path: str):
    resolved = fs.resolve_path(path)
    if not resolved.exists() or not resolved.is_file():
        raise HTTPException(status_code=404, detail={'code': 'NOT_FOUND', 'message': 'Arquivo não encontrado.'})
    if resolved.stat().st_size > 256 * 1024 * 1024:
        raise HTTPException(status_code=413, detail={'code': 'FILE_TOO_LARGE', 'message': 'Download limitado a 256 MiB nesta versão.'})
    return FileResponse(resolved, filename=resolved.name)


@app.post('/api/files/write')
def files_write(body: WriteModel):
    return fs.write_file(body.path, body.content, body.expected_mtime_ns, body.force, body.create_only)


@app.post('/api/files/mkdir')
def files_mkdir(body: MkdirModel):
    return fs.mkdir(body.path)


@app.post('/api/files/touch')
def files_touch(body: TouchModel):
    return fs.touch(body.path)


@app.post('/api/files/rename')
def files_rename(body: RenameModel):
    return fs.rename(body.path, body.new_name)


@app.post('/api/files/delete')
def files_delete(body: DeleteModel):
    return fs.delete(body.paths)


@app.post('/api/files/copy')
def files_copy(body: CopyMoveModel):
    return fs.copy_items(body.paths, body.destination, move=False)


@app.post('/api/files/move')
def files_move(body: CopyMoveModel):
    return fs.copy_items(body.paths, body.destination, move=True)


@app.post('/api/files/upload')
def files_upload(body: UploadModel):
    return fs.upload_file(body.directory, body.name, body.content_b64)


@app.get('/api/packages')
def packages():
    return {'ok': True, 'packages': list_packages()}


class PackageActionModel(BaseModel):
    package_id: str
    action: str


@app.post('/api/packages/action')
def packages_action(body: PackageActionModel):
    return {'ok': True, 'job': package_action(body.package_id, body.action)}


@app.get('/api/services')
def services():
    return {'ok': True, 'services': list_services()}


class ServiceActionModel(BaseModel):
    name: str
    action: str


@app.post('/api/services/action')
def services_action(body: ServiceActionModel):
    return {'ok': True, 'job': service_action(body.name, body.action)}


@app.get('/api/docker')
def docker():
    return {'ok': True, 'docker': docker_overview()}


@app.get('/api/docker/containers')
def docker_containers():
    return {'ok': True, 'containers': containers()}


@app.get('/api/docker/resources/{kind}')
def docker_resource_list(kind: str):
    return {'ok': True, 'items': docker_resources(kind)}


class DockerActionModel(BaseModel):
    container: str
    action: str


@app.post('/api/docker/action')
def docker_action(body: DockerActionModel):
    return {'ok': True, 'job': container_action(body.container, body.action)}


@app.get('/api/docker/logs')
def docker_logs(container: str, tail: int = Query(300, ge=10, le=2000)):
    return {'ok': True, 'content': container_logs(container, tail)}


@app.get('/api/logs/sources')
def log_sources():
    return {'ok': True, 'sources': available_sources()}


@app.get('/api/logs')
def logs(source: str = 'workspace', lines: int = Query(300, ge=20, le=2000)):
    return {'ok': True, 'log': tail_file(source, lines)}


@app.get('/api/jobs')
def jobs():
    return {'ok': True, 'jobs': job_manager.list()}


@app.get('/api/jobs/{job_id}')
def job(job_id: str):
    result = job_manager.get(job_id)
    if not result:
        raise HTTPException(status_code=404, detail={'code': 'JOB_NOT_FOUND', 'message': 'Job não encontrado.'})
    return {'ok': True, 'job': result}


@app.post('/api/jobs/{job_id}/stop')
def stop_job(job_id: str):
    return {'ok': job_manager.stop(job_id)}


class RunCodeModel(BaseModel):
    path: str


@app.post('/api/code/run')
def run_code(body: RunCodeModel):
    path = fs.resolve_path(body.path)
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail={'code': 'NOT_FOUND', 'message': 'Arquivo não encontrado.'})
    suffix = path.suffix.lower()
    if suffix == '.py':
        argv = ['python3', str(path)]
    elif suffix == '.sh':
        argv = ['sh', str(path)]
    elif suffix in {'.js', '.mjs'}:
        if not shutil.which('node'):
            raise HTTPException(status_code=400, detail={'code': 'NODE_MISSING', 'message': 'Node.js não está instalado.'})
        argv = ['node', str(path)]
    else:
        raise HTTPException(status_code=400, detail={'code': 'UNSUPPORTED_RUN', 'message': 'Execução suportada apenas para .py, .sh e .js.'})
    display = ' '.join(argv)
    job = job_manager.create(f'Executar {path.name}', display, argv)
    return {'ok': True, 'job': job}


@app.websocket('/ws/terminal/{session_id}')
async def terminal_ws(websocket: WebSocket, session_id: str):
    try:
        validate_websocket(websocket)
    except HTTPException:
        await websocket.close(code=1008)
        return
    if len(session_id) > 128:
        await websocket.close(code=1008)
        return
    cwd = websocket.query_params.get('cwd')
    mode = websocket.query_params.get('mode', 'shell')
    command = None
    if mode == 'docker':
        container = websocket.query_params.get('container', '')
        try:
            command = docker_exec_command(container)
        except HTTPException:
            await websocket.close(code=1008)
            return
    await terminal_manager.serve(websocket, session_id, cwd=cwd, command=command)


app.mount('/static', StaticFiles(directory=WEB_DIR), name='static')
