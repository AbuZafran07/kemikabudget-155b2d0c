# Architecture rules
- Author remote agent tools in `src/lib/mcp` with the MCP SDK and Vite plugin; the SDK owns the generated function.
- Remote agent tools use verified OAuth caller credentials and existing RLS only; expose selected read-only financial fields, never service-role or bank details.
- MCP division usage uses stored budget balances; requester attribution nets request movements and signed CA ledger entries, with commitments separate and revision reversals retained. Bounded complete reads must fail rather than silently truncate totals.
- Browser agent tools belong to the screen owning their controls and use shared actions plus fail-open, content-free telemetry.
- OAuth consent returns through the existing password and OTP login flow using one canonical local return-path validator; no new self-registration flow.