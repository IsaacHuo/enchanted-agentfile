/**
 * Command-line interface: argument parsing, dispatch, and exit codes.
 *
 * `run` is deliberately synchronous and side-effect-injectable (io + cwd) so it
 * can be exercised end-to-end from tests.
 *
 * @module lib/cli
 */

import path from 'node:path';
import { exists, readText, writeText } from './util.mjs';
import { EXIT, makeContext, planSync, applySync, runCheck } from './engine.mjs';
import { runDoctor } from './doctor.mjs';
import { unified } from './diff.mjs';
import { loadConfig, CONFIG_FILE } from './config.mjs';
import { toolById, generationTools } from './tools.mjs';
import { renderSync, renderCheck, renderPlanDiff, renderDoctor } from './report.mjs';

const BOOLEAN_FLAGS = new Set([
  'all',
  'require-all',
  'json',
  'quiet',
  'help',
  'version',
  'strict',
  'exit-code',
]);

const COMMANDS = new Set(['sync', 'check', 'diff', 'doctor', 'help']);

const USAGE = `enchanted-agentfile - keep every AI agent instruction file in sync with AGENTS.md

Usage:
  enchanted-agentfile <command> [options]

Commands:
  sync     Write or refresh every in-scope tool file from AGENTS.md (idempotent).
  check    Exit non-zero when a target is missing, drifted, or unmanaged.
  diff     Show what sync would change without writing anything.
  doctor   Report the effective instruction context and flag dead pointers.
  help     Show this help.

Options:
  --root <dir>      Repository root (default: current directory).
  --config <file>   Config file (default: .enchanted-agentfile.json).
  --source <file>   Source file (default: AGENTS.md, or config "source").
  --tools <ids>     Comma-separated tool ids to force in scope.
  --all             Include every supported tool, even undetected ones.
  --require-all     check: also fail on missing targets for every tool.
  --strict          doctor: exit non-zero when a dead pointer is found.
  --exit-code       diff: exit 1 when there are changes.
  --json            Machine-readable output.
  --quiet           Suppress per-file lines (summary only).
  -h, --help        Show this help.
  -v, --version     Print the version.

Exit codes:
  0   in sync
  1   drift
  2   missing
  4   unmanaged
  (3,5,6,7 are combinations of the above via bitwise OR)
  16  source file missing
  64  usage error

Supported tools:
${generationTools()
  .map((t) => `  ${t.id.padEnd(9)} ${t.name}`)
  .join('\n')}
`;

/**
 * Parse argv into a command and flags.
 * @param {string[]} argv Arguments after the node executable and script.
 * @returns {{command: string|null, flags: Object, rest: string[], error: string|null}}
 */
export function parseArgs(argv) {
  const flags = {};
  const rest = [];
  let command = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') {
      rest.push(...argv.slice(i + 1));
      break;
    }
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      const key = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
      if (eq !== -1) {
        flags[key] = arg.slice(eq + 1);
        continue;
      }
      if (BOOLEAN_FLAGS.has(key)) {
        flags[key] = true;
      } else {
        const value = argv[++i];
        if (value === undefined) return { command, flags, rest, error: `--${key} requires a value` };
        flags[key] = value;
      }
      continue;
    }
    if (arg.startsWith('-') && arg !== '-') {
      const short = arg.slice(1);
      if (short === 'h') flags.help = true;
      else if (short === 'v') flags.version = true;
      else return { command, flags, rest, error: `unknown option -${short}` };
      continue;
    }
    if (command === null) command = arg;
    else rest.push(arg);
  }
  return { command, flags, rest, error: null };
}

function readVersion() {
  try {
    const pkg = JSON.parse(readText(new URL('../package.json', import.meta.url)) ?? '{}');
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * Run the CLI.
 * @param {string[]} argv
 * @param {{cwd?: string, stdout?: (s: string) => void, stderr?: (s: string) => void}} [io]
 * @returns {number} Process exit code.
 */
export function run(argv, io = {}) {
  const cwd = io.cwd ?? process.cwd();
  const out = io.stdout ?? ((s) => process.stdout.write(s));
  const err = io.stderr ?? ((s) => process.stderr.write(s));

  const { command, flags, error } = parseArgs(argv);

  if (error) {
    err(`error: ${error}\n\n${USAGE}`);
    return EXIT.USAGE;
  }
  if (flags.version) {
    out(`${readVersion()}\n`);
    return EXIT.OK;
  }
  if (flags.help || command === 'help' || command === null) {
    out(USAGE);
    return EXIT.OK;
  }
  if (!COMMANDS.has(command)) {
    err(`error: unknown command "${command}"\n\n${USAGE}`);
    return EXIT.USAGE;
  }

  const root = flags.root ? path.resolve(cwd, flags.root) : cwd;
  if (!exists(root)) {
    err(`error: root directory does not exist: ${root}\n`);
    return EXIT.USAGE;
  }

  let only = [];
  if (flags.tools) {
    only = String(flags.tools)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const id of only) {
      if (!toolById(id)) {
        err(`error: unknown tool "${id}" (see --help)\n`);
        return EXIT.USAGE;
      }
    }
  }

  const explicitConfig = flags.config;
  const configPath = explicitConfig
    ? path.resolve(root, explicitConfig)
    : path.join(root, CONFIG_FILE);
  if (explicitConfig && !exists(configPath)) {
    err(`error: config file not found: ${configPath}\n`);
    return EXIT.USAGE;
  }
  const { config, error: configError } = loadConfig(configPath);
  if (configError) {
    err(`error: ${configError}\n`);
    return EXIT.USAGE;
  }
  const effectiveConfig = {
    source: flags.source ?? config?.source ?? 'AGENTS.md',
    tools: config?.tools ?? [],
    path: config?.path ?? null,
  };

  const ctx = makeContext({ root, config: effectiveConfig, only });

  try {
    switch (command) {
      case 'sync':
        return cmdSync(ctx, flags, out);
      case 'check':
        return cmdCheck(ctx, flags, out, err);
      case 'diff':
        return cmdDiff(ctx, flags, out);
      case 'doctor':
        return cmdDoctor(ctx, flags, out);
      default:
        err(`error: unhandled command "${command}"\n`);
        return EXIT.USAGE;
    }
  } catch (e) {
    err(`error: ${e && e.stack ? e.stack : String(e)}\n`);
    return 70;
  }
}

function cmdSync(ctx, flags, out) {
  if (!ctx.agentsPresent) {
    out(`source file not found: ${ctx.sourceRel}\n`);
    return EXIT.NO_SOURCE;
  }
  const plan = applySync(ctx, { all: Boolean(flags.all) }, (abs, content) => writeText(abs, content));
  if (flags.json) {
    out(`${JSON.stringify(plan.map(toPlanJson), null, 2)}\n`);
  } else if (flags.quiet) {
    const created = plan.filter((p) => p.action === 'created').length;
    const updated = plan.filter((p) => p.action === 'updated').length;
    out(`${created} created, ${updated} updated\n`);
  } else {
    out(renderSync(plan));
  }
  return EXIT.OK;
}

function cmdCheck(ctx, flags, out, err) {
  const result = runCheck(ctx, { requireAll: Boolean(flags['require-all']) });
  if (flags.json) {
    out(`${JSON.stringify(result.statuses.map(toStatusJson), null, 2)}\n`);
  } else {
    (result.code === EXIT.NO_SOURCE ? err : out)(renderCheck(result));
  }
  return result.code;
}

function cmdDiff(ctx, flags, out) {
  if (!ctx.agentsPresent) {
    out(`source file not found: ${ctx.sourceRel}\n`);
    return EXIT.NO_SOURCE;
  }
  const plan = planSync(ctx, { all: Boolean(flags.all) });
  const { text, changed } = renderPlanDiff(plan, ({ rel, existing, expected }) =>
    unified(existing, expected, { fileA: `a/${rel}`, fileB: `b/${rel}` }),
  );
  if (flags.json) {
    out(
      `${JSON.stringify(
        plan
          .filter((p) => p.action !== 'unchanged')
          .map((p) => ({ path: p.rel, action: p.action, tool: p.tool.id })),
        null,
        2,
      )}\n`,
    );
  } else {
    out(text);
  }
  return flags['exit-code'] && changed > 0 ? EXIT.DRIFT : EXIT.OK;
}

function cmdDoctor(ctx, flags, out) {
  const report = runDoctor(ctx);
  if (flags.json) {
    out(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    out(renderDoctor(report));
  }
  if (flags.strict && report.summary.deadPointers.length > 0) return EXIT.DRIFT;
  return EXIT.OK;
}

function toPlanJson(item) {
  return {
    path: item.rel,
    tool: item.tool.id,
    action: item.action,
  };
}

function toStatusJson(item) {
  return {
    path: item.rel,
    tool: item.tool.id,
    status: item.status,
  };
}
