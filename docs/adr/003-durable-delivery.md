# ADR 003: Recover deliveries from PostgreSQL and reconcile uncertain effects

BullMQ is a scheduling accelerator. The outbox remains the durable work list. The dispatcher repeatedly reads unprocessed, due rows below the attempt limit and enqueues their IDs. Job completion/removal cannot erase unprocessed database work; loss of queue state is recoverable by redispatch.

A worker holds a PostgreSQL session advisory lock per event. Before any provider call, it persists a stable command key with unknown outcome. If the process dies after the provider commits, the next attempt must look up that key. A provider-confirmed absence permits retry with the same key only while the order remains eligible. Provider idempotency also prevents duplicate effects. A timeout is never treated as a definitive payment failure.

All delivery queries and short transactions reuse that session's connection, including inbox processing. Acquiring another connection while retaining the lock would let concurrent deliveries exhaust the pool and wait on themselves. The transaction helper can borrow a caller-owned client without releasing it; it still commits or rolls back each transaction. Provider calls remain outside database transactions. A real HTTP response-loss/reconciliation test runs with an application pool limit of one. Failed unlock discards the connection rather than returning a possibly locked session to the pool.

The synthetic provider runs in a separate HTTP process. Its isolated schema shares the local PostgreSQL server for demonstration convenience, but the worker only uses the HTTP contract. There are no provider foreign keys into the commerce domain. This is not a claim of independent infrastructure or a production provider integration.

The inbox handles duplicate provider responses. Terminal recording may crash after inbox handling and before command settlement; replaying the same provider event then becomes a no-op before settlement completes. Five failures remove a command from automatic dispatch; operators can request an audited replay in the UI. Viewers and other organizations cannot replay it.

Both charge and lookup responses must match the durable command's order and organization before entering the inbox. A valid schema alone does not establish correlation. A mismatch preserves the unknown command, increments the delivery failure count and leaves both orders untouched; a later correctly correlated response can recover. The synthetic response contract does not include amount/currency, so this validation does not claim independent monetary reconciliation.

Concurrency caveat: cancellation can race with an already-issued external payment. The system preserves a late-payment exception rather than pretending the external effect was undone. No refund is automatic.

Validation: real HTTP provider; response-loss adapter after a successful provider call; subprocess exit code 86 after the external effect before local checkpoint; retry budget/authorization; cancellation during uncertainty. A real Redis/BullMQ test deletes only its unique test queue namespace, rebuilds jobs from PostgreSQL and verifies one charge. It is skipped locally when REDIS_URL is absent, mandatory in CI.

Sources consulted 2026-10-14: [BullMQ idempotent jobs](https://docs.bullmq.io/patterns/idempotent-jobs), [connection retry semantics](https://docs.bullmq.io/guide/connections).
