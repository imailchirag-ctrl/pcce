"""Local isolated code runner for Career Quest.

This is a small Judge0-compatible service used only by the Career Quest backend.
It never executes submitted code in its own process. Each submission runs inside
a fresh Docker container with no network, a read-only root filesystem, a
read-only mount of the source directory, CPU/memory/process limits, and a short
wall-clock timeout.

Run it separately from FastAPI:

    python3 backend/runner/service.py

Environment:
    CAREER_QUEST_RUNNER_PORT      Port to listen on (default 2358).
    CAREER_QUEST_RUNNER_TOKEN     Optional shared token required in X-Auth-Token.
    CAREER_QUEST_RUNNER_IMAGE     Docker image (default python:3.12-slim).
    CAREER_QUEST_RUNNER_DOCKER    Docker binary (default docker).

The service exposes:
    GET  /health
    POST /submissions?...           -> {"token": "..."}
    GET  /submissions/{token}?fields=... -> Judge0-shaped result
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
import tempfile
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import parse_qs, urlparse

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("career-quest-runner")

PORT = int(os.environ.get("CAREER_QUEST_RUNNER_PORT", "2358"))
TOKEN = os.environ.get("CAREER_QUEST_RUNNER_TOKEN", "").strip()
IMAGE = os.environ.get("CAREER_QUEST_RUNNER_IMAGE", "python:3.12-slim")
DOCKER = os.environ.get("CAREER_QUEST_RUNNER_DOCKER", "docker")
MAX_SOURCE_BYTES = 20_000
MAX_JOBS = 4
WALL_TIMEOUT_SECONDS = 8
MEMORY_LIMIT = "128m"
CPU_LIMIT = "0.5"
SUPPORTED_LANGUAGES = {71, 92, 100}  # Judge0 Python 3 identifiers.
SLOTS = threading.BoundedSemaphore(MAX_JOBS)
JOBS: dict[str, dict[str, Any]] = {}
JOBS_LOCK = threading.Lock()

STATUS_ACCEPTED = 3
STATUS_WRONG = 4
STATUS_TIME_LIMIT = 5
STATUS_COMPILE_ERROR = 6
STATUS_RUNTIME_ERROR = 7
STATUS_INTERNAL_ERROR = 13


def _docker_available() -> bool:
    try:
        result = subprocess.run(
            [DOCKER, "version", "--format", "{{.Server.Version}}"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        return result.returncode == 0
    except (OSError, subprocess.SubprocessError):
        return False


def _set_job(token: str, **values: Any) -> None:
    with JOBS_LOCK:
        if token in JOBS:
            JOBS[token].update(values)


def _error_status(stderr: str) -> int:
    lowered = stderr.lower()
    if "syntaxerror" in lowered or "indentationerror" in lowered or "taberror" in lowered:
        return STATUS_COMPILE_ERROR
    return STATUS_RUNTIME_ERROR


def _execute(token: str, source: str, stdin: str) -> None:
    _set_job(token, status=2, description="Processing")
    workdir = tempfile.mkdtemp(prefix="career-quest-")
    container_name = f"career-quest-{uuid.uuid4().hex[:16]}"
    started = time.perf_counter()
    try:
        os.chmod(workdir, 0o755)
        source_path = os.path.join(workdir, "main.py")
        with open(source_path, "w", encoding="utf-8") as handle:
            handle.write(source)
        os.chmod(source_path, 0o644)

        command = [
            DOCKER,
            "run",
            "--rm",
            "--name",
            container_name,
            "--network",
            "none",
            "--memory",
            MEMORY_LIMIT,
            "--memory-swap",
            MEMORY_LIMIT,
            "--cpus",
            CPU_LIMIT,
            "--pids-limit",
            "64",
            "--security-opt",
            "no-new-privileges",
            "--read-only",
            "--tmpfs",
            "/tmp:rw,size=16m",
            "--user",
            "65534:65534",
            "-e",
            "HOME=/tmp",
            "-e",
            "PYTHONDONTWRITEBYTECODE=1",
            "-v",
            f"{workdir}:/app:ro",
            "-w",
            "/app",
            "-i",
            IMAGE,
            "python",
            "-I",
            "main.py",
        ]
        process = subprocess.Popen(
            command,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        try:
            stdout, stderr = process.communicate(stdin, timeout=WALL_TIMEOUT_SECONDS)
        except subprocess.TimeoutExpired:
            process.kill()
            subprocess.run(
                [DOCKER, "rm", "-f", container_name],
                capture_output=True,
                text=True,
                timeout=10,
            )
            elapsed = round(time.perf_counter() - started, 3)
            _set_job(
                token,
                status=STATUS_TIME_LIMIT,
                description="Time Limit Exceeded",
                stdout="",
                stderr="Execution exceeded the wall-clock limit.",
                compile_output="",
                time=f"{elapsed:.3f}",
                memory=None,
            )
            return
        elapsed = round(time.perf_counter() - started, 3)
        returncode = process.returncode
        if returncode == 0:
            status = STATUS_ACCEPTED
            description = "Accepted"
        else:
            status = _error_status(stderr or "")
            description = (
                "Compilation Error" if status == STATUS_COMPILE_ERROR else "Runtime Error"
            )
        _set_job(
            token,
            status=status,
            description=description,
            stdout=(stdout or "")[:4000],
            stderr=(stderr or "")[:1000],
            compile_output=(stderr or "")[:1000] if status == STATUS_COMPILE_ERROR else "",
            time=f"{elapsed:.3f}",
            memory=None,
        )
    except Exception as exc:  # Never leak container details into the API response.
        logger.exception("Career Quest runner execution failed (%s)", type(exc).__name__)
        _set_job(
            token,
            status=STATUS_INTERNAL_ERROR,
            description="Internal Error",
            stdout="",
            stderr="The isolated runner could not execute this submission.",
            compile_output="",
            time=None,
            memory=None,
        )
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
        _set_job(token, finished_at=time.time())
        SLOTS.release()


class Handler(BaseHTTPRequestHandler):
    server_version = "CareerQuestRunner/1.0"

    def log_message(self, fmt: str, *args: Any) -> None:
        logger.info("%s - %s", self.address_string(), fmt % args)

    def _json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _authorized(self) -> bool:
        if not TOKEN:
            return True
        return self.headers.get("X-Auth-Token", "") == TOKEN

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            self._json(
                200,
                {
                    "status": "ok",
                    "docker": _docker_available(),
                    "image": IMAGE,
                    "supported_language_ids": sorted(SUPPORTED_LANGUAGES),
                },
            )
            return
        if parsed.path.startswith("/submissions/"):
            if not self._authorized():
                self._json(401, {"error": "unauthorized"})
                return
            token = parsed.path.rsplit("/", 1)[-1]
            with JOBS_LOCK:
                job = dict(JOBS.get(token) or {})
            if not job:
                self._json(404, {"error": "not_found"})
                return
            self._json(
                200,
                {
                    "stdout": job.get("stdout"),
                    "stderr": job.get("stderr"),
                    "compile_output": job.get("compile_output"),
                    "status": {
                        "id": int(job.get("status", 1)),
                        "description": job.get("description", "In Queue"),
                    },
                    "time": job.get("time"),
                    "memory": job.get("memory"),
                },
            )
            return
        self._json(404, {"error": "not_found"})

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path != "/submissions":
            self._json(404, {"error": "not_found"})
            return
        if not self._authorized():
            self._json(401, {"error": "unauthorized"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_SOURCE_BYTES + 4096:
            self._json(413, {"error": "payload_too_large"})
            return
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            self._json(400, {"error": "invalid_json"})
            return
        if not isinstance(payload, dict):
            self._json(400, {"error": "invalid_payload"})
            return
        source = payload.get("source_code")
        language_id = payload.get("language_id")
        stdin = payload.get("stdin") or ""
        if not isinstance(source, str) or not source.strip():
            self._json(422, {"error": "source_code_required"})
            return
        if len(source.encode("utf-8")) > MAX_SOURCE_BYTES:
            self._json(413, {"error": "source_too_large"})
            return
        if language_id not in SUPPORTED_LANGUAGES:
            self._json(422, {"error": "unsupported_language"})
            return
        if not isinstance(stdin, str) or len(stdin.encode("utf-8")) > 8000:
            self._json(413, {"error": "stdin_too_large"})
            return
        if not _docker_available():
            self._json(503, {"error": "docker_unavailable"})
            return
        if not SLOTS.acquire(blocking=False):
            self._json(429, {"error": "runner_busy"})
            return
        token = uuid.uuid4().hex
        with JOBS_LOCK:
            JOBS[token] = {
                "status": 1,
                "description": "In Queue",
                "stdout": None,
                "stderr": None,
                "compile_output": None,
                "time": None,
                "memory": None,
                "created_at": time.time(),
            }
        threading.Thread(target=_execute, args=(token, source, stdin), daemon=True).start()
        self._json(201, {"token": token})

    def do_DELETE(self) -> None:
        if not self._authorized():
            self._json(401, {"error": "unauthorized"})
            return
        parsed = urlparse(self.path)
        if not parsed.path.startswith("/submissions/"):
            self._json(404, {"error": "not_found"})
            return
        token = parsed.path.rsplit("/", 1)[-1]
        with JOBS_LOCK:
            JOBS.pop(token, None)
        self._json(200, {"deleted": token})


def main() -> None:
    if not _docker_available():
        logger.warning(
            "Docker is not reachable. The runner will start but every submission will fail until Docker is available."
        )
    logger.info("Starting Career Quest isolated runner on 127.0.0.1:%s using %s", PORT, IMAGE)
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    server.daemon_threads = True
    server.serve_forever()


if __name__ == "__main__":
    main()
