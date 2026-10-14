# Local payment and recovery demonstration

Use synthetic data only. Start PostgreSQL, migrate, seed and run the Next application as described in README. Start Redis with `docker compose up -d redis`, bound to loopback 6388. Never reuse an existing production queue or database.

Set a newly generated local `SIMULATOR_SECRET` with at least 32 characters in the simulator and worker environments. Do not commit it. In separate terminals:

```sh
node --import tsx scripts/run-local.ts --import tsx scripts/payment-simulator.ts
node --import tsx scripts/run-local.ts --import tsx scripts/worker.ts
```

The simulator listens only on 127.0.0.1:3101. The worker expires due reservations and schedules durable events each second. Reserve stock in the UI, then refresh: the synthetic payment should confirm the order. Closing the worker stops delivery but not durable recording. Restarting resumes pending work.

Set `SIMULATOR_MODE=lose-response` only on the provider process to persist charges and disconnect before returning. The worker records an uncertain outcome and reconciles with GET on the next attempt. No real charges occur.

Stop the simulator to exhaust five attempts; the UI shows a failed integration after refresh. Restart it and click Reprocessar as operator. The tool revalidates organization/role, writes an audit event and resets the durable attempt budget. It does not blindly create a new payment key.

Failure tests are reproducible with `tests/integration/delivery.test.ts`; CI sets REDIS_URL and executes the real queue-loss case. Local Windows Docker/WSL limitations are recorded in verification. Do not claim local Redis recovery if that test reports SKIP.

Operational limits: single host, fixed five-second retry delay, no jitter/backpressure tuning, bounded 100-event dispatch batch, indefinite ledger retention, no automatic exception resolution or refunds, no public endpoint exposure.
