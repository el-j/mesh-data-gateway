from __future__ import annotations

from dataclasses import dataclass

from protocol import ProtocolCodec, ReassemblyBuffer
from radio import InMemoryRadio, PRIVATE_APP_PORT
from router import Router


@dataclass
class GatewayService:
    codec: ProtocolCodec
    reassembly: ReassemblyBuffer
    router: Router
    radio: InMemoryRadio
    port_num: int

    def handle_incoming_packet(self, packet: bytes) -> None:
        complete = self.reassembly.add_packet(packet)
        if complete is None:
            return

        response_text = self.router.route(complete.route_id, complete.payload_text)
        for outbound in self.codec.encode_chunks(complete.route_id, response_text):
            self.radio.transmit(outbound, port_num=self.port_num)


def create_gateway(*, radio: InMemoryRadio | None = None, port_num: int = PRIVATE_APP_PORT) -> GatewayService:
    codec = ProtocolCodec()
    reassembly = ReassemblyBuffer(codec=codec)
    router = Router()
    resolved_radio = radio or InMemoryRadio(port_num=port_num)

    service = GatewayService(
        codec=codec,
        reassembly=reassembly,
        router=router,
        radio=resolved_radio,
        port_num=port_num,
    )
    resolved_radio.register_receiver(service.handle_incoming_packet)
    return service
