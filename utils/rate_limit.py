"""Lightweight in-memory per-IP rate limiter.

Acceptable for single-process Streamlit deployments at small scale.
For multi-replica deployments, swap with Redis or similar.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque


class RateLimiter:
    def __init__(self, per_hour: int = 30, per_day: int = 200):
        self.per_hour = per_hour
        self.per_day = per_day
        self._lock = threading.Lock()
        self._events: dict[str, deque[float]] = defaultdict(deque)

    def check(self, ip: str) -> bool:
        now = time.time()
        with self._lock:
            q = self._events[ip]
            cutoff_day = now - 86400
            while q and q[0] < cutoff_day:
                q.popleft()
            cutoff_hour = now - 3600
            hourly = sum(1 for t in q if t >= cutoff_hour)
            if len(q) >= self.per_day or hourly >= self.per_hour:
                return False
            q.append(now)
            return True
