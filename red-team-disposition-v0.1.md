# Red-Team Disposition v0.1

Recorded: 2026-10-18 CST  
Sources: independent Codex and BILI reviews in C4 message
`2111706445173919744`  
Status: design responses incorporated; V4 landing and all execution evidence
remain pending

## Overall

The “changes required, not blocked” verdict is accepted. Registry-valid resource
composition is not sufficient to prove business correctness or safe execution.
The package now distinguishes an editable draft from a runnable revision and
requires traceable intent coverage, transitive permission enforcement and
independent runtime evidence.

## Point-By-Point Disposition

| Review point | Disposition | Design change |
|---|---|---|
| Fixed resources and five modules can still be assembled incorrectly | Accepted | `AtomPlan.intentCoverage[]` maps every input, output, prohibited action and required human decision to an atom/module/port. Missing or conflicting rows produce an editable but non-runnable draft. |
| Deterministic validation must not trust model self-assessment | Accepted | Validator layers are independent and consume resolver, authorization and schema records. Models may propose; only deterministic services validate. |
| Registered tools can launch unlisted scripts, URLs or subflows | Accepted | Atom and capability contracts require exact transitive-tool allowlists. Calls outside the allowlist fail before execution. |
| One port can carry a structured package without losing counts, keys or dependencies | Accepted | Schema references remain typed; the package's count, stable keys and dependency semantics must be preserved by the registered artifact schema. |
| Two logical layers must not become two storage models | Accepted as a design principle; V4 mapping started | Atom configuration and composition are separate logical concerns. `v4-atom-realization-map-v0.2.md` now projects onto the nine V4 technical kinds without adding a parallel node taxonomy. |
| Five modules must not become independently versioned or scheduled flows | Accepted | Modules are fixed sections of one atom version. Independent retry, approval or ownership requires a separate atom or subflow boundary. |
| skills, knowledge and MCP need side-effect-based placement | Accepted | Skills bind to authorized executors; knowledge pins source snapshot, version and scope; MCP tools bind to the invoking module and become capability nodes only when independently scheduled or approved. |
| Credentials and annotations cannot grant permission | Accepted | Credentials stay platform-managed and are re-authorized at invocation. MCP annotations are advisory, not enforcement. |
| Five zero-call claims need controls and execution logs | Accepted | The implementation plan now defines five audit gates, each with a positive control, negative cases and independent observations. |
| Generation may call a planner model but the generated flow must not run | Accepted | Planner model use is separately budgeted. Draft generation makes zero flow-run, publish, trigger-enablement, media-provider or business-tool calls. |

## Architecture Boundary

The reviewers referenced the then-current Flow v2 material. 丁明 has since
confirmed V4 is current and v2 is obsolete. Therefore:

- the logical requirement that atom and composition not be duplicated remains;
- no `Flow`, `FlowVersion`, subflow, token-ledger or capability-placement shape
  from v2 is accepted as a V4 field mapping;
- The atom schema is now readable; remaining reconciliation is a main/prod
  diff and implementation mapping, not a missing-document blocker.

## Evidence Status

The revised tests are designs only. No platform execution, paid call,
publication, trigger activation or business write occurred. A2 and all relevant
runtime gates remain blocked until independent execution evidence exists.

## Difference Re-Review v0.2

Independent Codex returned two passed items and two change requests in C4
message `2111707326585933824`.

| Item | Disposition | Change |
|---|---|---|
| Fixed atoms and five modules | Changes accepted | Coverage is compared with the complete confirmed `FlowIntent`, not only its own rows. A new `ValidationBinding` ties the report to exact intent, plan and effective-config hashes. Any edit invalidates the report. |
| Architecture unification | Passed in logical scope; not reopened | Internal waiting state, checkpoints and recovery records are explicitly allowed within one atom run. They do not create an independent schedule or version. V4 projection is now mapped; runtime support remains pending. |
| skills / knowledge / MCP | Passed in design scope; not reopened | No change. Enforcement remains `not_run`. |
| Acceptance | Changes accepted | Restored wrong-type, missing-required-input and cardinality negative cases with a legal-connection success control. Added stale-validation reuse after H02 deletion or unauthorized-tool insertion. |

The final wording correction in C4 message `2111707715787984896` is accepted:
an invalid connection may remain in an editable draft but must be visibly
invalid. The assertion is “runnable connections formed from bad ports = 0,” not
“invalid connections displayed in the editor = 0.”
