"""Shared test configuration for NeoCheck."""

import sys
import os

# Add neocheck/ to sys.path so bare imports like `from config import ...` resolve,
# mirroring what app.py does at runtime (line 43).
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
