# Agent integrations
- [x] Add division/category and requester usage summaries plus reference lookup; five tests passed, real caller-scoped reports returned 6 divisions/23 categories/31 person-division rows, authenticated budget screen verified. External OAuth tool calls await republication.
- [x] Add read-only OAuth MCP tools using caller-scoped access.
- [x] Add consent page and preserve password/OTP login return path.
- [x] Add dashboard browser tools with telemetry (native discovery unavailable in test browser).
- [x] Extract manifest; test local return paths and signed-in UI. Approve/deny errors verified with simulated provider responses; hosted OAuth end-to-end awaits publication.
- [ ] Republish for hosted activation (requires user publication).