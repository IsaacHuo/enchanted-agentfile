# enchanted-agentfile

Make **`AGENTS.md` authoritative** and keep every AI coding agent's instruction
file in sync with it. One small CLI, **zero third-party runtime dependencies**
(Node >=18), with a CI drift gate and an *honest* effective-context doctor.

Every agent tool wants its own instruction file: `CLAUDE.md` for Claude Code,
`.cursor/rules/*.mdc` for Cursor, `.github/copilot-instructions.md` for Copilot,
`GEMINI.md` for Gemini CLI, and so on. Keeping them all equal by hand is tedious
and silently rots. `enchanted-agentfile` treats `AGENTS.md` as the single source
of truth and generates (or point-to) every other file from it, so the copies can
never drift.

- **`sync`** - write/refresh every in-scope tool file from `AGENTS.md`. Idempotent.
- **`check`** - exit non-zero when any target is missing, drifted, or unmanaged. This is a CI gate.
- **`diff`** - show what `sync` would change, without writing anything.
- **`doctor`** - report the *effective* instruction context and flag dead pointers - and be explicit about what it cannot know.

## Contents

- [Install](#install)
- [60-second quickstart](#60-second-quickstart)
- [Commands](#commands)
- [Exit codes](#exit-codes)
- [Use it as a CI drift gate](#use-it-as-a-ci-drift-gate)
- [Supported tool / file matrix](#supported-tool--file-matrix)
- [Configuration](#configuration)
- [How managed blocks work](#how-managed-blocks-work)
- [What `doctor` can and cannot measure](#what-doctor-can-and-cannot-measure)
- [Runnable example](#runnable-example)
- [Development](#development)
- [License](#license)

## Install

Nothing to install for a one-off run:

```sh
npx github:IsaacHuo/enchanted-agentfile --help
```

Or add it to a project (still zero runtime dependencies):

```sh
npm install --save-dev github:IsaacHuo/enchanted-agentfile
npx enchanted-agentfile sync
```

Requires Node >=18. The CLI only uses Node built-ins, so there is no dependency
tree to audit or break.

## 60-second quickstart

Copy-paste this into any repository that already has (or should have) an
`AGENTS.md`:

```sh
# 1. Create the source of truth if you do not have one yet.
[ -f AGENTS.md ] || printf '# Shared agent instructions\n' > AGENTS.md

# 2. Preview what will be written (no files touched).
npx github:IsaacHuo/enchanted-agentfile diff

# 3. Write/refresh every detected tool file from AGENTS.md.
npx github:IsaacHuo/enchanted-agentfile sync

# 4. Verify it is in sync (this is what CI runs).
npx github:IsaacHuo/enchanted-agentfile check && echo "in sync"

# 5. See which file each tool will actually read, and why.
npx github:IsaacHuo/enchanted-agentfile doctor
```

Now edit `AGENTS.md`, run `sync` again, and commit. The second `sync` in a row
changes nothing - it is idempotent.

## Commands

| Command  | What it does | Writes files? |
| -------- | ------------ | ------------- |
| `sync`   | Generate/refresh every in-scope target from `AGENTS.md`. | yes |
| `check`  | Fail when a target is missing, drifted, or unmanaged. | no |
| `diff`   | Unified diff of what `sync` would change. | no |
| `doctor` | Report the effective instruction context with explicit certainty labels. | no |

Common options:

| Option | Applies to | Meaning |
| ------ | ---------- | ------- |
| `--root <dir>` | all | Repository root (default: current directory). |
| `--config <file>` | all | Config file (default: `.enchanted-agentfile.json`). |
| `--source <file>` | all | Source file (default: `AGENTS.md`). |
| `--tools <ids>` | all | Comma-separated tool ids to force in scope. |
| `--all` | sync, diff | Include every supported tool, even undetected ones. |
| `--require-all` | check | Also fail on missing targets for every tool. |
| `--strict` | doctor | Exit non-zero when a dead pointer is found. |
| `--exit-code` | diff | Exit `1` when there are changes. |
| `--json` | all | Machine-readable output. |
| `--quiet` | sync | Summary line only. |

## Exit codes

`check` (and `diff --exit-code`) use distinct, composable codes so CI can tell
failure modes apart. Drift, missing, and unmanaged combine with bitwise OR.

| Code | Meaning |
| ---- | ------- |
| `0`  | In sync. |
| `1`  | Drift: a managed block no longer matches `AGENTS.md`. |
| `2`  | Missing: an in-scope target file does not exist. |
| `4`  | Unmanaged: a target exists but has no managed block. |
| `3`, `5`, `6`, `7` | Combinations of the above (bitwise OR). |
| `16` | The source file (`AGENTS.md`) is missing. |
| `64` | Usage error (unknown command, tool, or option). |

## Use it as a CI drift gate

The `check` command is designed to be used verbatim as a CI step. GitHub Actions
example:

```yaml
name: agentfile-drift
on: [push, pull_request]
jobs:
  drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      # No install step: enchanted-agentfile has zero runtime dependencies.
      - name: Assert AGENTS.md and every tool file are in sync
        run: npx github:IsaacHuo/enchanted-agentfile check
      # Optionally require the file for every supported tool, even undetected ones:
      # run: npx github:IsaacHuo/enchanted-agentfile check --require-all
```

This repository runs exactly this gate on itself (see `.github/workflows/ci.yml`),
so its own generated files cannot silently drift.

## Supported tool / file matrix

Each tool has a **generation strategy** and a **documented read rule**. The
"Read behavior" column says whether the rule is documented by the vendor
(`documented`) or inferred (`inferred`). Read-rule details come from the vendor
docs linked in `lib/tools.mjs`.

| Tool | Generated file(s) | Strategy | Read behavior |
| ---- | ----------------- | -------- | ------------- |
| Codex / OpenAI | `AGENTS.md` (the source itself) | source | documented ([agents.md](https://agents.md/)) |
| Claude Code | `CLAUDE.md` (imports `@AGENTS.md`) | pointer | documented ([memory](https://code.claude.com/docs/en/memory)) |
| Cursor | `.cursor/rules/agents.md.mdc` | inline | documented ([rules](https://cursor.com/docs/rules)) |
| GitHub Copilot | `.github/copilot-instructions.md` | inline | documented ([custom instructions](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions)) |
| Gemini CLI | `GEMINI.md` (imports `@AGENTS.md`) | pointer | documented ([GEMINI.md](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/gemini-md.md)) |
| Windsurf | `.windsurf/rules/agents.md` | inline | documented ([memories](https://docs.windsurf.com/windsurf/cascade/memories)) |
| Cline | `.clinerules` (or `.clinerules/agents.md`) | inline | documented ([cline rules](https://docs.cline.bot/customization/cline-rules)) |
| Aider | `CONVENTIONS.md` | inline | documented ([conventions](https://aider.chat/docs/usage/conventions.html)) |

Strategies:

- **source** - the file is `AGENTS.md`; nothing is generated.
- **pointer** - the file contains a short documented import of `AGENTS.md` (e.g. `@AGENTS.md`).
- **inline** - the file embeds `AGENTS.md` inside a managed block, with any required frontmatter preamble.

## Configuration

Optional `.enchanted-agentfile.json` in the repository root:

```json
{
  "source": "AGENTS.md",
  "tools": ["claude", "cursor", "copilot"]
}
```

- `source` - the authoritative file name (default `AGENTS.md`).
- `tools` - tool ids to always include, in addition to any auto-detected tools.

Unknown keys are rejected, so a typo never silently changes behavior.

## How managed blocks work

Generated files contain exactly one managed region:

```md
<!-- enchanted-agentfile:begin v1 -->
...generated content...
<!-- enchanted-agentfile:end -->
```

- Everything **outside** the markers is user-owned and preserved verbatim.
- Replacing an already-correct region is byte-identical, so `sync` is idempotent.
- `check` reports `unmanaged` when a target exists but has no managed region.
- Line endings are normalized to LF, so Windows checkouts do not look drifted.

## What `doctor` can and cannot measure

`doctor` is deliberately conservative. It inspects files on disk and applies each
tool's **documented** read rule. It labels every statement as exactly one of:

- **`verified-from-files`** - read directly from the working tree (a file is present/absent, a managed block matches, a pointer imports `@AGENTS.md`).
- **`inferred-from-documented-rules`** - derived from that tool's published read rule (which file the tool *would* read given the files that exist).
- **`unknown-unobservable`** - cannot be decided from files alone.

**The doctor never claims to observe runtime loading.** A "dead pointer" is
reported only when it follows directly from a documented rule, for example:

- `CLAUDE.md` exists but does not import `@AGENTS.md` (Claude Code reads
  `AGENTS.md` only when `CLAUDE.md`/`CLAUDE.local.md` is absent).
- A `CLAUDE.md` in a parent directory shadows `AGENTS.md`.
- `CONVENTIONS.md` exists but `.aider.conf.yml` does not list it in the `read`
  setting (Aider does not load it by filename alone).

What it **cannot** measure, and will not pretend to: whether a tool actually
loaded a file at runtime, which of several candidate files a running process
chose, settings that live in user- or machine-level config it cannot read, or
tool versions whose behavior differs from current docs. Those stay
`unknown-unobservable`.

## Runnable example

`example/` is a self-contained sample repository you can execute right now:

```sh
node bin/enchanted-agentfile.mjs diff   --root example
node bin/enchanted-agentfile.mjs sync   --root example
node bin/enchanted-agentfile.mjs check  --root example
node bin/enchanted-agentfile.mjs doctor --root example
```

See [`example/README.md`](example/README.md) for the expected output.

## Development

Zero dependencies, so no install step:

```sh
npm test        # node:test unit + end-to-end suites
npm run lint    # enforces zero third-party imports + hygiene
npm run typecheck  # static import/export link check
npm run sync    # regenerate this repo's own files from AGENTS.md
npm run check   # the drift gate, run against this repo
```

The whole tool is small: `bin/` (entry), `lib/` (engine, plan, markers, doctor,
diff, report, tools), `scripts/` (lint, typecheck), `test/`.

## License

MIT - see [LICENSE](LICENSE).
