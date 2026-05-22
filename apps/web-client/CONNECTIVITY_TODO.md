# Web Client LoRa Connectivity TODO

- [x] Confirm current transport is demo-only (`LoopbackTransport`) with no hardware selection UI.
- [x] Add explicit transport selection in UI (Demo Loopback vs Serial LoRa Board).
- [x] Add clear connection controls for hardware mode (connect/disconnect board).
- [x] Implement browser Web Serial transport with robust frame parsing and typed interfaces.
- [x] Implement browser Web Bluetooth transport (Nordic UART Service) with robust frame parsing.
- [x] Block sending while disconnected and show actionable status feedback.
- [ ] Add native Meshtastic protocol transport (Bluetooth/Serial protobuf) so stock Meshtastic firmware can be used directly without a framing bridge.
- [ ] Add compatibility test matrix for supported browsers, board firmware, and USB serial chipsets.
