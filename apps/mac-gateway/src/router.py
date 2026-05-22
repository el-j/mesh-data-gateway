from __future__ import annotations

from typing import Callable

from integrations.iot import handle_iot
from integrations.mcp_client import handle_mcp
from integrations.telegram import handle_telegram
from protocol import RouteId

Handler = Callable[[str], str]


class Router:
    def __init__(self, handlers: dict[int, Handler] | None = None) -> None:
        self._handlers = handlers or {
            RouteId.HUMAN_CHAT: lambda payload: f"ECHO: {payload}",
            RouteId.MCP_REQUEST: handle_mcp,
            RouteId.TELEGRAM: handle_telegram,
            RouteId.IOT_CONTROL: handle_iot,
        }

    def route(self, route_id: int, payload_text: str) -> str:
        handler = self._handlers.get(route_id)
        if handler is None:
            raise ValueError(f"Unsupported route ID: 0x{route_id:02X}")
        return handler(payload_text)
