# Mesh Data Gateway Protocol Specification (v2.0 Routed)

This document defines the shared message protocol used by both:

- `apps/web-client/src/lib/`
- `apps/mac-gateway/src/protocol.py`

## Transport Constraints

- **Target PortNum:** `PRIVATE_APP` (or a specific unused integer)
- **Max packet size:** `200` bytes
- **Header size:** `4` bytes
- **Payload bytes per packet:** up to `196` bytes (`200 - 4`)

## Packet Layout

| Byte Offset | Field        | Description |
|---|---|---|
| 0 | Route ID     | Service destination selector |
| 1 | Message ID   | Random `0x00-0xFF`, shared by all chunks of one message |
| 2 | Chunk Index  | 1-based chunk number |
| 3 | Total Chunks | Total number of chunks for this message |
| 4-199 | Payload   | SMAZ-compressed text/JSON bytes |

## Route IDs

| Route ID | Meaning |
|---|---|
| `0x01` | Human Chat |
| `0x02` | MCP Request (Claude/Copilot via MCP) |
| `0x03` | Telegram Relay |
| `0x04` | IoT Control |

## Behavioral Rules

1. Sender compresses plaintext/JSON with SMAZ.
2. Compressed output is split into chunks of max `196` bytes.
3. Each chunk is prefixed with the 4-byte header.
4. Receiver buffers chunks by `(Message ID, Route ID)` until `Total Chunks` are collected.
5. Chunks are reassembled in ascending `Chunk Index` order.
6. Reassembled payload is decompressed and routed using `Route ID`.
7. Reassembly buffers should expire stale/incomplete messages after `60s`.

## Interop Requirement

Python and TypeScript implementations must be byte-compatible for:

- compression/decompression output handling,
- chunk creation,
- reassembly,
- route dispatch byte interpretation.
