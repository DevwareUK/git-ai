# PRS Rename Design

## Summary

Rename the product so `prs` is the canonical short name and `Pull Request Smith` is the canonical long-form product name in prose. New state, markers, workflow files, package scope, help text, and documentation should use `prs`, while existing repositories that still contain `git-ai` state or managed markers must continue working during the migration window.

## Goals

- Make `prs` the primary CLI and documentation surface.
- Keep a temporary `git-ai` CLI alias with a clear deprecation notice.
- Write new repository-local state under `.prs/`.
- Continue reading legacy `.git-ai/` state when no `.prs/` equivalent exists yet.
- Write new managed markers under `prs` while recognizing legacy `git-ai` markers during updates.
- Make `prs setup` manage `prs-*.yml` workflow files and migrate old managed `git-ai-*.yml` files to the new names.

## Non-Goals

- Changing action directory slugs under `actions/`.
- Changing provider/runtime behavior beyond branding and compatibility handling.
- Auto-deleting legacy `.git-ai/` directories or historical run archives.

## Proposed Design

### Shared rename constants

Introduce a small shared set of branding and path constants for:

- `prs` and `Pull Request Smith`
- `@prs/*` package scope
- `.prs/` canonical state directory and `.git-ai/` legacy fallback directory
- canonical and legacy managed markers used by setup, PR assistant, issue plans, PR reviews, and test suggestions

This avoids scattered inline string edits and keeps compatibility logic centralized.

### CLI and package identity

- Rename package names and internal imports from `@git-ai/*` to `@prs/*`.
- Rename the primary bin from `git-ai` to `prs`.
- Keep `git-ai` as an alias that resolves to the same entrypoint and prints a deprecation notice before normal command handling.
- Update CLI-facing copy, prompt text, user-agent strings, generated logs, and run headers to prefer `prs`.

### State path compatibility

- Use `.prs/config.json` as the canonical config path.
- Use `.prs/issues/`, `.prs/runs/`, and `.prs/batches/` for new writes.
- Resolve config and session/run artifacts by preferring `.prs/...` and falling back to `.git-ai/...` when the canonical path does not exist yet.
- Treat both `.prs` and `.git-ai` as internal state directories for repository scans and ignore logic during the migration window.

### Managed markers

- New writes use the `prs` marker namespace.
- Existing content with legacy `git-ai` markers remains editable in place by matching both legacy and canonical markers.
- Marker definitions should be centralized instead of reimplemented in each caller.

### Setup migration

`prs setup` should:

- write/update `.github/workflows/prs-pr-review.yml`
- write/update `.github/workflows/prs-pr-assistant.yml`
- write/update `.github/workflows/prs-test-suggestions.yml`
- add `.prs/` to `.gitignore` without duplicating entries
- keep existing `.git-ai/` directories untouched
- detect managed legacy `git-ai-*.yml` files, migrate their managed contents to the new `prs-*.yml` filenames, and remove or replace the old managed files as part of the same run
- update managed AGENTS markers and generated workflow headers/action refs to the new namespace and repo slug `DevwareUK/prs`

## Testing Strategy

- Update CLI/package tests for `prs` primary naming and deprecated `git-ai` alias behavior.
- Add or refresh tests for config fallback from `.prs` to `.git-ai`.
- Add or refresh tests for run/session artifact helpers reading legacy paths and writing canonical paths.
- Add or refresh tests for setup migration from `git-ai-*.yml` to `prs-*.yml`, `.prs/` gitignore coverage, and `DevwareUK/prs/actions/...@main` references.
- Add or refresh tests for legacy and canonical marker handling.
- Rebuild tracked dist artifacts after source changes and verify the full repository build still passes.

## Risks and Mitigations

- Missing one of the many branded strings would leave an inconsistent surface.
  Mitigation: centralize constants where practical and verify with targeted search after edits.
- Overwriting user-managed workflow files could be unsafe.
  Mitigation: only migrate files that match managed setup patterns and markers.
- Breaking repositories that have only legacy state would create an unacceptable migration cliff.
  Mitigation: preserve legacy fallback reads for config and workflow/session state.
