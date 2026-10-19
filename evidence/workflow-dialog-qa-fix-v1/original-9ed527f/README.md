# Original `9ed527f` browser-QA failure evidence

This directory preserves the raw reviewer-side evidence for the two committed
browser-QA false failures. It is separate from the passing replay of
`511265e` and does not change the original failed status.

## Provenance

- Reviewed page and original QA script:
  `9ed527f521ee0f8f7316da1688becd9c5b7fd692`
- Original `prototype/desktop-qa.cjs` SHA-256:
  `6084c94aa88b933d2480a1d417b6f57f051e055f822ed1baa06303e115ecfa48`
- Reviewer-patched script SHA-256:
  `838c2de339b2ebe7b8729eba0a9ef5b03469a686ab9036835b715776ce3ec60d`

## Files

- `audit-original-script-failure.json`: raw first-run audit. It records
  `status=failed` because the hidden drawer path waited for
  `#relay-inspector-panel:visible` and timed out. The failure occurred before
  screenshot collection, so its `screenshots` array is correctly empty.
- `overlap-failure.png`: debug capture of the second false failure. The fixture
  moved two cards into overlap before attempting a port drag.
- `layout-corrected.png`: debug capture after arranging the fixture without
  overlap and exercising the intended connection path.
- `reviewer-only.patch`: exact two-hunk difference between the committed
  `9ed527f` QA script and the reviewer-patched script used for the later
  `17/17` run.

## Evidence boundary

The second issue does not have a complete standalone audit because the original
script stopped at the first failure. The two PNGs are debug captures, not
artifacts from a completed failing run. No second audit was synthesized.

These files must not be cited as proof that the original committed script
passed `17/17`. The repaired `511265e` harness has its own independent browser
audit, but that result does not retroactively change this failure record.
