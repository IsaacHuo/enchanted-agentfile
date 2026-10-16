<!-- enchanted-agentfile:begin v1 -->
<!-- Generated from AGENTS.md by enchanted-agentfile. Edit AGENTS.md, then run: npx enchanted-agentfile sync -->

# enchanted-agentfile

Single source of truth: this file. Every supported AI coding agent's instruction
file is generated from here; never edit a generated file by hand.

## What this project is

A zero-dependency Node >=18 CLI that keeps AGENTS.md authoritative and keeps each
supported tool's instruction file in sync, with a CI drift gate and an honest
effective-context doctor. There are no runtime third-party dependencies; only
Node built-ins are allowed, and `npm run lint` enforces that.

## Commands

- `npm test` - run the unit and end-to-end tests (node:test).
- `npm run lint` - dependency and hygiene checks.
- `npm run typecheck` - static import/export link check.
- `npm run sync` - regenerate every generated file from this AGENTS.md.
- `npm run check` - CI drift gate; exits non-zero on drift, missing, or unmanaged files.
- `npm run doctor` - report the effective instruction context.

## Ground rules

- Zero third-party runtime dependencies; use Node built-ins only.
- After editing this file, run `npm run sync` and commit the regenerated files.
- The managed region of a generated file is authoritative; text outside the
  markers is user-owned and must be preserved.
- Never claim to observe runtime loading in the doctor output; classify every
  claim as verified-from-files, inferred-from-documented-rules, or unknown-unobservable.
- Keep LF line endings; `.gitattributes` normalizes them.

## Layout

- `bin/` - CLI entry point.
- `lib/` - engine, planning, markers, doctor, diff, reporting.
- `scripts/` - dependency-free lint and typecheck.
- `test/` - node:test suites.
- `example/` - a runnable sample repository.
<!-- enchanted-agentfile:end -->
