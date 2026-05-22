from __future__ import annotations

import pytest

from integrations.iot import handle_iot
from integrations.mcp_client import handle_mcp
from integrations.telegram import handle_telegram
from main import create_gateway
from protocol import MAX_PAYLOAD_SIZE, ProtocolCodec, RouteId
from radio import InMemoryRadio
from router import Router


def test_default_router_handlers() -> None:
    router = Router()
    assert router.route(RouteId.MCP_REQUEST, "ping") == handle_mcp("ping")
    assert router.route(RouteId.TELEGRAM, "ping") == handle_telegram("ping")
    assert router.route(RouteId.IOT_CONTROL, "{\"cmd\":\"on\"}") == handle_iot('{"cmd":"on"}')
    assert router.route(RouteId.IOT_CONTROL, "not-json").startswith("IOT ERROR")


def test_router_unknown_route_raises() -> None:
    router = Router()
    with pytest.raises(ValueError, match="Unsupported route ID"):
        router.route(0x99, "x")


def test_gateway_loopback_response_is_chunked_and_transmitted() -> None:
    radio = InMemoryRadio(port_num=123)
    gateway = create_gateway(radio=radio, port_num=123)
    codec = ProtocolCodec()

    incoming = codec.encode_chunks(RouteId.HUMAN_CHAT, "hello", message_id=77)
    gateway.handle_incoming_packet(incoming[0])

    assert len(radio.sent_packets) == 1
    sent_port, sent_packet = radio.sent_packets[0]
    assert sent_port == 123

    decoded = codec.decode_packet(sent_packet)
    assert decoded.route_id == RouteId.HUMAN_CHAT
    assert "ECHO" in decoded.payload_text


def test_gateway_waits_until_message_complete() -> None:
    radio = InMemoryRadio(port_num=321)
    gateway = create_gateway(radio=radio, port_num=321)
    codec = ProtocolCodec()

    incoming = codec.encode_chunks(RouteId.HUMAN_CHAT, "z" * (MAX_PAYLOAD_SIZE + 10), message_id=11)
    gateway.handle_incoming_packet(incoming[0])
    assert radio.sent_packets == []
    gateway.handle_incoming_packet(incoming[1])
    assert len(radio.sent_packets) >= 1


def test_radio_filters_on_port() -> None:
    radio = InMemoryRadio(port_num=500)
    called = []

    radio.register_receiver(lambda payload: called.append(payload))
    radio.inject(port_num=100, payload=b"abc")
    radio.inject(port_num=500, payload=b"xyz")

    assert called == [b"xyz"]
