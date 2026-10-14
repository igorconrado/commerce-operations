# Portfolio goal checkpoint

## Objective and authority

Raise Commerce Operations and Agent Review Workbench to a reference technical
portfolio for Senior Full Stack Engineer and Tech Lead, with complete flows,
defensible architecture, refined experience and reproducible evidence.
User authorized this native goal on 2026-10-14, without a token budget, other chats,
subagents, paid model calls, paid infrastructure or public exposure. Profile copy
remains a draft. Work one primary project at a time; publish atomic tested PRs.

## Verified starting point — 2026-10-14

- Commerce `08dd254`: clean main, fetched origin, no open PRs; quality run
  `38649894347` successful.
- Workbench `aa1c6df`: clean main, fetched origin, no open PRs; quality run
  `38649876554` successful.
- The canonical vault program exists on fetched `origin/main`; its absence in the
  primary local checkout is checkout drift, not a missing published note.
  Preserve the unrelated dirty vault checkout and its other session's branch.
- Read both READMEs, central evidence/profile proposal, Commerce delivery/lifecycle/
  payment/queue boundaries and Workbench architecture, model contract, domain
  review, execution, graph and worker. This is a partial audit, not full validation.

## Prioritized acceptance backlog

| Priority | Finding or question                                                                                                 | Acceptance and evidence                                                                                                                                                        |
| -------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P1       | Commerce accepts a schema-valid provider response for a different order/tenant before settling the original command | Reject charge and lookup mismatches before inbox writes; preserve unknown journal and pending outbox; prove no mutation to the other order and successful later reconciliation |
| P1       | Workbench execution checks the current executor, but not the current authority of a different original approver     | Reproduce with a second reviewer after approver revocation; deny new effects if approval authority is no longer valid; distinguish reconciliation of existing effects          |
| P1       | Commerce delivery advisory lock reserves a pool connection while all SQL uses additional connections                | Exercise concurrent deliveries at pool capacity; eliminate pool starvation without weakening event serialization                                                               |
| P2       | Workbench worker selects the oldest 20 cases repeatedly; persistent failures may starve later work                  | Reproduce and bound retries/fairness; preserve uncertainty and provide an explicit recovery path                                                                               |
| P2       | Workbench cancelled unknown journal can remain unknown after authoritative absence                                  | Define and test a terminal no-effect reconciliation outcome, without allowing a new effect                                                                                     |
| P2       | Workbench graph resumes may use stale proposal checkpoint after context replacement/edit                            | Test restart, changed evidence, reviewer edits and concurrent resumes against current domain authority                                                                         |
| P2       | Budgets reset per invocation; model comparison is contract-tested only                                              | Assess durable quotas before autonomous provider use; prepare reproducible three-arm evaluation without inventing live-model/human results                                     |
| P2       | Commerce README still lists implemented backup/restore and benchmark work as planned                                | Reconcile README, runbooks, raw reports and current CI; preserve bounded benchmark claims                                                                                      |
| P2       | UI final-state and recovery coverage needs fresh inspection                                                         | Inspect desktop/mobile, keyboard, errors, empty/loading states; update recordings after final changes                                                                          |
| P2       | Clean installation/container/migration/restore claims need current evidence                                         | Run applicable clean CI gates, inspect actual artifacts and record exact revision/results                                                                                      |

Backlog entries beyond the first are inspection findings or test hypotheses, not
confirmed exploitability or completed fixes. Expand only for observed defects or
material gaps; avoid indefinite polishing and unneeded technology.

## Current work

Milestone: critical audit and first Commerce correctness fix.
Branch: `fix/payment-response-correlation`.
Change: validate provider response order and tenant before inbox processing.
Regression coverage: wrong order and wrong tenant, both initial charge and lookup,
no other-order mutation, pending journal, later correct recovery.
Validation: targeted delivery tests passed (6 pass, 1 Redis skip); full integration passed (21 pass, 1 Redis skip); 7 unit tests, lint, typecheck and format check passed. Redis is mandatory in CI.
No commit or PR for this change yet.

Next action: inspect targeted test result, run lint/types/unit/integration checks,
record results and publish/merge this fix after successful CI. Continue Commerce
concurrency audit before switching the primary project to Workbench.

## External gates

Live model comparison requires explicit provider/model, credentials through an
approved channel and a cost cap. Subjective human rubric requires a real reviewer.
Neither prevents deterministic correctness, operation or UI work now.
