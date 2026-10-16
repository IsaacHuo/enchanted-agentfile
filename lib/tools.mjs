/**
 * The supported tool/file matrix (2026).
 *
 * Each entry records (a) the target file(s) this CLI can generate, (b) the
 * paths that indicate the tool is in use ("detect"), and (c) the tool's
 * documented read rule with a source URL. The read rule is a claim about the
 * tool's public documentation, not an observation of runtime loading; the
 * doctor labels every conclusion it derives from these rules as inferred.
 *
 * Nobody here is executed. All decisions are static file inspection.
 *
 * @module lib/tools
 */

/** The authoritative instruction source file. */
export const DEFAULT_SOURCE = 'AGENTS.md';

/** Valid generation strategies. */
export const STRATEGIES = new Set(['source', 'inline', 'pointer']);

const CURSOR_FRONTMATTER = [
  '---',
  'description: Shared repository instructions, generated from AGENTS.md by enchanted-agentfile.',
  'alwaysApply: true',
  '---',
  '',
  '',
].join('\n');

const WINDSURF_FRONTMATTER = ['---', 'trigger: always_on', '---', '', ''].join('\n');

/**
 * @typedef {Object} Target
 * @property {string} path Repository-relative path to generate.
 * @property {string} [preamble] Text emitted only when the file is first created.
 * @property {string} [dirFallback] Path to use instead when `path` is a directory.
 */

/**
 * @typedef {Object} Tool
 * @property {string} id Stable tool id used by --tools and config.
 * @property {string} name Human-readable tool name.
 * @property {'source'|'inline'|'pointer'} strategy Generation strategy.
 * @property {Target[]} targets Files this CLI manages for the tool.
 * @property {string[]} detect Paths whose presence implies the tool is in use.
 * @property {'documented'|'inferred'} readBehavior Strength of the read-rule evidence.
 * @property {string} readRule The tool's documented read rule (short form).
 * @property {string} readRuleSource URL of the documentation the rule came from.
 * @property {string} [pointer] Pointer directive used by pointer-strategy tools.
 */

/** @type {Tool[]} */
export const TOOLS = [
  {
    id: 'codex',
    name: 'Codex / OpenAI',
    strategy: 'source',
    targets: [{ path: DEFAULT_SOURCE }],
    detect: [DEFAULT_SOURCE],
    readBehavior: 'documented',
    readRule: 'Reads AGENTS.md natively; AGENTS.md is the shared standard.',
    readRuleSource: 'https://agents.md/',
  },
  {
    id: 'claude',
    name: 'Claude Code',
    strategy: 'pointer',
    pointer: '@AGENTS.md',
    targets: [{ path: 'CLAUDE.md' }],
    detect: ['CLAUDE.md', '.claude'],
    readBehavior: 'documented',
    readRule:
      'Reads CLAUDE.md when one exists in the working directory or any parent; reads AGENTS.md directly only when no CLAUDE.md or CLAUDE.local.md exists there. A CLAUDE.md that imports @AGENTS.md loads AGENTS.md through the import.',
    readRuleSource: 'https://code.claude.com/docs/en/memory',
  },
  {
    id: 'cursor',
    name: 'Cursor',
    strategy: 'inline',
    targets: [
      { path: '.cursor/rules/agents.md.mdc', preamble: CURSOR_FRONTMATTER },
    ],
    detect: ['.cursor', '.cursorrules'],
    readBehavior: 'documented',
    readRule:
      'Reads project rules from .cursor/rules/*.mdc (frontmatter required); the legacy root .cursorrules file is still honored but deprecated.',
    readRuleSource: 'https://cursor.com/docs/rules',
  },
  {
    id: 'copilot',
    name: 'GitHub Copilot',
    strategy: 'inline',
    targets: [{ path: '.github/copilot-instructions.md' }],
    detect: ['.github/copilot-instructions.md'],
    readBehavior: 'documented',
    readRule:
      'Reads repository-wide instructions from .github/copilot-instructions.md; path-specific rules live in .github/instructions/*.instructions.md.',
    readRuleSource:
      'https://docs.github.com/en/copilot/how-tos/configure-custom-instructions',
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    strategy: 'pointer',
    pointer: '@AGENTS.md',
    targets: [{ path: 'GEMINI.md' }],
    detect: ['GEMINI.md', '.gemini'],
    readBehavior: 'documented',
    readRule:
      'Reads context files named GEMINI.md by default and expands @file imports; a settings.json context.fileName list can add AGENTS.md directly.',
    readRuleSource:
      'https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/gemini-md.md',
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    strategy: 'inline',
    targets: [
      { path: '.windsurf/rules/agents.md', preamble: WINDSURF_FRONTMATTER },
    ],
    detect: ['.windsurf', '.windsurfrules'],
    readBehavior: 'documented',
    readRule:
      'Reads workspace rules from .windsurf/rules/*.md (frontmatter trigger required); the legacy root .windsurfrules file is still honored but deprecated.',
    readRuleSource: 'https://docs.windsurf.com/windsurf/cascade/memories',
  },
  {
    id: 'cline',
    name: 'Cline',
    strategy: 'inline',
    targets: [{ path: '.clinerules', dirFallback: '.clinerules/agents.md' }],
    detect: ['.clinerules'],
    readBehavior: 'documented',
    readRule:
      'Reads project rules from a root .clinerules directory (preferred) or a single .clinerules file.',
    readRuleSource: 'https://docs.cline.bot/customization/cline-rules',
  },
  {
    id: 'aider',
    name: 'Aider',
    strategy: 'inline',
    targets: [{ path: 'CONVENTIONS.md' }],
    detect: ['CONVENTIONS.md', '.aider.conf.yml'],
    readBehavior: 'documented',
    readRule:
      'Reads CONVENTIONS.md only when the .aider.conf.yml read setting (or --read) includes it; it is not loaded by filename alone.',
    readRuleSource: 'https://aider.chat/docs/usage/conventions.html',
  },
];

/**
 * Look up a tool by id.
 * @param {string} id
 * @returns {Tool|undefined}
 */
export function toolById(id) {
  return TOOLS.find((t) => t.id === id);
}

/** Tools that generate managed files (everything except the source itself). */
export function generationTools() {
  return TOOLS.filter((t) => t.strategy !== 'source');
}

/**
 * Normalize a tool's targets into descriptors.
 * @param {Tool} tool
 * @returns {Target[]}
 */
export function targetsOf(tool) {
  return tool.targets.map((t) =>
    typeof t === 'string' ? { path: t } : { ...t },
  );
}
