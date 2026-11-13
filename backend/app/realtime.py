"""Per-user realtime fan-out.

Sync FastAPI endpoints run in a thread pool, so subscribers use ``queue.Queue``
(thread-safe) and the SSE endpoint polls each queue from the event loop. This
keeps one implementation working for sync and async handlers without relying on
cross-loop asyncio primitives.
"""

from __future__ import annotations

import queue
import threading
from typing import Any


class _Hub:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._subscribers: dict[str, set[queue.Queue[dict[str, Any]]]] = {}

    def subscribe(self, user_id: str) -> queue.Queue[dict[str, Any]]:
        channel: queue.Queue[dict[str, Any]] = queue.Queue(maxsize=64)
        with self._lock:
            self._subscribers.setdefault(user_id, set()).add(channel)
        return channel

    def unsubscribe(self, user_id: str, channel: queue.Queue[dict[str, Any]]) -> None:
        with self._lock:
            channels = self._subscribers.get(user_id)
            if not channels:
                return
            channels.discard(channel)
            if not channels:
                self._subscribers.pop(user_id, None)

    def publish(self, user_id: str, topic: str, payload: dict[str, Any] | None = None) -> None:
        message = {"topic": topic, "payload": payload or {}}
        with self._lock:
            channels = list(self._subscribers.get(user_id, ()))
        for channel in channels:
            try:
                channel.put_nowait(message)
            except queue.Full:
                # A slow client will reconcile with its periodic refresh.
                pass

    def count(self) -> int:
        with self._lock:
            return sum(len(channels) for channels in self._subscribers.values())


hub = _Hub()
