from __future__ import annotations

from dataclasses import dataclass
from enum import IntEnum
import random
import time
from typing import Callable

MAX_PACKET_SIZE = 200
HEADER_SIZE = 4
MAX_PAYLOAD_SIZE = MAX_PACKET_SIZE - HEADER_SIZE
DEFAULT_REASSEMBLY_TIMEOUT_SECONDS = 60


class RouteId(IntEnum):
    HUMAN_CHAT = 0x01
    MCP_REQUEST = 0x02
    TELEGRAM = 0x03
    IOT_CONTROL = 0x04


@dataclass(frozen=True)
class DecodedPacket:
    route_id: int
    message_id: int
    chunk_index: int
    total_chunks: int
    payload_bytes: bytes
    payload_text: str


@dataclass(frozen=True)
class ReassembledMessage:
    route_id: int
    message_id: int
    payload_text: str
    total_chunks: int


@dataclass
class _PendingMessage:
    total_chunks: int
    chunks: dict[int, bytes]
    created_at: float


class ProtocolCodec:
    def __init__(self, *, rng: random.Random | None = None) -> None:
        self._rng = rng or random.Random()

    def compress(self, payload_text: str) -> bytes:
        return payload_text.encode("utf-8")

    def decompress(self, payload_bytes: bytes) -> str:
        return payload_bytes.decode("utf-8")

    def encode_chunks(self, route_id: int, payload_text: str, message_id: int | None = None) -> list[bytes]:
        if not (0 <= route_id <= 0xFF):
            raise ValueError("route_id must fit in one byte")

        compressed = self.compress(payload_text)
        if not compressed:
            data_chunks = [b""]
        else:
            data_chunks = [
                compressed[i : i + MAX_PAYLOAD_SIZE]
                for i in range(0, len(compressed), MAX_PAYLOAD_SIZE)
            ]

        msg_id = self._rng.randint(0, 255) if message_id is None else message_id
        if not (0 <= msg_id <= 0xFF):
            raise ValueError("message_id must fit in one byte")

        total = len(data_chunks)
        packets: list[bytes] = []
        for idx, chunk in enumerate(data_chunks, start=1):
            header = bytes((route_id, msg_id, idx, total))
            packets.append(header + chunk)
        return packets

    def decode_packet(self, packet: bytes) -> DecodedPacket:
        if len(packet) < HEADER_SIZE:
            raise ValueError("Packet must be at least 4 bytes")

        route_id = packet[0]
        message_id = packet[1]
        chunk_index = packet[2]
        total_chunks = packet[3]

        if chunk_index < 1:
            raise ValueError("chunk_index must be >= 1")
        if total_chunks < 1:
            raise ValueError("total_chunks must be >= 1")
        if chunk_index > total_chunks:
            raise ValueError("chunk_index cannot exceed total_chunks")

        payload_bytes = packet[HEADER_SIZE:]
        payload_text = self.decompress(payload_bytes)
        return DecodedPacket(
            route_id=route_id,
            message_id=message_id,
            chunk_index=chunk_index,
            total_chunks=total_chunks,
            payload_bytes=payload_bytes,
            payload_text=payload_text,
        )


class ReassemblyBuffer:
    def __init__(
        self,
        *,
        codec: ProtocolCodec,
        timeout_seconds: int = DEFAULT_REASSEMBLY_TIMEOUT_SECONDS,
        now_fn: Callable[[], float] = time.monotonic,
    ) -> None:
        self._codec = codec
        self._timeout_seconds = timeout_seconds
        self._now_fn = now_fn
        self._pending: dict[tuple[int, int], _PendingMessage] = {}

    def add_packet(self, packet: bytes) -> ReassembledMessage | None:
        decoded = self._codec.decode_packet(packet)
        key = (decoded.route_id, decoded.message_id)
        now = self._now_fn()

        existing = self._pending.get(key)
        if existing is None:
            existing = _PendingMessage(total_chunks=decoded.total_chunks, chunks={}, created_at=now)
            self._pending[key] = existing
        elif existing.total_chunks != decoded.total_chunks:
            raise ValueError("Received packet with inconsistent total chunks")

        existing.chunks[decoded.chunk_index] = decoded.payload_bytes

        if len(existing.chunks) != existing.total_chunks:
            return None

        joined = b"".join(existing.chunks[idx] for idx in range(1, existing.total_chunks + 1))
        payload_text = self._codec.decompress(joined)
        del self._pending[key]

        return ReassembledMessage(
            route_id=decoded.route_id,
            message_id=decoded.message_id,
            payload_text=payload_text,
            total_chunks=existing.total_chunks,
        )

    def expire_stale(self) -> int:
        now = self._now_fn()
        stale_keys = [
            key
            for key, pending in self._pending.items()
            if (now - pending.created_at) > self._timeout_seconds
        ]
        for key in stale_keys:
            del self._pending[key]
        return len(stale_keys)
