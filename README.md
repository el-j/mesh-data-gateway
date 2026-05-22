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

- [x] Python compression/chunking/reassembly implemented in `apps/mac-gateway/src/protocol.py`.
- [x] TypeScript matching codec/reassembly implemented in `apps/web-client/src/lib/protocol.ts`.
- [x] Test-driven coverage for protocol behavior in both runtimes.

### Phase 3: Mac Gateway & Routing Logic

- [x] Radio adapter implemented (`InMemoryRadio`) with dedicated PortNum filtering in `radio.py`.
- [x] Route dispatch implemented in `router.py`.
- [x] Working integrations and return-path flow implemented via `main.py` gateway service.

### Phase 4: Web SPA & Multi-Service UI

- [x] React UI with target-service selector and message composer implemented in `src/App.tsx`.
- [x] Meshtastic transport abstraction implemented (`src/meshtastic/transport.ts`) with loopback test transport.
- [x] Send/receive protocol wiring implemented using chunk/reassembly pipeline and route-based responses.

### Phase 5: Advanced Integrations & Polish

- [x] MCP integration handler implemented (`integrations/mcp_client.py`).
- [x] PWA install scaffolding added (`public/manifest.webmanifest` and `public/sw.js`, registered in `src/main.tsx`).
- [x] Reassembly timeout/stale-message expiration implemented (default 60s) in Python and TypeScript buffers.

## Local Development

### Mac Gateway (Python)

```bash
cd /home/runner/work/mesh-data-gateway/mesh-data-gateway/apps/mac-gateway
python -m pip install pytest pytest-cov
python -m pytest -q
```

### Web Client (TypeScript/React)

```bash
cd /home/runner/work/mesh-data-gateway/mesh-data-gateway/apps/web-client
npm install
npm run test
npm run build
```

Both Python and web suites are configured and validated at **100% statements/branches/functions/lines coverage** for implemented modules.
