# Technical Design v0.1

Recorded: 2026-10-18 CST  
Status: proposed; no implementation

## 1. Architecture

```text
User prompt and attachments
  -> Intent Compiler
  -> Resource Resolver
  -> Constrained Atom Planner
  -> Contract Compiler
  -> Validator
  -> Draft Store and Revision Diff
  -> Flow 2.0 Projection
  -> later: guarded execution adapter
```

### Intent Compiler

Produces a `FlowIntent`. It extracts business outcome, typed input/output
expectations, constraints, unknown fields and explicit assumptions. It must not
select providers or claim that files are readable. Inputs, outputs, required
human decisions and prohibited actions remain separate stable requirements; the
compiler may not drop a requirement merely because no candidate atom is found.

### Resource Resolver

Filters registries by:

- tenant and user authorization;
- published lifecycle;
- environment;
- required capability;
- input/output compatibility;
- cost and quota policy;
- health state where available.

The planner sees only the resolved, authorized candidate set. An atom's allowed
transitive tools are part of that candidate contract. Registry approval does not
authorize a nested script, dynamic URL, subflow or tool call absent from the atom
version's explicit tool allowlist.

### Constrained Atom Planner

Produces an `AtomPlan`. Every selected object uses an exact registry ID and
version. The planner may create typed ports and edges, but may not create atom,
capability, schema or provider definitions.

Planning can be hybrid:

1. deterministic graph search for common patterns;
2. model assistance only for ranking compatible candidates and proposing port
   connections;
3. deterministic validation rejects any unsupported proposal.

### Contract Compiler

Expands each selected atom definition into a workflow-local `AtomConfiguration`.
It binds:

- exact atom version and template version;
- typed ports and edge mappings;
- five modules;
- capability and knowledge references;
- reviewer binding and authorization requirements;
- evidence and failure policy.

The compiled configuration is immutable within a workflow revision.

### Validator

Returns a `ValidationReport`. Validation layers run independently:

1. syntax and schema;
2. port and edge type compatibility;
3. graph reachability, required ports and cardinality;
4. intent coverage for inputs, outputs, human decisions and prohibited actions;
5. registry and version existence;
6. permission and tenant boundary, including transitive tools;
7. cost, quota and external-write policy;
8. human reviewer binding;
9. platform projection capability;
10. runtime readiness for execution.

The validator consumes resolver, authorization and schema records. A model's
self-reported “valid” response is never validation evidence. Passing layers 1-9
does not imply layer 10.

### Validation Binding

Before validation, the confirmed `FlowIntent` requirements are canonicalized as
one complete set. The validator compares that set with `intentCoverage` by exact
requirement reference and rejects duplicate, omitted or extra requirements. It
then verifies that every coverage target exists in the actual plan and that the
target module/port performs the claimed control. A model cannot omit a
requirement from coverage and still pass.

Every `ValidationReport` is bound to:

- canonical hash of the user-confirmed `FlowIntent`;
- canonical hash of the exact `AtomPlan`;
- canonical hash of the effective registry, policy and capability
  configuration;
- validator version and validation time.

Editing an intent, atom, edge, port, capability, policy, registry selection or
human binding invalidates the old report. A runnable request must compare its
exact hashes with a fresh successful report; carrying a report from an earlier
plan is rejected.

## 2. Intermediate Representation

### `FlowIntent`

Required fields:

- `intentId`;
- `businessGoal`;
- `outputContracts[]`;
- `inputContracts[]`;
- `constraints`;
- `humanDecisions[]`;
- `assumptions[]`;
- `openQuestions[]`;
- `sourcePromptHash`.

### `ResourceResolution`

Required fields:

- `registrySnapshotId`;
- `resolvedAt`;
- `actorId`;
- `tenantId`;
- `authorizedAtomVersions[]`;
- `authorizedCapabilityBindings[]`;
- `authorizedKnowledgeBases[]`;
- `authorizedWorkflowVersions[]`;
- `excludedResources[]` with reason codes.

### `AtomPlan`

Required fields:

- `workflowId` and `workflowVersion`;
- `registrySnapshotId`;
- `atoms[]`;
- `edges[]`;
- `externalInputs[]`;
- `workflowOutputs[]`;
- `humanDecisionAtoms[]`;
- `capabilityUsage[]`;
- `intentCoverage[]`;
- `budget`;
- `validationStatus`;
- `executionReadiness`.

Each `intentCoverage` row references one input, output, prohibited action or
required human decision and lists the atom/module/port that satisfies it.
`missing` and `conflicting` rows make the draft editable but not runnable.

An atom entry has a stable instance ID:

```json
{
  "instanceId": "v04-shot-image-1",
  "atomId": "01.1-V04",
  "atomVersion": "0.3.0",
  "inputs": [
    {
      "portId": "storyboard",
      "schemaRef": "StoryboardPlan@1",
      "required": true
    }
  ],
  "outputs": [
    {
      "portId": "shotImage",
      "schemaRef": "ShotImage@1",
      "cardinality": "one"
    }
  ],
  "moduleOverrides": {},
  "capabilityBindings": [
    {
      "module": "execute",
      "capabilityId": "image.generate",
      "required": true
    }
  ]
}
```

### `Edge`

An edge must bind a source and target port explicitly:

```json
{
  "edgeId": "e-v03-v04-storyboard",
  "from": { "atomInstanceId": "v03", "portId": "storyboard" },
  "to": { "atomInstanceId": "v04", "portId": "storyboard" },
  "type": "artifact",
  "schemaRef": "StoryboardPlan@1",
  "versionPolicy": "exact_published",
  "required": true,
  "condition": "businessStatus == success"
}
```

Node titles and generated prose are never edge payloads.

## 3. Atom Registry Contract

Each published atom entry must include:

- stable atom ID and semantic version;
- template version;
- published content hash;
- lifecycle status;
- business category;
- palette resource group;
- ownership;
- typed input and output ports;
- five module schemas;
- allowed capability requirements;
- evidence requirements;
- compatibility constraints;
- test status by environment.

Publication is immutable. Editing creates a new version.

The five modules are sections of one atom version. They do not receive separate
version identities, cannot be scheduled independently and cannot be published
or upgraded as detached subflows. They may still persist internal waiting state,
checkpoints and recovery records within the atom's run. Such records do not
create a second schedule or runnable unit. Any independent scheduling, retry or
approval boundary must be represented by a separate atom or subflow atom, not by
silently promoting one module.

## 4. Capability Registry Contract

Each capability adapter records:

- capability ID and adapter version;
- typed operation and schemas;
- provider binding reference;
- environment;
- permission scope;
- timeout and retry policy;
- idempotency behavior;
- unknown-result reconciliation contract;
- cost model and quota source;
- external-write flag;
- binding kind (`model`, `skill`, `mcp_tool`, `connector`, `knowledge`);
- placement (`executor`, `capability_node`, `module_binding`);
- side-effect class;
- exact transitive-tool allowlist;
- health and last verification evidence.

Placement follows where the side effect occurs, not the resource label. Skills
load only in an authorized executor. A knowledge binding pins a source snapshot,
version and access scope. An MCP tool binds to the module that invokes it and is
represented as a capability node only when it needs an independent scheduling
or approval boundary.

The workflow stores a binding reference, not credentials. Credentials remain
platform-managed and are re-authorized at invocation time. MCP read-only,
idempotent and destructive annotations are hints, not enforcement. The planner
cannot switch provider after approval without creating a new workflow revision
and revalidating cost, tool scope and permissions.

### Alignment with current Flow architecture V4

On 2026-10-18, 丁明确认 V4 is the current flow architecture and v2 is obsolete.
The readable V4 document, exact version identifier and design owner must be
obtained from 小A. No V4正文 is currently available in this workspace.

The earlier preliminary report from 小D describes the now-obsolete v2 design
with:

- `Flow(level=atom|molecule)`;
- `FlowVersion` in draft/published/retired states;
- frozen version documents and I/O contracts;
- subflow nodes with a maximum proposed depth of three;
- human steps and approval gates;
- model and agent executor types;
- organization model allowlists and token ledgers;
- a planned `flowhub` authoring layer.

Those v2 fields are historical evidence only and must not be used for current
field mapping. With the 2026-10-19 readable V4 schema:

1. `AtomPlan` remains a portable compiler result and projects onto V4 nodes.
2. No persistence implementation may be based on the obsolete v2
   `Flow`/`FlowVersion` report.
3. A business atom maps to one or a small combination of the nine V4 technical
   node kinds; it is not itself a thirteenth technical node type or nested flow.
4. The five-module design remains a generator contract. Its placement inside a
   V4 node document is a compatibility extension unless represented by existing
   ports, `exec`, `prompts`, `selfcheck` or `gate`.
5. V4 schema places skills and connectors on AI nodes and defines executor kinds
   as platform, org_agent, agent, expert and legacy a2a.
6. Exact atom/capability registry versions and runtime authorization snapshots
   remain external compatibility requirements; the schema does not define them.

## 5. Token And Subflow Governance

Each executable plan contains a token policy:

```json
{
  "estimatedTokens": {
    "min": 0,
    "max": 0
  },
  "hardLimit": 0,
  "ledgerRef": "required-before-run",
  "payerRef": "initiator-or-ai-owner",
  "accountingMode": "one-row-per-model-call",
  "exhaustionAction": "stop"
}
```

The estimate is advisory. The hard limit and ledger are mandatory before a
controlled run. Each subflow invocation draws from the parent run budget and
records its own consumption. Retrying a child does not reset the parent budget.
The payer is the run initiator or the AI's owner according to organization
policy, not an anonymous flow-level pool.

The maximum subflow depth is a versioned workflow policy. The validator rejects
cycles and rejects a child whose policy would exceed the parent's declared
depth.

## 6. Planning Invariants

The following are hard failures:

1. Unknown atom, capability, schema or provider ID.
2. Floating `latest` references in a saved draft.
3. An edge whose source and target schemas differ without a registered mapper.
4. A required input with no binding.
5. A human-review atom without a reviewer binding or valid delegation.
6. A cost-bearing capability without budget and quota policy.
7. A subflow without an exact version and cycle check.
8. A business `blocked` route connected to a normal downstream executor.
9. An atom claiming a capability that its published version does not permit.
10. A model-composed prompt that changes permissions, cost or external-write
    behavior outside declared module configuration.
11. AI-generated configuration that mutates a published resource.
12. A draft marked runnable while a required platform gap remains.
13. A subflow without a parent token budget and ledger binding.
14. A capability attached to an executor type that cannot execute it.
15. An intent requirement with no coverage row, or a coverage row whose target
    atom/module/port does not exist.
16. A registered atom whose script, dynamic address, subflow or tool call is not
    in the exact transitive-tool allowlist.
17. A generated draft where any required human decision is absent, replaced by
    AI prose, or not bound to an authorized human atom.
18. A knowledge binding without a fixed snapshot, version and access scope.
19. A capability annotation being treated as permission enforcement.
20. Validation that compares coverage only with its own generated rows instead
    of the complete confirmed `FlowIntent` requirement set.
21. A runnable request whose intent, plan or effective-config hash differs from
    the report that issued its validation result.

## 7. Failure And Recovery Status

The generator and runtime use separate enums:

- generation status: `needs_clarification`, `valid_draft`, `blocked`;
- business status: `success`, `review_required`, `blocked`,
  `changes_required`, `unknown_outcome`, `cancelled`, `expired`;
- runtime status: `pending`, `running`, `waiting`, `done`, `failed`,
  `cancelled`.

No layer may overwrite another. A platform node marked `done` can still carry
business status `blocked`.

## 8. Human Review Atom

A human review atom requires:

- reviewed artifact type, ID, version and hash;
- authorized reviewer identity or role binding;
- displayed revision and run state;
- typed decision;
- platform validation transaction;
- append-only invalidation when the reviewed artifact changes.

The approval output is a new typed artifact. It does not mutate the reviewed
artifact and does not use a node title as the artifact identity.

## 9. 01.1 Projection

The first sample uses:

```text
V01 -> V02 -> H02 -> V03 -> V04[1..6] -> V05 -> H05
    -> V06[1..6] -> V07[1..6] -> V08[1..6] -> V09[1..6]
    -> V10 -> H10
```

The current contract contains 13 atom instances:

- V01 production material;
- V02/V03/V04/V06/V07/V08/V09 processing;
- V05/V10 assembly and freeze;
- H02/H05/H10 human decisions.

The generator treats the six per-shot nodes as bounded fan-out with stable shot
IDs. It must not rely on display order as shot identity.

At the current platform boundary, this full graph projects to a draft with a
blocking validation report. A smaller V01-V03 sample can be structurally
represented, but it also remains non-runnable until route enforcement and real
human approval binding are proven.

## 10. API Boundary

Suggested service operations:

- `POST /workflow-intents`
- `POST /workflow-intents/{id}/generate`
- `POST /workflow-drafts/{id}/validate`
- `PATCH /workflow-drafts/{id}` with expected revision hash
- `POST /workflow-drafts/{id}/regenerate-section`
- `POST /workflow-drafts/{id}/project-flow2`
- `POST /workflow-drafts/{id}/request-run`

Every generation result is an editable draft, including results with blocking
validation errors. A runnable request is a separate object/action bound to the
exact draft revision, validation binding, registry snapshot, environment,
authorization evidence and successful intent/permission/port/routing checks. It
must not exist as an implicit side effect of `generate`, save, edit or publish.

## 11. Anti-Patterns

Do not:

- make a single AI response the source of truth for the graph;
- treat resource categories as atom types;
- encode tool authorization in prompt text;
- store a connector credential in an atom;
- call a subflow by mutable name;
- infer success because all nodes visually show green;
- treat structural validation as business acceptance;
- let regeneration overwrite manual edits;
- let the model fabricate missing filenames, hashes, screenshots or run IDs.
- expose skills or knowledge bases on a memoryless model executor before the
  executor supports them.
- let a subflow retry or recurse without consuming the parent token ledger.
- create a parallel persisted workflow model before readable V4 and its owner
  confirm the extension boundary.
