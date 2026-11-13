"""Judge0-compatible isolated execution adapter.

This module never runs player code in the application process. Hidden inputs
are sent to the configured runner one at a time; expected outputs stay in the
application service and are compared to the runner's actual stdout.
"""

from __future__ import annotations

import json
import logging
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from app.core.config import get_settings

logger = logging.getLogger("skillbridge.career_quest.runner")


class RunnerUnavailable(Exception):
    """The isolated runner is not configured or could not be reached."""


class RunnerExecutionError(Exception):
    """The runner rejected a job or returned an invalid response."""


def runner_configured() -> bool:
    return bool(get_settings().career_quest_runner_url.strip())


class Judge0Client:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.base_url = self.settings.career_quest_runner_url.rstrip("/")
        self.timeout_seconds = max(10, self.settings.career_quest_runner_timeout_seconds)

    def _request(self, url: str, *, method: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        headers = {"Accept": "application/json"}
        if payload is not None:
            headers["Content-Type"] = "application/json"
        if self.settings.career_quest_runner_token:
            headers["X-Auth-Token"] = self.settings.career_quest_runner_token
        request = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8") if payload is not None else None,
            headers=headers,
            method=method,
        )
        try:
            with urllib.request.urlopen(request, timeout=min(8, self.timeout_seconds)) as response:
                body = json.loads(response.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError) as exc:
            logger.warning("Career Quest isolated runner request failed: %s", type(exc).__name__)
            raise RunnerUnavailable("The isolated code runner could not be reached.") from exc
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise RunnerExecutionError("The isolated runner returned an invalid response.") from exc
        if not isinstance(body, dict):
            raise RunnerExecutionError("The isolated runner returned an invalid response.")
        return body

    def execute(self, source: str, input_value: Any) -> dict[str, Any]:
        if not self.base_url:
            raise RunnerUnavailable("The isolated code runner is not configured.")
        query = urllib.parse.urlencode({"base64_encoded": "false", "wait": "false"})
        submitted = self._request(
            f"{self.base_url}/submissions?{query}",
            method="POST",
            payload={
                "source_code": source,
                "language_id": self.settings.career_quest_runner_language_id,
                "stdin": json.dumps(input_value, separators=(",", ":")),
                "cpu_time_limit": 2,
                "wall_time_limit": 5,
                "memory_limit": 128000,
                "max_processes_and_or_threads": 32,
                "enable_network": False,
            },
        )
        token = submitted.get("token")
        if not isinstance(token, str) or not token or len(token) > 200:
            raise RunnerExecutionError("The isolated runner did not return a valid job identifier.")

        deadline = time.monotonic() + self.timeout_seconds
        encoded_token = urllib.parse.quote(token, safe="")
        while time.monotonic() < deadline:
            fields = urllib.parse.urlencode(
                {"base64_encoded": "false", "fields": "stdout,stderr,compile_output,status,time,memory"}
            )
            result = self._request(
                f"{self.base_url}/submissions/{encoded_token}?{fields}", method="GET"
            )
            status = result.get("status")
            if not isinstance(status, dict) or not isinstance(status.get("id"), int):
                raise RunnerExecutionError("The isolated runner returned an invalid job status.")
            status_id = status["id"]
            if status_id >= 3:
                return {
                    "job_id": token,
                    "status_id": status_id,
                    "status_description": str(status.get("description", "Unknown"))[:80],
                    "stdout": (result.get("stdout") or "")[:4000],
                    "stderr": (result.get("stderr") or "")[:1000],
                    "compile_output": (result.get("compile_output") or "")[:1000],
                    "time": result.get("time"),
                    "memory": result.get("memory"),
                }
            time.sleep(0.35)
        raise RunnerUnavailable("The isolated runner did not finish before the time limit.")
