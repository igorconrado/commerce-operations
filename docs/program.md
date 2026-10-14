# Implementation program

User-requested scope: two independent technical demonstrations for Senior Full Stack Engineer / Tech Lead evaluation. This program is newly authored with AI assistance. It does not reconstruct employer systems or claim their business outcomes.

Work one main project at a time. Decisions are reversible implementation choices; personal routines and historical employment records are outside scope.

1. **Commerce vertical slice:** identity, catalog, reservation, GraphQL, UI, SQL transactions, idempotency, negative and concurrency tests, CI. First reviewable increment.
2. **Commerce lifecycle:** confirmation/cancellation/expiry, synthetic customer and single-line historical price snapshots, payment simulator, authenticated durable inbox, monotonic events, timeout reconciliation and late-payment exceptions. Multi-line checkout is outside the current demonstration, consistent with the README.
3. **Commerce recovery:** BullMQ with PostgreSQL as durable truth, bounded retries, authorized replay, worker crashes and Redis loss. Restore state into an isolated database and verify invariants.
4. **Commerce operations:** request batching and N+1 measurement, reproducible correct-version benchmark with raw timings and resource samples, container build/smoke, immutable images, compatible migrations/rollback. Terraform single-host AWS proposal and least-privilege OIDC; no paid provisioning or public service exposure before approval.
5. **Workbench deterministic flow:** own repository/database/fixtures, Python/FastAPI, Next UI, case → evidence → proposal → approval/edit/rejection → sandbox execution → verification. Approval binds action hash and context version; atomic competing decisions; revalidate permissions at execution.
6. **Workbench orchestration:** LangGraph persistent checkpoints, restricted MCP, separate effect ledger, cancellation/budgets, reconciliation and failure experiments. Tools: get_case, get_order, get_payment_status, propose_resolution, execute_approved_resolution.
7. **Evaluation:** 60 synthetic versioned cases with frozen final split, deterministic baseline, optional real model adapter, controlled reviewed workflow; objective gates and explicit human review for subjective criteria. No fabricated scores/costs.
8. **Presentation:** optional HTTP versioned integration, evidence audit, demo recordings/scripts, GitHub profile draft. Public profile update requires approval.

Out of scope: real payments, tax, marketplace, arbitrary-code agents, Kubernetes, Kafka and microservices without a measured requirement. Existing HelpDesk/Vecto/Quantum only complement their real strengths.

Completion means working flows, clean reproduction, critical invariant tests, injected/recovered failures, measured benchmarks/evaluations, accurate docs, and evidence or explicit gaps for every row in [evidence](evidence.md).
