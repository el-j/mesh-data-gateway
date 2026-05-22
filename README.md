# Mesh Data Gateway (MDG)

MDG is a payload-agnostic transport tunnel over Meshtastic that uses compression and chunking to move payloads larger than a single LoRa packet. Routing is controlled by a single route byte in the message header.

## Monorepo Structure

```text
mesh-data-gateway/
├── README.md
├── .gitignore
├── protocol/
│   ├── protocol-spec.md
│   └── mock_data.json
└── apps/
    ├── web-client/
    │   ├── package.json
    │   ├── vite.config.ts
    │   ├── src/
    │   │   ├── components/
    │   │   ├── lib/
    │   │   └── meshtastic/
    │   └── public/
    └── mac-gateway/
        ├── pyproject.toml
        ├── .env.example
        ├── src/
        │   ├── main.py
        │   ├── radio.py
        │   ├── protocol.py
        │   ├── router.py
        │   └── integrations/
        │       ├── mcp_client.py
        │       ├── telegram.py
        │       └── iot.py
        └── tests/
```

## Technology Stack

- **Web Client:** Vite + TypeScript, Web Bluetooth/Web Serial APIs, PWA support, SMAZ-style compression.
- **Mac Gateway:** Python 3.11+, `meshtastic`, `pysmaz`, MCP-compatible forwarding, and webhook integrations.
- **Hardware:** 2x Heltec v4 LoRa nodes (mobile + Mac gateway side).

## Protocol Summary (v2.0 Routed)

- **PortNum:** `PRIVATE_APP` (or another dedicated unused port)
- **Packet size:** `200` bytes
- **Header size:** `4` bytes
- **Payload per chunk:** `196` bytes

Header bytes:

- Byte 0: Route ID (`0x01` Chat, `0x02` MCP, `0x03` Telegram, `0x04` IoT)
- Byte 1: Message ID (`0x00-0xFF`)
- Byte 2: Chunk Index
- Byte 3: Total Chunks

Payload bytes `4-199` carry SMAZ-compressed content.

See:

- `protocol/protocol-spec.md`
- `protocol/mock_data.json`

## Implementation Plan

### Phase 1: Repository & Protocol Foundation

- [x] Monorepo directories scaffolded for web client, mac gateway, and shared protocol.
- [x] Routing table and byte-level protocol documented.
- [x] Mock payload examples added for all route IDs and multi-chunk messages.

### Phase 2: Core Tunnel (Compression & Chunking)

- [ ] Python: implement compression, chunking, and reassembly in `apps/mac-gateway/src/protocol.py`.
- [ ] TypeScript: implement matching logic in `apps/web-client/src/lib/`.
- [ ] Add cross-language tests for JS -> Python reconstruction.

### Phase 3: Mac Gateway & Routing Logic

- [ ] Implement Meshtastic listener in `radio.py` on dedicated PortNum.
- [ ] Implement route dispatch in `router.py`.
- [ ] Add at least one working integration and return-path transmit flow.

### Phase 4: Web SPA & Multi-Service UI

- [ ] Build service-select UI.
- [ ] Implement Web Bluetooth connection path.
- [ ] Wire send/receive protocol paths to UI routing.

### Phase 5: Advanced Integrations & Polish

- [ ] Implement MCP forwarding integration.
- [ ] Add PWA install/offline support.
- [ ] Add 60s reassembly timeout and stale-message handling.
