# Implementation Plan v0.1

Recorded: 2026-10-18 CST  
Status: proposed sequence; dates and platform commitments require named owners

## 1. Delivery Principle

Build the constrained compiler and draft experience before enabling execution.
This avoids coupling product design to unresolved platform runtime gaps.

The first milestone is not “generate any workflow.” It is:

> Given a fixed registry and one known business domain, generate a valid,
> explainable draft whose unsupported execution behavior is reported honestly.

## 2. Workstreams

### Workstream A: Contracts and registries

Owner: 班纳十七世  
Reviewers: 独立Codex, BILI, platform implementation owner

Deliverables:

- final generator result schema;
- atom registry schema;
- capability registry schema;
- flow resource version contract;
- 01.1 atom instances for V01-V10/H02/H05/H10;
- 01.1 typed port and capability map.

Exit:

- all 13 atoms reference exact template and registry versions;
- every required field has one provenance owner;
- JSON Schema and reference fixtures parse and validate.
- the portable plan is checked field-by-field against the readable and
  owner-confirmed V4 flow contract before persistence code is written.

### Workstream B: Constrained planner prototype

Owner: to be assigned by 晓帅  
Reviewer: 独立Codex

Deliverables:

- prompt -> `FlowIntent` extraction;
- authorized resource resolution;
- registry-bound `AtomPlan`;
- deterministic validation;
- no-side-effect generation service;
- prompt evaluation set covering normal and adversarial requests.

Exit:

- zero unregistered atom/capability emissions across the evaluation set;
- every input, output, required human decision and prohibited action has an
  intent-coverage row;
- missing critical inputs become clarification items;
- the planner model may run under its own declared budget, but generation makes
  zero flow-run, publish, trigger-enablement, media-provider or business-tool
  calls;
- 01.1 human decision atoms appear only where business review is required.

### Workstream C: Draft editor

Owner: product/UX plus platform frontend owner  
Reviewers: 晓帅, 班纳十七世

Deliverables:

- prompt intake and clarification screen;
- generated graph preview;
- default atom summary;
- advanced five-module editor;
- multi-port editor;
- validation and blocker panel;
- revision diff and regenerate-section flow.

Exit:

- user can complete the acceptance walkthrough in
  `product-flow-v0.1.md`;
- no text overlaps or inaccessible critical evidence at desktop and mobile
  widths;
- no advanced-only field is required for normal review;
- no hidden unsupported behavior is displayed as successful.

### Workstream D: Current platform projection and V4 reconciliation

Owner: platform implementation owner, to be named by 苏白  
Reviewer: 班纳十七世 and 独立Codex

Deliverables:

- readable V4 document, version identifier, owner and v2-to-V4 difference report;
- generator-to-V4 ownership and field mapping;
- draft-to-Flow-2.0 mapping;
- projection-loss report;
- immutable version selection or conditional-ETag strategy;
- typed route/blocked-state feasibility decision;
- subflow decision: native or explicit external coordinator.

Exit:

- saved draft can be projected and reopened without changing atom identity;
- losses are machine-readable;
- no full graph is labeled runnable while required fields are degraded.

### Workstream E: Controlled execution adapter

Owner: platform implementation owner and provider/gateway owner

Prerequisites:

- typed artifact handoff;
- blocked routing;
- exact human approval binding;
- fail-closed executor;
- cancellation/restart fencing;
- non-production media;
- deterministic provider test doubles;
- separate authorization for any paid or external write.

Exit:

- V01-V03/H02 controlled run with independent call counters;
- media file round trip and probe;
- unknown paid-result recovery with zero duplicate POST;
- A2 reviewed and closed on evidence, not design.

## 3. Roles Still Needed

| Role | Responsibility | Current state |
|---|---|---|
| Business owner | Final product semantics and approval | 晓帅 |
| Overall product and migration owner | Scope, contracts, task allocation, acceptance | 班纳十七世 |
| Independent engineering reviewer | Challenge data model, safety and tests | 独立Codex |
| Product concept and platform decision | Product semantics and platform implementation decision | 苏白 named as product concept owner in 小D's preliminary report |
| Architecture decision | Resolve V4 definition-layer placement, executor capabilities and extension boundary | 丁明 reported as design/approval owner; direct confirmation pending |
| V4 implementation | Implement the confirmed current flow contract | 小E reported as implementation owner; prod evidence pending |
| V4 reconciliation | Reconcile the generator proposal with readable V4 and report v2-to-V4 differences | 小A supplied the schema and handoff; initial mapping is `v4-atom-realization-map-v0.2.md`, detailed diff still with 小E |
| Canvas/relay migration plan | Clarify whether the Mavis S1-S5 plan continues | Mavis, decision pending |
| Platform implementation owner | Flow storage, validation, projection, runtime fixes | 小E reported; direct confirmation pending |
| Frontend/UX owner | Prompt intake and default/advanced editor | 独立CodeX |
| Security/platform policy owner | Permissions, tenants, cost, human authority | Not assigned |
| Provider/gateway owner | Test doubles, health, reconciliation, media | Not assigned |
| Existing-information custodians | Recover prior work and avoid duplication | 小A handoff supplied; 阿文/小D historical inputs retained |

## 4. Delivery Slices

### Slice 0: Review baseline

Output: this package.  
Cost/risk: no execution.  
Decision needed: approve or revise the core product boundaries.

### Slice 1: Contract-complete 01.1

Output:

- schemas;
- 13-atom registry snapshot;
- capability map;
- prompt and generated-plan fixture;
- validator test cases.

Acceptance:

- schema and examples parse;
- negative fixtures fail for unknown IDs, wrong types, missing reviewers,
  unbudgeted paid capabilities and floating versions;
- 01.1 draft remains non-runnable under current Flow 2.0 evidence.

### Slice 2: No-side-effect planner

Output:

- intent extraction;
- candidate resolution;
- plan generation;
- clarification and validation report.

Acceptance:

- 01.1 prompt creates the expected 13-atom plan;
- no model/tool call occurs except the planner model;
- unauthorized capability candidates remain unavailable;
- all outputs are deterministic enough to snapshot-test.

### Slice 3: Draft editor

Output: editable workflow draft with default/advanced views.

Acceptance:

- manual creation of an extra typed output port preserves identity after reload;
- invalid edge can be created only if marked invalid, or is prevented with a
  precise explanation;
- regeneration does not silently overwrite edited sections;
- status panel distinguishes business validation from execution readiness.

### Slice 4: Degraded Flow 2.0 projection

Output: visual projection of the 01.1 draft.

Acceptance:

- projection losses are listed;
- fixed IDs/versions remain in generator storage;
- migrated platform objects are never represented as equivalent to structured
  atoms until adapter tests pass.

### Slice 5: Controlled execution

Output: execution only after platform gates close.

Acceptance:

- all P0/P1 requirements relevant to the selected scope have evidence;
- A2 is closed with a versioned test report;
- any later paid operation has separate business authorization.

## 5. Acceptance Test Families

### Red-team audit gate

These five gates each need a positive control and at least one negative case.
Evidence must come from resolver, authorization, validator and execution logs,
not a model-generated summary.

| Gate | Positive control | Required negative cases | Zero/forbidden observation |
|---|---|---|---|
| Resource integrity | A published exact version resolves and opens | Unknown, unpublished, wrong-version and floating references | Executable references formed from invalid resources = 0 |
| Permission containment | An authorized capability succeeds in the test double | Unauthorized call, post-generation revocation, prompt-injected alternate tool, dynamic URL and unlisted nested tool | Unauthorized/transitive calls = 0 |
| Port and intent coverage | A legal typed connection and a plan covering every confirmed requirement compile and pass | Wrong type, missing required input, cardinality mismatch, omitted H02/H05/H10 or omitted prohibited action; repeat with otherwise valid and authorized resources | Invalid connections may remain in an editable draft marked invalid, but runnable connections formed from bad ports = 0; runnable plans with incomplete intent coverage = 0 |
| Routing and failure | Legal refill/reconciliation branch receives the event | `blocked`, missing state, unknown state and stale approval | Normal downstream calls for blocked/unknown states = 0 |
| Generate without side effect | Prompt and planner model produce and save a draft | Prompt asks to run immediately; edit tries to publish or enable a trigger | Flow runs, publications, trigger activations and business-tool calls = 0 |

The routing gate must execute in the real controlled platform. Generator unit
tests cannot prove downstream execution behavior.

### Generator contract

- G01 complete prompt -> valid draft;
- G02 missing critical input -> clarification, no fabricated value;
- G03 output type incompatible with all atoms -> rejected;
- G04 model suggests unregistered atom -> validator removes/rejects it;
- G05 unapproved knowledge base/model -> rejected;
- G06 floating atom/subflow version -> rejected;
- G07 extra human approval added without business need -> warning requiring
  justification;
- G08 required human approval replaced by AI sign text -> rejected;
- G09 cost-bearing capability without budget -> rejected;
- G10 unauthorized external-write capability -> rejected.
- G11 omitted required human decision -> `intentCoverage.status=missing`,
  editable draft only;
- G12 omitted prohibited action -> `intentCoverage.status=missing`, run request
  rejected;
- G13 registered atom with unlisted nested tool/address -> transitive
  permission check fails;
- G14 MCP annotation says read-only but policy classifies a write -> platform
  policy wins and the call is rejected.
- G15 validation passes for plan A, then H02 is deleted or an unauthorized tool
  is added to form plan B; reuse of A's validation result -> rejected.

### Graph and ports

- P01 default single input/output;
- P02 explicit second input port;
- P03 fan-out from one storyboard to six shot instances with stable IDs;
- P04 fan-in of six image outputs into V05;
- P05 wrong-schema edge rejected;
- P06 duplicate port ID rejected;
- P07 conditional edge without declared route rejected;
- P08 subflow cycle rejected.

### Editing and revision

- R01 manual edit creates a new revision;
- R02 regeneration of one section preserves unrelated edits;
- R03 stale edit conflicts on expected revision hash;
- R04 registry upgrade requires compatibility review;
- R05 reopened draft preserves atom, capability and policy versions.
- R06 any edit changes the plan/config hash and invalidates the previous
  validation report; run requires fresh validation.

### Platform projection

- F01 degraded fields are listed;
- F02 typed artifact identity is not replaced by a node title;
- F03 platform structural validation does not change execution readiness;
- F04 blocked business state remains blocked after projection;
- F05 full 01.1 sample is not presented as runnable.

## 6. Stop Conditions

Stop implementation and return to design if:

- the planner needs to invent atom semantics to complete a common case;
- palette categories are being treated as atom business types;
- a capability provider can be changed without creating a revision;
- manual edits can be overwritten by regeneration;
- runtime status is used to erase business `blocked` or `unknown_outcome`;
- platform projection is described as execution-equivalent;
- a cost-bearing or external-write action is available before policy, quota and
  unknown-result recovery are proven.
