# Flow 2.0 Adapter Matrix v0.1

Recorded: 2026-10-18 CST  
Evidence basis: read-only inspection through 2026-10-18 14:05 CST plus prior
controlled tests  
Status: adapter-planning matrix; no new run was performed for this document

2026-10-19 update: the authoritative `e2s-relay/2.0` schema is now readable
and verified. This historical adapter matrix is superseded for field mapping by
`v4-atom-realization-map-v0.2.md`; it remains as an inventory of prior runtime
and implementation gaps.

Additional source: 小D first reported an obsolete “Flow Architecture v2” and
relay schema. 丁明 later confirmed that V4 is current. The verified 2.0 atom
schema now supersedes this matrix for field mapping; the v2 claims still have no
implementation authority.

## State Definitions

| State | Meaning |
|---|---|
| `static_supported` | The tested schema/UI can represent the shape |
| `partial` | A representation exists, but a contract-critical runtime or binding is missing |
| `confirmed_gap` | A tested behavior is absent or incorrect |
| `unknown` | Evidence is insufficient |

## Matrix

| Capability | Current state | Evidence | Generator adapter now | Exit evidence required |
|---|---|---|---|---|
| Published atom palette | `partial` | AI/sign/file/material and expanded Flow 2.0 node kinds exist, but no atom-version registry is bound to the editor | Store atom registry outside Flow 2.0 and project selected atoms as draft nodes/default templates | Atom exact version chosen, rendered and reopened without semantic loss |
| Natural-language intent extraction | `partial` | AI nodes exist; no tested product-level intent compiler | Build compiler contract and eval fixture separately | Prompt -> `FlowIntent` passes schema and clarification tests |
| Typed input/output ports | `confirmed_gap` | QST-01 passed sign-node title/text while `downstreamReady=true` | Keep typed ports in compiler IR; mark Flow 2.0 projection as degraded | Correct artifact passes; wrong ID/type/version/hash calls downstream zero times |
| Multiple typed ports and fan-in/out | `unknown` | No tested native port schema/edge mapping | Preserve ports and cardinality in IR; forbid projecting as untagged prose | Reopen and run a fan-in/fan-out fixture with stable port identities |
| Five modules inside atom | `partial` | Prompt/output requirements can describe five modules; no tested typed module state | Expand into structured module configuration before projection | Runtime exposes per-module result/evidence and downstream consumes only output module |
| Human decision atom | `partial` | Human sign node and named signer work | Render as sign position plus typed decision contract outside node prose | Valid approval passes; stale/cancelled/wrong-version approval causes zero downstream calls |
| Capability/model binding | `partial` | Multiple executor kinds are recognised; nonexistent model silently falls back | Use authorized capability registry and `design_only` projection | Unavailable executor produces typed blocker and zero fallback/business calls |
| Knowledge-base selection | `unknown` | No controlled evidence in current migration | Store exact authorized KB ID/version in IR | Run verifies selected KB identity and rejects unauthorized/missing version |
| Conditional routing | `confirmed_gap` | E01 returned blocked/do-not-execute but downstream sentinels ran | Compile typed routes and refuse to call projection runnable | Blocked, changes-required, review-required and unknown each yield zero normal downstream calls |
| Failure/recovery loops | `confirmed_gap` | No conditional rework route; stop left waiting sign actionable | Store recovery edges in IR; mark execution blocked | Per-shot rework and reconciliation routes execute only declared paths |
| Published atom/workflow version pinning | `confirmed_gap` | Run interface has no fixed-version or conditional-ETag selector | Pin registry IDs/versions in draft and refuse run projection | Run pins immutable version or conflicts on changed ETag |
| Native subflow/workflow node | `confirmed_gap` | Tested schema rejects `subflow`, `flow`, `workflow` | Keep workflow resource as versioned external reference; no native nesting claim | Approved native or external coordinator passes shared-trace, output, failure and cancellation tests |
| Draft save/revision/diff | `unknown` | Flow objects have etags, but generator draft semantics are not implemented | Own draft persistence in generator service | Manual edit and regeneration create auditable revisions without overwrite |
| Structural validation | `static_supported` with limits | Existing `validate` checks graph-level structure | Add generator-specific validation before projection | Structural pass remains distinct from runtime and business acceptance |
| Permission and cost preflight | `unknown` | No tested capability registry or quota binding path | Make authorization/cost policy mandatory fields | Unauthorized/over-budget draft fails before any external call |
| Media read/write/hash | `confirmed_gap` | `no_personal_space`; HTTP 404 on synthetic upload | Project media atoms as blocked previews only | Non-production upload/download/hash/readback and restart retrieval |
| Paid unknown-result recovery | `confirmed_gap` | No approved provider test channel; local harness only | Never enable paid capability from generator in current phase | Test doubles prove immutable key, quota, started marker, reconciliation and zero duplicate POST |
| Execution readiness | `confirmed_gap` | Migrated full/N01/E01 flows have `0 runs`; A2 blocked | Persist separate `executionReadiness` and show blockers in UI | Every required gate has run, artifact, receipt and state-transition evidence |
| Flow resource/version reuse V4 | `unknown` | V4 is confirmed current, but no readable V4 document, version identifier, owner or field mapping is available; v2 is obsolete | Keep compiler portable and do not select a persistence shape before V4 reconciliation | Readable V4 document plus named owner confirm the exact object, fields and extension boundary |
| Token budget and ledger | `partial` | Historical v2 input described per-session accounting and a planned run ledger; current V4 semantics and implementation status are unknown | Require an explicit payer, per-call evidence and bounded parent budget in the portable contract | Child plus retry case consumes and respects one parent ledger |
| Capability placement | `unknown` | Historical v2 input separated model and agent executors; V4 placement is unknown | Do not expose a skill on an executor until current capability placement is explicit | Authorized executor run records actual capability identity and rejects unsupported placement |

## Projection Modes

### `structured_draft`

Used only when the selected platform adapter can preserve typed ports, versions,
conditions, human bindings and capability references. No current end-to-end
evidence proves this mode.

### `degraded_visual_projection`

Projects the graph into current Flow 2.0 nodes while retaining the authoritative
contract in the generator service. This mode:

- is visibly labeled degraded;
- is never marked runnable;
- may be used for product/UI review;
- must list every lossy field in `projectionLosses[]`.

### `blocked`

Used when even a truthful visual projection would misrepresent required
behavior. Example: native subflow or paid recovery shown as completed automation.

## Current Adapter Decision

1. Build the generator contract and UI around structured drafts.
2. Treat Flow 2.0 as a projection target, not the source of truth.
3. Start with `degraded_visual_projection` for the 01.1 sample.
4. Do not implement an execution button until all launch-relevant runtime gates
   pass for the exact projection.
5. If native versioning, typed artifacts and routing remain unavailable, use a
   separately approved external coordinator rather than hiding the gap in node
   prompts.
