# Product Flow v0.1

Recorded: 2026-10-18 CST  
Status: proposed; owner review required

## 1. User Goal

The user should be able to describe a business outcome in natural language and
receive a complete, inspectable and editable workflow draft made from approved
atoms. The user must not need to understand graph theory, prompt engineering or
provider APIs to create the first draft.

The product is not:

- a free-form AI workflow generator that invents arbitrary nodes;
- a chat transcript rendered as a canvas;
- a promise that a structurally valid graph can run;
- an automatic executor that starts paid or external actions immediately.

The reusable persistence model must follow the current V4 flow architecture once
its readable document and owner are confirmed. V4 is the current baseline;
reported v2 objects are historical candidates only. Until V4 is available, the
generator keeps its contract portable and does not create a competing persisted
workflow object.

## 2. Required Intake

The intake surface contains:

| Area | Content |
|---|---|
| Goal | Natural-language statement of the desired business result |
| Deliverable | Expected output type, format, quantity and acceptance condition |
| Inputs | Uploaded files, resource IDs, source systems or upstream workflow outputs |
| Constraints | Deadline, budget, prohibited actions, required human decisions and approval policy |
| Availability | Authorized atom, workflow, model, knowledge-base and capability versions |

Files are represented by their actual stored references. The user interface
must not treat a filename, URL pasted as text or prompt description as proof
that a file was read.

## 3. Generation Stages

### Stage A: Intent extraction

The system extracts:

- requested business outcome;
- candidate input ports and their required fields;
- candidate output ports and their schemas;
- constraints and prohibited actions;
- known resources and missing resources;
- assumptions and unanswered questions.

The first screen confirms input and output because a type mismatch there makes
all downstream atom selection unsafe. It does not ask the user to design the
whole graph manually.

### Stage B: Clarification

Generation may continue into a partial draft while unresolved items are shown.
Critical gaps block validation:

- no stable identity for a required source artifact;
- output format is insufficient to select a typed contract;
- required human approver or authority is undefined;
- a paid or external-write action has no budget or permission policy;
- no registered atom can produce the requested output.

Non-critical gaps are warnings attached to the draft. The user can accept an
assumption explicitly; the accepted assumption becomes part of the draft
revision.

### Stage C: Constrained planning

The planner may only reference published registry entries. It cannot create:

- a new atom ID;
- a new capability ID;
- an undeclared model or provider;
- an unregistered knowledge base;
- an untyped edge;
- a human approval without a real human atom;
- a subflow without an exact published version.

### Stage D: Draft generation

The generated result contains:

- a short explanation of the proposed solution;
- a workflow graph with typed atom ports and edges;
- assumptions and unresolved questions;
- validation errors and warnings;
- estimated cost and permission-relevant capabilities;
- a revision hash and registry snapshot;
- one action: `save draft` or `edit`; not `run`.

The same contract supports two distinct states:

- an `editable draft` may be saved with missing coverage or blocking validation
  rows so a user can repair it;
- a `runnable request` is a separate action bound to one exact revision and may
  exist only after all required intent, permission, port, routing and human
  bindings pass.

No UI or API may reinterpret “save draft” as approval to run.

### Stage E: Review and edit

The user can:

- add, remove or reorder atoms;
- add an explicit typed input/output port;
- reconnect compatible ports;
- choose among authorized capability providers;
- edit atom configuration within the published contract;
- accept or reject an assumption;
- request regeneration of a selected subsection;
- compare the new revision with the previous revision.

An edit reruns validation. It never mutates a published atom or workflow in
place.

Draft visibility follows V4 `graph2.DefaultVisibility`: bot-created flows default
to `private`; human-created editor flows retain the graph ACL default (`space`
unless overridden). Publishing remains a separate human action.

## 4. Default And Advanced Atom Views

### Default view

The user sees:

- atom name and business purpose;
- input ports with labels and required/optional status;
- output ports with labels;
- selected model, knowledge base and other capabilities;
- whether human review is required;
- current validation status.

### Advanced edit

The advanced editor exposes all five modules:

1. `input`
2. `check`
3. `execute`
4. `review`
5. `output`

For each module, the editor shows:

- typed incoming data;
- executor;
- allowed capabilities and provider binding;
- timing and timeout;
- rules and failure exits;
- output schema;
- evidence requirements;
- permission and cost boundaries.

The five modules are not five nested workflows. They are fixed internal
sections of one atom. They do not have independent version identities, cannot be
scheduled separately and are never published as detached flows. If a step needs
its own retry, approval or ownership boundary, it must be represented as a
separate atom or subflow rather than promoting one internal module.

The atom may persist an internal wait state, checkpoint or recovery record.
Those records support one atom run; they do not create an independently
schedulable module or a second runnable unit.

## 5. Multiple Inputs And Outputs

An atom starts with:

- one `primaryInput` port;
- one `primaryOutput` port.

Additional ports are created explicitly and have:

- stable port ID;
- display label;
- data type and schema reference;
- required/optional status;
- cardinality;
- source or destination binding;
- whether the port was proposed by AI or added by a human.

Multiple values in one field are not the same as multiple ports. Multi-port
semantics must be visible in the graph and stored in the contract.

## 6. Palette And Atom Categories

The editor palette uses five callable resource groups:

1. Production material Agent
2. Process Agent
3. Tool or connector
4. Human
5. Workflow

This is a discovery and insertion taxonomy. It is not the atom's business
semantics.

The atom contract separately records its business category:

- Production material atom;
- Processing agent atom;
- Assembly and freeze atom;
- Human decision atom.

A tool or connector normally appears as a capability inside an atom. If a tool
needs independent ownership, approval, retry or reuse, it can be wrapped as a
registered atom. A workflow remains a separate subflow resource and is not
turned into an atom merely to fit the palette.

## 7. Human Confirmation

When the business process requires an approval, the generator inserts a
human-decision atom. It has the same five-module shell as any other atom and
records:

- authenticated reviewer;
- permission basis;
- reviewed artifact ID/type/version/hash;
- decision;
- reason;
- timestamp;
- invalidation time when a reviewed artifact changes.

An AI node cannot approve on behalf of a human. A business rule that only
checks a deterministic condition remains an automatic review module inside the
relevant atom.

Human atoms and approval waits must appear in the user's “waiting for me”
worklist so they are not discoverable only by opening the graph.

## 8. Capability And Cost Visibility

Each capability selection shows:

- capability ID and adapter version;
- environment;
- authorized/unauthorized state;
- current health;
- whether it causes an external write or paid call;
- estimated or maximum cost;
- quota source;
- timeout and unknown-result policy.

The planner may propose a suitable capability, but only a resource resolver can
confirm availability and authorization. Cost-bearing capabilities require an
explicit policy before draft validation can succeed.

Capability placement follows the location of the side effect:

- model, skill and executor-scoped memory bindings attach to the authorized
  executor;
- knowledge binds to a fixed source snapshot, version and access scope;
- an MCP tool binds to the module that invokes it, with an explicit parameter and
  data-destination scope;
- a capability becomes an independent capability node only when it needs its
  own scheduling, approval, retry or reuse boundary.

Credentials remain platform-managed. Read-only, idempotent or destructive
annotations from a capability description are advisory and cannot replace
platform authorization, argument filtering or side-effect enforcement.

The obsolete v2 report described skills, memory and MCP as belonging to the
`agent` executor rather than the memoryless `model` executor. V4 placement is
unknown. The platform decision must identify one of:

1. bind capabilities to a registered agent executor;
2. add explicit capability/tool nodes inside the atom;
3. add a versioned capability section to the atom workflow object defined by
   readable V4.

The generator must not display a skill on a `model` node until the platform has
an authorized execution path for it.

Registering an atom does not authorize every script, URL, subflow or tool named
inside its prompt or implementation. The atom version must carry an exact
transitive-tool allowlist, and calls outside that list fail before execution.

The v2-era preliminary direction favored a server-side capability registry with
organization authorization and a frozen reference passed to relay. That is
historical input, not a V4 decision. Persistence implementation must not begin
on either assumption before the V4 owner confirms placement.

## 9. Token And Subflow Governance

The draft displays:

- estimated token range;
- hard token limit;
- token ledger and owner;
- payer identity (run initiator or AI owner);
- one ledger row per model call;
- per-subflow budget;
- maximum nesting depth;
- behavior on budget exhaustion.

Subflow nesting defaults to the lower of the platform limit and the parent
budget. The generator checks direct and indirect cycles. A subflow consumes the
parent run's budget; retrying a child cannot create an untracked parallel
budget.

## 10. Status Language

The user-facing draft status is separate from runtime status:

| Draft status | Meaning |
|---|---|
| `needs_clarification` | Critical business information is missing |
| `generated_with_warnings` | Draft exists, but non-critical gaps remain |
| `valid_draft` | Contract validation passed; runtime capability may still be blocked |
| `design_only_not_runnable` | The graph is coherent, but required platform/runtime capabilities are absent |
| `rejected` | No authorized registered plan can satisfy the request |

No generated draft may display “ready to run” unless every execution gate and
authorization for the exact revision has passed.

An editable draft may contain errors and be saved. This does not create a
runnable revision. The run request records the exact revision hash and cannot be
created implicitly by generation, editing, validation or publishing.

## 11. Product Acceptance

The first usable version passes when:

1. A user can enter one prompt and see extracted inputs, outputs, assumptions and
   questions before an opaque graph is presented.
2. The planner never emits an unregistered atom or capability.
3. The generated draft validates typed edges, permissions, versions, required
   human decisions and every prohibited action in one operation.
4. The user can inspect a default atom summary and open all five advanced
   modules.
5. A multi-input and multi-output example survives save, reload and validation
   with stable port identities.
6. The 01.1 sample generates a 13-atom draft but remains explicitly
   `design_only_not_runnable` at the current platform boundary.
7. Regeneration creates a new revision and never silently overwrites manual
   edits.
8. Generation may call only its separately budgeted planner model; it performs
   no generated-flow run, publish, trigger activation, media-provider call or
   business-tool call.
9. The draft shows a token estimate and hard ledger before a generated flow can
   be submitted for a controlled run.
10. After readable V4 is obtained, the saved object maps to its current workflow
    version, I/O contract and subflow semantics without duplicating them in the
    generator.
