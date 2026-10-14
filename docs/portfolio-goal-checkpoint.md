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

The table records the original findings/hypotheses. Disposition after implementation:
response correlation and pool starvation fixed (Commerce #10/#11); revoked approval,
cancelled reconciliation and worker starvation fixed (Workbench #11/#12/#13);
edited/replaced-context and concurrent graph resume regressions pass. UI feedback
was inspected and corrected; final recordings come from CI. README/program drift
is reconciled in this consolidation. Clean install/container/restore evidence is
refreshed by actual CI runs, not inferred from manifests.

No full HTTP capacity claim is made, so a new saturation experiment is not required
to support the retained microbenchmark. The default graph remains deterministic
and the paid adapter disabled; durable model-cost quotas are an explicit condition
before future autonomous paid usage, not an implemented claim. The worker's durable
attempt allowance is separately implemented/tested. External HTTP sandbox isolation,
cursor pagination beyond the latest 50 Workbench cases, HA and production migration
rollback remain explicit demonstration limits, not hidden guarantees.

## Current work

Milestone: evidence consolidation and final publication gates.

- Commerce #10/#11/#12 merged; code main `8395986`, final code CI `38654869877`
  successful. Nine unit tests, 23 real integration tests (including Redis), four
  desktop/mobile scenarios, audits, image runtime and 11-table restore passed.
  Local integrations explicitly skip Redis; CI is the source for that result.
- Workbench #11/#12/#13 merged. Local 60-test Python suite, Ruff, mypy, ESLint and
  TypeScript passed. Worker/graph CI `38655930490` passed. UI #14 merged as `1706fdf`;
  final CI `38656492785` passed 60 Python tests, eight browser scenarios, clean
  installs, audits, container runtime and all 11 restored tables. Final recording,
  screenshots and raw restore report were retrieved and inspected.
- Workbench deterministic rerun at clean `488e82a`: 42/42 development and 18/18 final
  action/effect gates. Model and subjective human results remain unexecuted.
- Concrete commits: Commerce `334a5b0` correlation, `7beb555` pool, `6b951e3` UI;
  Workbench `5a76a26` approver, `3c968ea` cancellation, `2da7089` worker,
  `1fd3c29` graph regressions, `309874d` UI. Self-authored PRs are not independent review.

Acceptance disposition: deterministic main flows, tested critical guarantees,
installation/failure/recovery evidence and final interface verification are
complete. No untreated critical defect is known from this bounded audit. Evidence
publication follows the same PR/CI/merge gate; GitHub main and its latest checks
remain authoritative for publication state. Preserve the primary vault checkout.
After this consolidation is merged, the next executable work is the explicitly
authorized model/human comparison below, not an indefinite polishing loop.

## External gates

Live model comparison requires explicit provider/model, credentials through an
approved channel and a cost cap. Subjective human rubric requires a real reviewer.
Neither prevents deterministic correctness, operation or UI work now.

Prepared decision package: Workbench `docs/reports/model-comparison-plan.md` and
`human-review-template.json`. Recommended next experiment is an explicitly capped
pilot (proposed USD 5 stop limit, not a price estimate), followed by actual human
scores on 18 final cases. Profile publication remains separately optional. No
cloud resource is required to reproduce the delivered demonstrations.
