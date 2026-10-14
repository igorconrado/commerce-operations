# Verification record

## First reservation slice — 2026-10-14

Environment: Windows host, Node 25.4.0, native PostgreSQL 18.4 launched through pinned embedded-postgres 18.4.0-beta.17. CI is configured separately for Node 24 and a PostgreSQL 18.4 service. The initial runs occurred before the first feature commit and are not mislabeled as clean-commit benchmarks.

Executed successfully:

- Five unit tests: input bounds/tenant injection, command fingerprint, role checks, bounded pagination and password verification.
- Six integration tests on real PostgreSQL: 100 concurrent reservations/10 stock; 20 identical keys; changed-payload conflict; cross-tenant/role rejection; SQL-trigger failure after stock decrement and complete rollback; price snapshots/cursors; session/GraphQL/logout/origin boundaries.
- Production Next build, strict TypeScript and ESLint. First typecheck found an untyped validation hook; fixed with the GraphQL ValidationRule contract. Lint found ref access during render; retry state now uses React state. ESLint 10.12.0 runs successfully.
- Browser main flow on Chromium desktop and mobile emulation: login → reserve two units → reload → database stock check → viewer cannot mutate. Screenshots inspected at both widths. Physical devices and spoken screen readers were not tested.

Recovery-test first run: the error appeared correctly, but Playwright's generic alert selector matched both application and Next route announcer. The selector was narrowed to the error's content. Final rerun is recorded in the session checkpoint/CI, not assumed here.

Final browser rerun: all four scenarios passed (desktop/mobile main flow and keyboard/network-retry flow). Production dependency audit passed; the development audit emitted only the documented exception.

Clean-tree database rerun at commit `f32f07a9f0fd7d51d1d1e15e1e51df917e42d9a6`: all six integration tests passed. [Raw concurrency data](reports/reservation-concurrency-2026-10-14.json) records 10 accepted/90 expected stock refusals, with per-request p50 139.69 ms, p95 285.61 ms and p99 326.06 ms. These single-run durations include connection/pool wait and are not performance gains. [Implementation PR #1](https://github.com/igorconrado/commerce-operations/pull/1) is self-authored, not independent review.

Docker: initial named pipe absent; after starting Docker Desktop, `docker info` did not complete. That individual diagnostic process was stopped. No existing containers or user data were deleted. Native PostgreSQL provided an independent test environment. Container build/execution remains a separate CI/local boundary.

Dependency audit: the initial development graph contained an unpatched braces advisory. Replacing the Next ESLint preset with maintained compatible TypeScript/React Hooks plugins removed that dependency chain. The final full audit reports zero advisories; no allowlist remains. See [security](security.md).

## Methods and limitations

The concurrency test launches 100 promises through a pool of 20 connections and checks persisted counts in orders, movements, idempotency, audit and outbox. Expected stock refusals are distinguished from unexpected errors. It records per-request elapsed time, percentiles, total elapsed, runtime/platform/CPU, PostgreSQL version, Git HEAD and dirty state. This is a correctness experiment, not a saturated throughput benchmark: OS resource sampling, warmup, independent repeats and a correct comparison baseline remain pending.

The failure test installs a PostgreSQL trigger that rejects outbox insertion after the stock update. It verifies that all transaction writes roll back, removes the trigger and retries successfully. It is not a worker-crash or Redis-loss experiment.

No real payments, cloud provisioning, public deployment, independent review or management experience is claimed. The [evidence matrix](evidence.md) preserves remaining gaps.
