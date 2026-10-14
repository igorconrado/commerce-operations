# GitHub profile proposal — not published

This is public-safe draft copy. Applying it to the GitHub profile requires the
user's approval. It does not change or infer employment history.

---

# Igor Conrado

I build full-stack systems with explicit consistency rules, observable failure
recovery and evidence-backed technical decisions.

## Selected engineering work

### Commerce Operations

[Repository](https://github.com/igorconrado/commerce-operations) ·
[Evidence map](https://github.com/igorconrado/commerce-operations/blob/main/docs/evidence.md) ·
[Demo](https://github.com/igorconrado/commerce-operations/blob/main/docs/demo/commerce-flow.webm)

A synthetic commerce operation built with Next.js, TypeScript, GraphQL, PostgreSQL
and BullMQ. The demonstrated boundaries include concurrent stock reservations,
transactional outbox/inbox, payment reconciliation after worker failure, tenant
authorization, query batching and database restoration. Terraform/AWS is a
statically validated proposal; no AWS operation claim is made.

### Agent Review Workbench

[Repository](https://github.com/igorconrado/agent-review-workbench) ·
[Architecture](https://github.com/igorconrado/agent-review-workbench/blob/main/docs/architecture.md) ·
[Evaluation](https://github.com/igorconrado/agent-review-workbench/blob/main/docs/reports/evaluation.md) ·
[Demo](https://github.com/igorconrado/agent-review-workbench/blob/main/docs/demo/review-flow.webm)

A standalone Next.js/Python review workflow with LangGraph checkpoints, restricted
MCP tools and human decisions bound to exact actions and context versions.
Tests provoke process failure after a sandbox effect and verify idempotent recovery.
New-effect authorization rechecks the original approver; cancelled attempts have
a reconciliation-only path, and durable worker retry bounds prevent failed work
from starving later cases.
The 60-case synthetic evaluation covers deterministic policy and controlled effects;
real-model quality and subjective human scoring are explicitly pending.

These are new authorial demonstrations with synthetic data, not employer systems.
The evidence map links claims to code, tests, raw experiments, real PRs and limitations.
Individual PRs are not independent review or evidence of people management.

---

Suggested pinned repositories: Commerce Operations, Agent Review Workbench,
HelpDesk, Vecto and Quantum Logistics. Existing projects retain their documented
scope; this proposal does not imply their tests were rerun in this program.
