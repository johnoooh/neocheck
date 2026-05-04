"""Tests for the in-process token bucket rate limiter."""

import time
from utils.rate_limit import RateLimiter


def test_under_limit_allows():
    rl = RateLimiter(per_hour=3, per_day=10)
    assert rl.check("ip1") is True
    assert rl.check("ip1") is True
    assert rl.check("ip1") is True


def test_over_hourly_limit_blocks():
    rl = RateLimiter(per_hour=2, per_day=10)
    assert rl.check("ip1") is True
    assert rl.check("ip1") is True
    assert rl.check("ip1") is False


def test_separate_ips_independent():
    rl = RateLimiter(per_hour=1, per_day=10)
    assert rl.check("a") is True
    assert rl.check("b") is True
    assert rl.check("a") is False
    assert rl.check("b") is False


def test_window_rolls_over(monkeypatch):
    rl = RateLimiter(per_hour=1, per_day=10)
    t = [1000.0]
    monkeypatch.setattr(time, "time", lambda: t[0])
    assert rl.check("ip") is True
    assert rl.check("ip") is False
    t[0] += 3601  # past hour
    assert rl.check("ip") is True
