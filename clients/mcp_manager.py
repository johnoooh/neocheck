"""MCP subprocess manager — starts MCP servers and communicates via JSON-RPC over stdio."""

import asyncio
import json
import os
import logging
from typing import Any

logger = logging.getLogger(__name__)


class MCPServer:
    """Manages a single MCP server subprocess (stdio transport)."""

    def __init__(self, name: str, command: str, args: list[str], cwd: str | None = None,
                 env: dict[str, str] | None = None):
        self.name = name
        self.command = command
        self.args = args
        self.cwd = cwd
        self.env = env
        self._process: asyncio.subprocess.Process | None = None
        self._request_id = 0
        self._tools: list[dict[str, Any]] = []
        # Defer lock creation until first use to avoid event loop binding issues
        self._lock: asyncio.Lock | None = None

    def _get_lock(self) -> asyncio.Lock:
        """Get or create the lock, ensuring it's bound to the current event loop."""
        if self._lock is None:
            self._lock = asyncio.Lock()
        return self._lock

    @property
    def is_running(self) -> bool:
        return self._process is not None and self._process.returncode is None

    def _next_id(self) -> int:
        self._request_id += 1
        return self._request_id

    async def start(self) -> None:
        """Spawn the MCP server subprocess."""
        print(f"[MCP:{self.name}] Starting: {self.command} {' '.join(self.args)}")
        print(f"[MCP:{self.name}] Working directory: {self.cwd}")

        env = {**os.environ}
        if self.env:
            env.update(self.env)

        # Use a large buffer limit (1MB) to handle large JSON responses
        # like HTML visualizations which can be 180KB+
        self._process = await asyncio.create_subprocess_exec(
            self.command, *self.args,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=self.cwd,
            env=env,
            limit=1024 * 1024,  # 1MB buffer limit for stdout/stderr streams
        )
        print(f"[MCP:{self.name}] Process started (pid={self._process.pid})")
        logger.info(f"[{self.name}] Started (pid={self._process.pid})")

    async def _send_request(self, method: str, params: dict | None = None, timeout: float = 60.0) -> dict:
        """Send a JSON-RPC request and read the response (JSON Lines protocol)."""
        if not self._process or not self._process.stdin or not self._process.stdout:
            raise RuntimeError(f"[{self.name}] Server not running")

        async with self._get_lock():
            request = {
                "jsonrpc": "2.0",
                "id": self._next_id(),
                "method": method,
            }
            if params is not None:
                request["params"] = params

            # Use JSON Lines format (newline-delimited JSON)
            payload = json.dumps(request) + "\n"

            print(f"[MCP:{self.name}] Sending {method}...")
            self._process.stdin.write(payload.encode())
            await self._process.stdin.drain()

            # Read response as JSON line
            try:
                response = await asyncio.wait_for(self._read_json_line(), timeout=timeout)
                print(f"[MCP:{self.name}] Received response for {method}")
                return response
            except asyncio.TimeoutError:
                print(f"[MCP:{self.name}] TIMEOUT waiting for {method} response after {timeout}s")
                raise

    async def _read_json_line(self) -> dict:
        """Read a single JSON line from stdout.

        Handles large responses by reading until we get a complete JSON object.
        The default readline() has a 64KB limit which can be exceeded by
        large tool responses like HTML visualizations.
        """
        if not self._process or not self._process.stdout:
            raise RuntimeError(f"[{self.name}] No stdout")

        buffer = b""

        while True:
            # Read in chunks to handle very large responses
            # Use readuntil with a larger limit, falling back to chunk reading
            try:
                # Try to read a line (newline-delimited JSON)
                chunk = await self._process.stdout.readline()
            except asyncio.LimitOverrunError as e:
                # Buffer limit exceeded - read the consumed data and continue
                # This happens with very large JSON responses (>64KB default)
                print(f"[MCP:{self.name}] Large response detected, reading in chunks...")
                chunk = await self._process.stdout.read(e.consumed)
                # Continue reading until we find the newline
                while True:
                    try:
                        remainder = await self._process.stdout.readline()
                        chunk += remainder
                        break
                    except asyncio.LimitOverrunError as e2:
                        chunk += await self._process.stdout.read(e2.consumed)

            if not chunk:
                # Check for stderr
                stderr_data = b""
                if self._process.stderr:
                    try:
                        stderr_data = await asyncio.wait_for(
                            self._process.stderr.read(4096), timeout=1.0
                        )
                    except asyncio.TimeoutError:
                        pass
                raise RuntimeError(
                    f"[{self.name}] Server closed stdout. "
                    f"stderr: {stderr_data.decode(errors='replace')}"
                )

            buffer += chunk

            # Check if we have a complete line (ends with newline)
            if buffer.endswith(b'\n'):
                line_str = buffer.decode().strip()
                buffer = b""

                if not line_str:
                    # Empty line, skip
                    continue

                try:
                    return json.loads(line_str)
                except json.JSONDecodeError:
                    # Not valid JSON, might be debug output, skip
                    print(f"[MCP:{self.name}] Skipping non-JSON line: {line_str[:100]}")
                    continue

    async def initialize(self) -> dict:
        """Perform the MCP initialize handshake."""
        print(f"[MCP:{self.name}] Sending initialize request...")

        try:
            response = await self._send_request("initialize", {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {
                    "name": "neocheck",
                    "version": "1.0.0",
                },
            }, timeout=30.0)
        except asyncio.TimeoutError:
            # Try to read stderr for more info
            stderr_msg = ""
            if self._process and self._process.stderr:
                try:
                    stderr_data = await asyncio.wait_for(self._process.stderr.read(4096), timeout=1.0)
                    stderr_msg = stderr_data.decode(errors='replace')
                except Exception:
                    pass
            raise RuntimeError(f"[{self.name}] Initialize timed out after 30s. stderr: {stderr_msg}")

        print(f"[MCP:{self.name}] Initialize response received")

        if "error" in response:
            raise RuntimeError(f"[{self.name}] Init error: {response['error']}")

        # Send initialized notification (no response expected) - JSON Lines format
        notification = {
            "jsonrpc": "2.0",
            "method": "notifications/initialized",
        }
        payload = json.dumps(notification) + "\n"
        if self._process and self._process.stdin:
            self._process.stdin.write(payload.encode())
            await self._process.stdin.drain()

        print(f"[MCP:{self.name}] Initialization complete")
        return response.get("result", {})

    async def list_tools(self) -> list[dict[str, Any]]:
        """Get the list of tools from this server."""
        print(f"[MCP:{self.name}] Requesting tools list...")

        try:
            response = await asyncio.wait_for(
                self._send_request("tools/list", {}),
                timeout=15.0  # 15 second timeout for tools list
            )
        except asyncio.TimeoutError:
            raise RuntimeError(f"[{self.name}] tools/list timed out after 15s")

        if "error" in response:
            raise RuntimeError(f"[{self.name}] tools/list error: {response['error']}")

        self._tools = response.get("result", {}).get("tools", [])
        print(f"[MCP:{self.name}] Found {len(self._tools)} tools")
        return self._tools

    async def call_tool(self, tool_name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        """Call a tool on this server."""
        # Use longer timeout for tool calls - external API queries can be slow
        response = await self._send_request("tools/call", {
            "name": tool_name,
            "arguments": arguments,
        }, timeout=120.0)  # 2 minutes for external API calls

        if "error" in response:
            return {
                "isError": True,
                "content": [{"type": "text", "text": json.dumps(response["error"])}],
            }

        return response.get("result", {})

    async def stop(self) -> None:
        """Gracefully shut down the server subprocess."""
        if self._process:
            try:
                if self._process.stdin:
                    self._process.stdin.close()
                self._process.terminate()
                await asyncio.wait_for(self._process.wait(), timeout=5.0)
            except (asyncio.TimeoutError, ProcessLookupError):
                self._process.kill()
            finally:
                logger.info(f"[{self.name}] Stopped")
                self._process = None


class MCPManager:
    """Manages multiple MCP server subprocesses and routes tool calls."""

    def __init__(self, servers_config: dict[str, dict[str, Any]]):
        """
        servers_config: mapping of prefix → {command, args, cwd, env}
        Example:
            {
                "cedar": {"command": "node", "args": ["dist/index.js"], "cwd": "/path/to/CEDARMCP"},
                "pubmed": {"command": "python", "args": ["-m", "pubmedmcp"], "cwd": "/path/to/pubmedmcp"},
            }
        """
        self._servers: dict[str, MCPServer] = {}
        self._tool_map: dict[str, tuple[str, str]] = {}  # prefixed_name → (server_prefix, original_name)
        self._all_tools: list[dict[str, Any]] = []

        for prefix, config in servers_config.items():
            self._servers[prefix] = MCPServer(
                name=prefix,
                command=config["command"],
                args=config.get("args", []),
                cwd=config.get("cwd"),
                env=config.get("env"),
            )

    async def start_all(self) -> dict[str, str]:
        """Start all servers, run initialize + list_tools. Returns status per server."""
        statuses: dict[str, str] = {}

        print(f"\n{'='*60}")
        print(f"Starting {len(self._servers)} MCP servers...")
        print(f"{'='*60}\n")

        for prefix, server in self._servers.items():
            print(f"\n--- Starting {prefix.upper()} ---")
            try:
                await server.start()
                await server.initialize()
                tools = await server.list_tools()

                # Register tools with prefixed names
                for tool in tools:
                    original_name = tool["name"]
                    prefixed_name = f"{prefix}__{original_name}"
                    self._tool_map[prefixed_name] = (prefix, original_name)

                    # Create Anthropic-compatible tool definition
                    self._all_tools.append({
                        "name": prefixed_name,
                        "description": f"[{prefix.upper()}] {tool.get('description', '')}",
                        "input_schema": tool.get("inputSchema", {"type": "object", "properties": {}}),
                    })

                statuses[prefix] = f"ok ({len(tools)} tools)"
                print(f"[MCP:{prefix}] SUCCESS: {len(tools)} tools loaded")
            except Exception as e:
                statuses[prefix] = f"error: {e}"
                print(f"[MCP:{prefix}] FAILED: {e}")
                logger.error(f"[{prefix}] Failed to start: {e}")

        print(f"\n{'='*60}")
        ok_count = sum(1 for s in statuses.values() if s.startswith("ok"))
        print(f"MCP startup complete: {ok_count}/{len(statuses)} servers running")
        print(f"Total tools available: {len(self._all_tools)}")
        print(f"{'='*60}\n")

        return statuses

    def get_all_tools(self) -> list[dict[str, Any]]:
        """Return merged tool definitions formatted for the Anthropic API."""
        return self._all_tools

    def get_server_for_tool(self, prefixed_name: str) -> tuple[str, str] | None:
        """Given a prefixed tool name, return (server_prefix, original_tool_name)."""
        return self._tool_map.get(prefixed_name)

    async def call_tool(self, prefixed_name: str, arguments: dict[str, Any]) -> list[dict[str, Any]]:
        """Route a tool call to the correct server. Returns content blocks."""
        mapping = self._tool_map.get(prefixed_name)
        if not mapping:
            return [{"type": "text", "text": f"Unknown tool: {prefixed_name}"}]

        server_prefix, original_name = mapping
        server = self._servers.get(server_prefix)
        if not server or not server.is_running:
            return [{"type": "text", "text": f"Server '{server_prefix}' is not running"}]

        try:
            result = await server.call_tool(original_name, arguments)

            if result.get("isError"):
                return result.get("content", [{"type": "text", "text": "Tool error (no details)"}])

            content = result.get("content", [])
            if not content:
                return [{"type": "text", "text": json.dumps(result, default=str)}]
            return content

        except Exception as e:
            return [{"type": "text", "text": f"Error calling {prefixed_name}: {e}"}]

    async def stop_all(self) -> None:
        """Stop all running MCP servers."""
        for server in self._servers.values():
            try:
                await server.stop()
            except Exception as e:
                logger.error(f"[{server.name}] Error stopping: {e}")

        self._tool_map.clear()
        self._all_tools.clear()
