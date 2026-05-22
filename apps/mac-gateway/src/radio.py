from __future__ import annotations

from typing import Callable

PRIVATE_APP_PORT = 256


class InMemoryRadio:
    def __init__(self, *, port_num: int = PRIVATE_APP_PORT) -> None:
        self.port_num = port_num
        self._receivers: list[Callable[[bytes], None]] = []
        self.sent_packets: list[tuple[int, bytes]] = []

    def register_receiver(self, callback: Callable[[bytes], None]) -> None:
        self._receivers.append(callback)

    def inject(self, *, port_num: int, payload: bytes) -> None:
        if port_num != self.port_num:
            return
        for callback in self._receivers:
            callback(payload)

    def transmit(self, payload: bytes, *, port_num: int | None = None) -> None:
        self.sent_packets.append((self.port_num if port_num is None else port_num, payload))
