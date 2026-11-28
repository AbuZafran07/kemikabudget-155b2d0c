# Selected security findings
- [x] Restrict the two settings reads to active staff and valid sessions; database predicates and signed-in reads verified.
- [x] Bind the three attachment reads to the caller and authorized document access; five SQL predicate tests passed, real medical signed download returned 200, and only five selected findings marked fixed. CA and nominative buckets currently contain no files for live download tests.

# Cash Advance safeguards and AI
- [x] Add authenticated Lovable AI category suggestions from the request description and authorized division budget posts; live model response and application of suggestions verified.
- [x] Check live per-category availability including commitments; signed-in UI verified shortage lock, equality boundary and draft readback. Test draft removed through the UI.
- [x] Enforce concurrent-safe submission checks; isolated PostgreSQL test proves one of two competing reservations succeeds and missing posts leave zero partial reservations. Unit tests cover grouped totals and unavailable balances.

# Agent integrations
- [x] Add division/category and requester usage summaries plus reference lookup; five tests passed, real caller-scoped reports returned 6 divisions/23 categories/31 person-division rows, authenticated budget screen verified. External OAuth tool calls await republication.
- [x] Add read-only OAuth MCP tools using caller-scoped access.
- [x] Add consent page and preserve password/OTP login return path.
- [x] Add dashboard browser tools with telemetry (native discovery unavailable in test browser).
- [x] Extract manifest; test local return paths and signed-in UI. Approve/deny errors verified with simulated provider responses; hosted OAuth end-to-end awaits publication.
- [ ] Republish for hosted activation (requires user publication).