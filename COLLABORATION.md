# Collaboration Workflow

This repository is the shared source of truth for the 妆舟 V4 flow workbench.
It contains the authorized contract materials, acceptance criteria, baseline
prototype and tests.

## Ownership

- 独立CodeX owns frontend implementation, local tests, browser evidence and
  original-site integration.
- 班纳十七世 owns requirements, acceptance criteria, independent review and
  release coordination.
- Deployment, real platform execution, paid calls, publication and business
  write-back require separate authorization. None is implied by a commit.

## Branch Rules

- `main` is the reviewed baseline. Do not push unreviewed feature work directly
  to `main`.
- CodeX implementation work goes on a feature branch such as
  `codex/desktop-contract-v0.1`.
- Each handoff must identify the commit, changed files, test command, test
  result and unresolved items.
- A feature is accepted only after 班纳十七世 independently verifies the commit
  and required evidence. Local test success is not browser or platform
  acceptance.

## Commit Rules

- Keep one logical change per commit.
- State the effect in the subject line and record the tested scope in the body.
- Do not commit credentials, tokens, generated transfer chunks, browser
  profiles, local environment files or transient QA output.
- Do not rewrite shared history after review has started.

## Evidence Rules

- Browser, DOM, Console, overflow and network evidence must identify the exact
  commit and viewport.
- A network call count is valid only when measured; unmeasured is `not_run`.
- Screenshots alone do not replace DOM assertions.
- The workbench remains `not_run` until execution is explicitly authorized and
  verified against the platform.

## Current Milestone

`desktop-contract-v0.1` is reported locally complete by CodeX. Delivery,
1440 browser verification, joint acceptance and original-site integration are
still pending.
