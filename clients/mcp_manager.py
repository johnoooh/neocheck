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
        self._lock = asyncio.Lock()

    @property
    def is_running(self) -> bool:
        return self._process is not None and self._process.returncode is None

    def _next_id(self) -> int:
        self._request_id += 1
        return self._request_id

    async def start(self) -> None:
        """Spawn the MCP server subprocess."""
        env = {**os.environ}
        if self.env:
            env.update(self.env)

        self._process = await asyncio.create_subprocess_exec(
            self.command, *self.args,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=self.cwd,
            env=env,
        )
        logger.info(f"[{self.name}] Started (pid={self._process.pid})")

    async def _send_request(self, method: str, params: dict | None = None) -> dict:
        """Send a JSON-RPC request and read the response."""
        if not self._process or not self._process.stdin or not self._process.stdout:
            raise RuntimeError(f"[{self.name}] Server not running")

        async with self._lock:
            request = {
                "jsonrpc": "2.0",
                "id": self._next_id(),
                "method": method,
            }
            if params is not None:
                request["params"] = params

            payload = json.dumps(request)
            message = f"Content-Length: {len(payload)}\r\n\r\n{payload}"

            self._process.stdin.write(message.encode())
            await self._process.stdin.drain()

            # Read response: parse Content-Length header, then body
            response = await self._read_response()
            return response

    async def _read_response(self) -> dict:
        """Read a JSON-RPC response from stdout using Content-Length framing."""
        if not self._process or not self._process.stdout:
            raise RuntimeError(f"[{self.name}] No stdout")

        # Read headers until we find Content-Length
        content_length = 0
        while True:
            line = await self._process.stdout.readline()
            if not line:
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

            line_str = line.decode().strip()
            if line_str == "":
                # Empty line = end of headers
                break
            if line_str.lower().startswith("content-length:"):
                content_length = int(line_str.split(":", 1)[1].strip())

        if content_length == 0:
            raise RuntimeError(f"[{self.name}] No Content-Length in response")

        # Read body
        body = await self._process.stdout.readexactly(content_length)
        return json.loads(body)

    async def initialize(self) -> dict:
        """Perform the MCP initialize handshake."""
        response = await self._send_request("initialize", {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {
                "name": "neocheck",
                "version": "1.0.0",
            },
        })

        if "error" in response:
            raise RuntimeError(f"[{self.name}] Init error: {response['error']}")

        # Send initialized notification (no response expected)
        notification = {
            "jsonrpc": "2.0",
            "method": "notifications/initialized",
        }
        payload = json.dumps(notification)
        message = f"Content-Length: {len(payload)}\r\n\r\n{payload}"
        if self._process and self._process.stdin:
            self._process.stdin.write(message.encode())
            await self._process.stdin.drain()

        return response.get("result", {})

    async def list_tools(self) -> list[dict[str, Any]]:
        """Get the list of tools from this server."""
        response = await self._send_request("tools/list", {})
        if "error" in response:
            raise RuntimeError(f"[{self.name}] tools/list error: {response['error']}")

        self._tools = response.get("result", {}).get("tools", [])
        return self._tools

    async def call_tool(self, tool_name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        """Call a tool on this server."""
        response = await self._send_request("tools/call", {
            "name": tool_name,
            "arguments": arguments,
        })

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

        for prefix, server in self._servers.items():
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
            except Exception as e:
                statuses[prefix] = f"error: {e}"
                logger.error(f"[{prefix}] Failed to start: {e}")

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
