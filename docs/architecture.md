# Architecture maps

This modular monolith keeps PostgreSQL authoritative. Redis schedules work; it is
not the inventory or delivery ledger. Read [ADRs](adr/001-atomic-reservation.md),
[lifecycle decisions](adr/002-order-lifecycle.md) and [delivery decisions](adr/003-durable-delivery.md)
for alternatives, consequences and failure assumptions.

```mermaid
flowchart LR
  UI[Next.js operations UI] --> API[Node GraphQL and HTTP sessions]
  API --> DB[(PostgreSQL domain)]
  DB --> Dispatcher[Outbox dispatcher]
  Dispatcher --> Redis[(Redis / BullMQ)]
  Redis --> Worker[Payment worker]
  Worker --> Provider[HTTP payment simulator]
  Provider --> Simulator[(Independent simulator schema)]
  Worker --> DB
  Provider --> Webhook[Authenticated HTTP webhook]
  Webhook --> DB
```

The simulator shares the PostgreSQL host for a reproducible demonstration; the
worker uses HTTP, not simulator tables. Public deployment and host isolation are
not claimed.

```mermaid
erDiagram
  ORGANIZATIONS ||--o{ USERS : owns
  USERS ||--o{ SESSIONS : authenticates
  ORGANIZATIONS ||--o{ PRODUCTS : owns
  PRODUCTS ||--o{ VARIANTS : contains
  ORGANIZATIONS ||--o{ CUSTOMERS : owns
  CUSTOMERS ||--o{ ORDERS : places
  VARIANTS ||--o{ ORDERS : priced_at_reservation
  ORDERS ||--o{ STOCK_MOVEMENTS : records
  ORDERS ||--o{ OUTBOX : emits
  ORDERS ||--o{ AUDIT_LOG : audits
  ORDERS ||--o{ PAYMENT_COMMANDS : reconciles
  PAYMENT_INBOX ||--o{ PAYMENTS : applies
```

Tenant-scoped foreign keys prevent cross-organization references. Orders retain
historical prices and one variant line; this is not a multi-line cart or accounting
ledger. The migration files are the authoritative schema.

```mermaid
stateDiagram-v2
  [*] --> reserved: conditional stock reservation
  reserved --> confirmed: before deadline, row lock + version
  reserved --> cancelled: release once
  reserved --> expired: database deadline, release once
  cancelled --> cancelled: late paid event becomes exception
  expired --> expired: late paid event becomes exception
  confirmed --> confirmed: duplicated event has no extra effect
```

```mermaid
sequenceDiagram
  participant Client
  participant API
  participant DB as PostgreSQL
  participant Worker
  participant Provider
  Client->>API: Reserve with tenant session and idempotency key
  API->>DB: Transaction lock key, conditional stock update
  API->>DB: Order + movement + idempotency + audit + outbox
  DB-->>API: Commit all or rollback all
  Worker->>DB: Persist stable payment key as unknown
  Worker->>Provider: Lookup, then send only if authoritative absence
  Provider-->>Worker: Charge committed, response may be lost
  Note over Worker: Process can die before local completion
  Worker->>Provider: On restart, lookup same key
  Provider-->>Worker: Existing charge
  Worker->>DB: Inbox + transition + processed marker
```

Queue loss is recovered by redispatching pending outbox rows. Retries do not infer
failure from a timeout: uncertain provider results require lookup. Signed webhook
versions cannot regress terminal state. See the [evidence matrix](evidence.md) for
the actual concurrency, crash, queue-loss and restore experiments and their limits.
