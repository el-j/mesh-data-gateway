from __future__ import annotations

import pytest

from protocol import MAX_PAYLOAD_SIZE, ProtocolCodec, ReassemblyBuffer, RouteId


def test_encode_decode_single_chunk_round_trip() -> None:
    codec = ProtocolCodec()
    packets = codec.encode_chunks(RouteId.HUMAN_CHAT, "hello world", message_id=10)

    assert len(packets) == 1
    decoded = codec.decode_packet(packets[0])
    assert decoded.route_id == RouteId.HUMAN_CHAT
    assert decoded.message_id == 10
    assert decoded.chunk_index == 1
    assert decoded.total_chunks == 1
    assert decoded.payload_text == "hello world"


def test_encode_decode_multi_chunk_round_trip() -> None:
    codec = ProtocolCodec()
    message = "x" * (MAX_PAYLOAD_SIZE * 2 + 10)
    packets = codec.encode_chunks(RouteId.MCP_REQUEST, message, message_id=200)

    assert len(packets) == 3
    for index, packet in enumerate(packets, start=1):
        decoded = codec.decode_packet(packet)
        assert decoded.chunk_index == index
        assert decoded.total_chunks == 3


def test_decode_packet_rejects_too_short_packet() -> None:
    codec = ProtocolCodec()
    with pytest.raises(ValueError, match="at least 4 bytes"):
        codec.decode_packet(b"\x01\x02\x03")


def test_reassembly_handles_out_of_order_packets() -> None:
    codec = ProtocolCodec()
    buf = ReassemblyBuffer(codec=codec, timeout_seconds=60, now_fn=lambda: 1.0)
    packets = codec.encode_chunks(RouteId.TELEGRAM, "a" * (MAX_PAYLOAD_SIZE + 5), message_id=33)

    assert buf.add_packet(packets[1]) is None
    result = buf.add_packet(packets[0])

    assert result is not None
    assert result.route_id == RouteId.TELEGRAM
    assert result.message_id == 33
    assert result.payload_text == "a" * (MAX_PAYLOAD_SIZE + 5)


def test_reassembly_rejects_inconsistent_total_chunks() -> None:
    codec = ProtocolCodec()
    packets = codec.encode_chunks(RouteId.IOT_CONTROL, "abc", message_id=7)
    tampered = bytearray(packets[0])
    tampered[3] = 2

    buf = ReassemblyBuffer(codec=codec, timeout_seconds=60, now_fn=lambda: 2.0)
    buf.add_packet(bytes(tampered))
    with pytest.raises(ValueError, match="inconsistent total chunks"):
        buf.add_packet(packets[0])


def test_expire_stale_messages() -> None:
    now = [0.0]
    codec = ProtocolCodec()
    buf = ReassemblyBuffer(codec=codec, timeout_seconds=5, now_fn=lambda: now[0])
    packets = codec.encode_chunks(RouteId.HUMAN_CHAT, "a" * (MAX_PAYLOAD_SIZE + 1), message_id=9)
    buf.add_packet(packets[0])

    now[0] = 6.0
    assert buf.expire_stale() == 1


def test_encode_uses_random_message_id_when_missing() -> None:
    codec = ProtocolCodec(rng=__import__("random").Random(1))
    packet = codec.encode_chunks(RouteId.HUMAN_CHAT, "abc")[0]
    assert packet[1] == 68


def test_encode_rejects_invalid_route_id() -> None:
    codec = ProtocolCodec()
    with pytest.raises(ValueError, match="route_id must fit in one byte"):
        codec.encode_chunks(999, "abc", message_id=1)


def test_encode_rejects_invalid_message_id() -> None:
    codec = ProtocolCodec()
    with pytest.raises(ValueError, match="message_id must fit in one byte"):
        codec.encode_chunks(RouteId.HUMAN_CHAT, "abc", message_id=999)


def test_decode_rejects_invalid_chunk_index_and_total() -> None:
    codec = ProtocolCodec()
    with pytest.raises(ValueError, match="chunk_index must be >= 1"):
        codec.decode_packet(bytes([1, 2, 0, 1]))
    with pytest.raises(ValueError, match="total_chunks must be >= 1"):
        codec.decode_packet(bytes([1, 2, 1, 0]))
    with pytest.raises(ValueError, match="chunk_index cannot exceed total_chunks"):
        codec.decode_packet(bytes([1, 2, 2, 1]))


def test_encode_handles_empty_payload() -> None:
    codec = ProtocolCodec()
    packets = codec.encode_chunks(RouteId.HUMAN_CHAT, "", message_id=1)
    assert len(packets) == 1
    decoded = codec.decode_packet(packets[0])
    assert decoded.payload_text == ""
