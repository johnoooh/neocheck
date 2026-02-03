"""Persistent MCP session manager for chat interface.

Keeps MCP servers running during a chat session to avoid startup latency
between messages.
"""

import asyncio
import logging
from typing import Any

from clients.mcp_manager import MCPManager

logger = logging.getLogger(__name__)


class MCPSession:
    """Manages MCP server lifecycle for a persistent chat session."""

    def __init__(self, config: dict[str, dict[str, Any]]):
        """
        Initialize session with server configuration.

        Args:
            config: MCP server configuration dict (from config.py MCP_SERVERS_CONFIG)
        """
        self.config = config
        self.manager: MCPManager | None = None
        self.status: dict[str, str] = {}
        self._initialized = False

    @property
    def is_running(self) -> bool:
        """Check if servers have been started."""
        return self._initialized and self.manager is not None

    @property
    def tools(self) -> list[dict[str, Any]]:
        """Get available tools (empty if not initialized)."""
        if self.manager:
            return self.manager.get_all_tools()
        return []

    async def ensure_started(self) -> dict[str, str]:
        """
        Start servers if not already running.

        Returns:
            Dict of server_name → status string (e.g., "ok (5 tools)" or "error: ...")
        """
        if self._initialized and self.manager:
            print("[MCPSession] Already initialized, reusing existing servers")
            return self.status

        print("[MCPSession] Initializing MCP servers...")
        self.manager = MCPManager(self.config)
        self.status = await self.manager.start_all()
        self._initialized = True

        # Log overall status
        ok_count = sum(1 for s in self.status.values() if s.startswith("ok"))
        logger.info(f"MCP Session started: {ok_count}/{len(self.status)} servers running")

        return self.status

    async def restart_server(self, name: str) -> str:
        """
        Restart a specific server (useful for error recovery).

        Args:
            name: Server prefix (e.g., "cedar", "pubmed")

        Returns:
            New status string for the server
        """
        if not self.manager:
            return "error: session not initialized"

        # Stop and restart would require exposing internal server management
        # For now, restart entire session
        await self.shutdown()
        await self.ensure_started()
        return self.status.get(name, "unknown")

    async def call_tool(self, tool_name: str, arguments: dict[str, Any]) -> list[dict[str, Any]]:
        """
        Call a tool via the MCP manager.

        Args:
            tool_name: Prefixed tool name (e.g., "cedar__search_epitopes")
            arguments: Tool arguments dict

        Returns:
            Content blocks from tool execution
        """
        if not self.manager:
            return [{"type": "text", "text": "MCP session not initialized"}]

        return await self.manager.call_tool(tool_name, arguments)

    async def shutdown(self) -> None:
        """Clean shutdown of all servers."""
        if self.manager:
            logger.info("Shutting down MCP session...")
            await self.manager.stop_all()

        self.manager = None
        self.status = {}
        self._initialized = False
        logger.info("MCP session shutdown complete")

    def __del__(self):
        """Attempt cleanup on garbage collection."""
        if self._initialized and self.manager:
            try:
                # Try to run cleanup in existing event loop
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    loop.create_task(self.shutdown())
                else:
                    loop.run_until_complete(self.shutdown())
            except Exception:
                # Best effort cleanup
                pass
