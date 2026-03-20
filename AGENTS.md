# AGENTS.md

## Definition of Done

A feature is done when:

- the behavior is implemented
- needed documentation is updated
- `npm run lint`
- `npm run build`
- `npm test`
- completion-affecting changes include or update:
  - black-box `__complete` regression tests
  - the table-driven completion matrix
  - wrapper-generation assertions if the shell completion script changed
- completion coverage must include, where applicable:
  - partial command transitions
  - exact command to flag transitions
  - partial flag matching
  - exact flag to value transitions
  - exact selector transitions
  - exact feature-key to `=` or `key=value` transitions
  - value-prefix completion
  - selectors containing spaces
- follow-up work is captured if the feature is intentionally incomplete

## Continuous Learning

After each feature finalization, a short retrospective may improve this file. Keep only durable working agreements.
