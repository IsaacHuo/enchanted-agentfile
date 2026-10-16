# Runnable example

A tiny sample repository that shows what `enchanted-agentfile` does. It contains:

- `AGENTS.md` - the authoritative source (edit this).
- `CLAUDE.md` - a hand-written file that must keep its notes across syncs.
- `.enchanted-agentfile.json` - narrows the run to four tools.

## Try it

From the repository root (the directory that contains this example), run the CLI
against the example. No install step is required beyond Node >=18.

```sh
# 1. See what sync would write, without writing it.
node bin/enchanted-agentfile.mjs diff --root example

# 2. Write/refresh the generated files.
node bin/enchanted-agentfile.mjs sync --root example

# 3. Confirm the hand-written notes in example/CLAUDE.md survived.
cat example/CLAUDE.md

# 4. Run the CI drift gate against the example.
node bin/enchanted-agentfile.mjs check --root example; echo "exit: $?"

# 5. See the honest effective-context report.
node bin/enchanted-agentfile.mjs doctor --root example
```

## Expected results

- `diff` lists `CLAUDE.md`, `.cursor/rules/agents.md.mdc`,
  `.github/copilot-instructions.md`, and `GEMINI.md`, then writes nothing.
- `sync` creates/updates those files and reports `0 unchanged` on the second run.
- `check` prints `ok` for every target and exits `0`.
- `doctor` labels every claim `verified-from-files`,
  `inferred-from-documented-rules`, or `unknown-unobservable`, and never claims to
  observe runtime loading.

Now edit `example/AGENTS.md`, re-run `sync`, and watch the managed blocks update
while the hand-written paragraph in `example/CLAUDE.md` stays put.
