# Request relation batching experiment

Date: 2026-10-14. Code commit: `3a78344` with a clean working tree at measurement. [Raw samples, environment and query plan](query-benchmark-2026-10-14.json).

Both implementations return the same ordered 50 variants and enforce the same organization predicate. Baseline: 50 sequential parameterized lookups. Candidate: a new request-scoped DataLoader, one `ANY(uuid[])` query. Five warmups per strategy; forty measured runs each, alternating the order to reduce drift bias; concurrency one.

| Strategy                    | Queries/run | p50 ms |  p95 ms |  p99 ms | Runs/second | Unexpected errors |
| --------------------------- | ----------: | -----: | ------: | ------: | ----------: | ----------------: |
| Correct sequential baseline |          50 | 9.2331 | 10.8729 | 11.7646 |      106.95 |                 0 |
| Request-scoped batch        |           1 | 0.4283 |  0.5857 |  0.7108 |     2200.76 |                 0 |

These are local repository-query timings on a small deterministic dataset, not HTTP throughput, production latency or a universal speedup. Node CPU and RSS are sampled; PostgreSQL and host-wide resources are not sampled in this experiment. Percentiles use the ordered sample ranks documented in the script. The raw EXPLAIN/BUFFERS plan is included; a sequential scan on a tiny dataset is not by itself a missing-index defect.

Decision: use request-scoped batching for `Order.variant`; never share the loader across sessions. Integration tests verify one batch for repeated keys, cross-tenant null results and fresh data in a new request after a price change. Further HTTP load and contention comparison remain explicit gaps.
