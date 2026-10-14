# ADR 001: Keep reservations in one PostgreSQL transaction

Status: implemented in the first slice.

## Problem

Two callers can observe ten available units and each reserve ten if reading and writing are separate operations. Repeated requests after a lost response can also reduce stock twice. Application memory or Redis locks would make correctness depend on process/queue availability.

## Decision

A conditional `UPDATE ... WHERE available >= quantity` decrements stock and locks the matching row. PostgreSQL re-evaluates the condition after a competing update. The order, historical price, stock movement, idempotency result, audit record and outbox event commit together.

A transaction-scoped advisory lock serializes each organization/key before checking the payload hash. The hash includes actor, variant and quantity. SQL unique constraints are the final guard. A hash collision can serialize unrelated keys but cannot conflate their stored identity. Tenant predicates and composite foreign keys constrain every aggregate write. Business authorization runs before the transaction.

Alternatives: optimistic version retries add retry complexity for a hot stock row; serializable isolation is useful for broader predicates but unnecessary for this bounded update; a distributed Redis lock introduces an avoidable correctness dependency. A real benchmark must compare correct alternatives before claiming speed improvements.

## Consequences and limitations

Hot inventory rows serialize. Pool/statement timeouts bound waits; callers can safely retry with the same idempotency key. The first slice has one line per order, one warehouse, and no release/expiry worker. Idempotency retention is indefinite until a documented retention design exists. Outbox presence proves atomic recording, not eventual delivery.

Test evidence: 100 concurrent commands against 10 units; 20 identical keys; changed payload; cross-tenant variant; injected outbox insert failure and retry. These are synthetic tests, not real load or a universal correctness proof.

Reference consulted 2026-10-14: [PostgreSQL explicit locking](https://www.postgresql.org/docs/18/explicit-locking.html).
