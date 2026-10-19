# Flow Architecture Alignment Note

Recorded: 2026-10-18 CST  
Source: HXA DM from 小D, message ID
`4ab87b6a-34eb-4452-924d-4f074c4cdeeb`  
Current baseline: V4, confirmed by 丁明 on 2026-10-18  
Status: superseded for current field mapping by the verified
`e2s-relay/2.0` schema and `v4-atom-realization-map-v0.2.md`; the historical
open questions below are retained for traceability

2026-10-19 update: the complete atom schema is readable and hash-verified.
Reported owners are 丁明 for design/approval and 小E for implementation. The
current mapping treats the schema as the V4 implementation baseline while
keeping prod equality and runtime behavior explicitly unverified.

## Why This Note Exists

小D first reported that a draft “Flow Architecture v2” defined a workflow model.
丁明 later confirmed that v2 is obsolete and V4 is the current architecture,
with its document and owner to be obtained from 小A. The historical report is
retained only to avoid repeating known questions. It is not a current field
mapping or implementation baseline because:

- 丁明 explicitly superseded v2 with V4;
- the readable V4 document, exact version identifier and owner are still absent;
- V4 implementation status is not confirmed by readable code or owner evidence;
- 小A's recovery and V4 handoff are pending.

## Historical v2 Report

| Area | Reported obsolete v2 design |
|---|---|
| Product layer | `flowhub`: my flows, atom/molecule flows, templates, draft/publish/version, sharing, AI interface, token ledger, waiting-for-me |
| Execution layer | e2s-relay executes frozen snapshots, approval gates and dispatch |
| Core entities | `Flow(level=atom|molecule)`, `FlowVersion(draft|published|retired)`, frozen version document with I/O contract, `Run` with parent/child and token budget |
| Composition | Subflow node, maximum proposed depth three, cycle validation |
| Executors | Memoryless `model` through model gateway; stateful `agent` with memory/skills/MCP; human step/approval; logic/data nodes |
| Publication | AI drafts only; human publishes or owner confirms; company template requires admin approval |
| Existing implementation claimed | relay graph engine schema 1.1, sign gate, canvas, catalog and executor selection |
| Not implemented claimed | flowhub, model gateway, subflow node, atom registry |

These claims are historical and must not be used as current V4 facts.

## Alignment Rules Pending V4

1. Do not create a second persisted atom/workflow model.
2. Use V4 only after obtaining a readable document, version identifier and
   owner from 小A.
3. Keep the generator's `FlowIntent`, `AtomPlan`, five-module metadata and typed
   port contract portable until V4 ownership is reconciled.
4. Treat atom-level versus molecule-level mapping as a hypothesis, not a V4
   decision.
5. Do not place skills, memory or MCP on an executor until current V4 evidence
   proves that execution path.
6. Keep generated nodes human-reviewed; publishing and running remain separate.

## Historical Preliminary Directions From 小D

These were v2-era working directions and are not V4 approval:

| Topic | Preliminary direction | Status |
|---|---|---|
| FlowVersion extension | Add `portId`, `schemaRef` and `cardinality` to the I/O section; store five modules inside the node | Plausibly additive; pending owner review |
| Capability registry | Prefer `server`, alongside organization authorization and model gateway; relay receives references in the frozen snapshot | Recommendation only |
| Atom/molecule mapping | One business atom is an atom-level flow with typed I/O; composition is a molecule flow using versioned subflow nodes | Needs a detailed mapping test |
| Human review | Confirm whether a real human decision in the review module uses the existing sign gate | Open |
| Token budget | The initiator or the AI's owner pays; each model call writes one ledger row; a child flow uses the parent run budget | Needs implementation evidence |
| Definition layer | 小D recommends `server`; 丁明 has not decided | Do not implement persistence yet |

## Proposal Requirements To Reconcile With V4

- The five modules mean fixed internal sections of one atom:
  `input/check/execute/review/output`; they are not five nested flows.
- A port contains a stable ID, display label, type, schema reference,
  cardinality, required flag and provenance. A runtime artifact passed through
  the port must additionally carry ID, version and hash.
- The proposal requires V4 I/O to support or be compatibly extended with typed
  port identity, schema references and cardinality.
- Token estimation and hard ledger are mandatory additions to the generated
  run plan, especially for nested or retried subflows.
- Visibility defaults to owner-only; publication to team/company uses a real
  human action and administrative approval where required.
- Human approval items must appear in the existing “waiting for me” surface.
- The five modules remain a generator contract; their exact placement in V4 is
  unresolved.
- A human review inside a module must be reconciled with the existing sign gate;
  if it requires a separately auditable decision artifact, it appears as a
  human-executed node/subflow inside the atom-level flow.

## Open V4 Questions

1. Which exact object and schema own an atom workflow and an immutable version?
2. How does V4 represent typed ports, schema references and cardinality?
3. Where do the five modules and their evidence live?
4. Which executors may bind models, skills, memory, MCP and knowledge bases?
5. Is the authoritative definition layer server or relay?
6. How are visibility, publication, subflows and token ledgers represented?
7. Who owns V4 design decisions and implementation?
8. What changed from v2 to V4?

## Requested Next Evidence

Requested from 小A through HXA:

- readable V4 document and exact version identifier/update time;
- named design owner and implementation owner;
- V4 JSON/schema interfaces and examples approved for review;
- V2-to-V4 difference report;
- I/O contract examples;
- current node definitions and executor capability rules;
- atom/molecule and subflow validation rules;
- token ledger implementation state;
- draft/publish visibility rules;
- implementation status with dates.

No full private document, code location or credential is requested before the
architecture owner confirms.
