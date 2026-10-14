# Observe and diagnose

GraphQL responses carry a server-generated request ID; JSON request logs record ID, HTTP status and duration without credentials or raw queries. Worker logs emit delivery started/completed span records keyed by durable outbox ID. That ID resolves to organization, aggregate/version, attempt budget and durable error in PostgreSQL. This is lightweight correlation, not a deployed OpenTelemetry collector or full distributed trace platform.

Authenticated operator-only `GET /api/metrics` returns organization-scoped order count, pending/failed events, uncertain payments and open exceptions. It does not expose another organization's counts. GraphQL business failures may have HTTP 200; inspect typed errors and domain metrics instead of equating transport success with business success.

For a failed reservation: find the request ID, inspect the domain code, confirm stock/order through the authorized UI. Never retry with a new idempotency key solely because the response was lost. For delivery failure: identify the outbox ID, inspect the unknown command and provider lookup, restore provider availability, then request authorized replay. Do not manually mark a payment successful or delete inbox/command rows to force progress.

Pending gaps: exported histograms, end-to-end HTTP saturation/resource benchmark, long-running alert thresholds and an external trace backend. Current measurements are lab evidence, not production SLOs.
