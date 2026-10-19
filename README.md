# Natural-Language Atom Workflow Generator v0.1

Recorded: 2026-10-18 CST  
Owner: 班纳十七世  
Status: V4 implementation mapping baseline; design only; no platform run,
publication, paid call or business write-back is authorized  
First reference flow: 妆舟 01.1 主播排期出片

## Product Decision

The main product is a constrained workflow generator:

```text
natural-language intent
  -> typed input/output contract
  -> registered atom selection
  -> typed graph planning
  -> five-module and authorized-capability configuration
  -> deterministic validation
  -> editable workflow draft
```

The generator must not turn arbitrary model prose into executable nodes. It can
only select published atom, capability, knowledge-base and workflow versions
from registries the current user is authorized to use. Validation is mandatory,
and successful generation does not authorize execution.

## Core Decisions In This Package

1. The user's five palette groups are UI resource groups, not the business
   taxonomy of atoms. The two concepts are orthogonal.
2. `AI tool` is normally a capability binding inside an atom, not an atom.
3. `Workflow` is a version-pinned subflow resource, not an inline atom.
4. Human confirmation is a real human-executed atom when the business process
   requires a decision.
5. The default atom view shows typed inputs, typed outputs, selected
   capabilities and whether human review is required. The advanced editor opens
   the complete input/check/execute/review/output modules.
6. Every atom has one default input port and one default output port; additional
   ports are explicit typed ports, not an untyped list of strings.
7. Missing critical information creates a clarification item. It is not filled
   with a plausible default unless the user explicitly accepts that assumption.
8. Unsupported platform behavior is represented as a blocking validation item,
   not hidden in a prompt.
9. The current flow architecture is V4. `schema-2.0-atoms@c0a399e-20261018.md`
   is now the readable implementation baseline. The mapping distinguishes
   native schema composition from compatibility extensions and unverified
   runtime behavior.

## Review Files

- `prototype/index.html`: interactive, client-side prototype of prompt
  generation, the 13-atom canvas, default node view, five-module editor,
  multi-port editing and validation states.
- `product-flow-v0.1.md`: user journey, default and advanced editing, palette
  versus atom semantics.
- `technical-design-v0.1.md`: compiler pipeline, intermediate representation,
  validation layers, capability and version contracts.
- `flow-2-adapter-matrix-v0.1.md`: what Flow 2.0 can statically represent, what
  is only partial, and what remains a confirmed gap.
- `implementation-plan-v0.1.md`: staged delivery, roles, acceptance tests and
  stop conditions.
- `red-team-disposition-v0.1.md`: point-by-point disposition of the independent
  Codex/BILI review, including accepted changes and items still awaiting V4.
- `v4-atom-realization-map-v0.2.md`: the 13 business atoms mapped to the nine
  V4 technical node kinds, with native/composed/extension-required status and
  explicit runtime gaps.
- `flow-architecture-alignment-note.md`: the V4 baseline correction, historical
  v2 claims, open architecture questions and required evidence.
- `nl-workflow-contract.schema.json`: machine-readable result contract for a
  generated draft.
- `examples/01.1-prompt.md`: a representative natural-language request.
- `examples/01.1-generated-plan.json`: illustrative constrained output.
- `examples/01.1-full-atom-map-v0.1.json`: the complete 13-atom reference
  map that a full generation result must materialize.

## Current Platform Boundary

Flow 2.0 currently exposes more static node and executor kinds, but the tested
platform still has these launch-relevant boundaries:

- typed artifact ID/type/version/hash handoff is not enforced;
- a business `blocked` result can still allow downstream execution;
- human approval is not reliably bound to an exact artifact version and hash;
- unsupported models can pass validation and silently fall back;
- native `subflow`, `flow` and `workflow` node kinds are rejected by the tested
  schema;
- fixed-version and conditional-ETag execution are not exposed;
- no reachable non-production media space is provisioned;
- deterministic media/file processing and unknown-paid-result recovery remain
  unverified.

The generator product can be designed and its draft compiler can be built
without closing those runtime gaps. A generated draft must remain
`design_only_not_runnable` until the relevant runtime gates pass.

小D first described a v2 design covering `Flow`/`FlowVersion`,
draft/publish/versioning, subflow nodes and I/O contracts. 丁明 has since
confirmed that v2 is obsolete and V4 is current. The V4 atom schema is now
readable and mapped. Historical v2 fields remain history only.

## Review Questions

1. Is the separation between palette resource groups and atom business
   categories accepted?
2. Are the default and advanced editor views sufficient for users and
   operators?
3. Does the intermediate representation preserve multi-input, multi-output,
   human-review, version, permission and cost semantics without becoming an
   unbounded visual programming language?
4. Which platform owner will implement typed draft storage, validation and an
   execution adapter?
5. Which parts should be built inside Flow 2.0, and which require a separate
   compiler and external coordinator?
6. Which existing V4 object should own an atom, a workflow version, typed ports,
   five-module metadata and capability references?
