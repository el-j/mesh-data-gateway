from __future__ import annotations


def handle_telegram(payload_text: str) -> str:
    return f"TELEGRAM RELAYED: {payload_text}"
