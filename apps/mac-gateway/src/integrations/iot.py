from __future__ import annotations

import json


def handle_iot(payload_text: str) -> str:
    try:
        payload = json.loads(payload_text)
    except json.JSONDecodeError:
        return f"IOT ERROR: invalid json: {payload_text}"

    command = payload.get("cmd", "unknown")
    return f"IOT ACK: {command}"
