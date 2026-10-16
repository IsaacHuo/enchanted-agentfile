/**
 * The effective-context doctor.
 *
 * Every statement the doctor makes is classified as exactly one of:
 *   - verified-from-files            : read directly from the working tree
 *   - inferred-from-documented-rules : derived from a tool's documented read rule
 *   - unknown-unobservable           : cannot be determined from files alone
 *
 * The doctor NEVER claims to observe runtime loading. It inspects files and
 * applies each tool's documented read rule. A "dead pointer" is only reported
 * when it follows directly from such a rule (a competing file exists that the
 * tool reads, and that file does not point at AGENTS.md).
 *
 * @module lib/doctor
 */

import fs from 'node:fs';
import path from 'node:path';
import { exists, readText, relFrom } from './util.mjs';
import { extractBlockBody } from './markers.mjs';
import { TOOLS } from './tools.mjs';
import { resolveTargetAbs, renderBody } from './plan.mjs';

/** Classification labels. */
export const LABEL = {
  VERIFIED: 'verified-from-files',
  INFERRED: 'inferred-from-documented-rules',
  UNKNOWN: 'unknown-unobservable',
};

const DISCLAIMER =
  'No runtime loading is observed. "verified-from-files" facts come from the working tree; every statement about which file a tool reads is inferred from that tool\'s documented read rule; anything else is unknown-unobservable.';

/**
 * Remove fenced and inline code so an example path is not mistaken for an
 * actual import.
 * @param {string} text
 * @returns {string}
 */
export function stripCode(text) {
  return text.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]*`/g, ' ');
}

/**
 * Whether text imports AGENTS.md via the documented @path syntax.
 * @param {string|null} text
 * @returns {boolean}
 */
export function importsAgents(text) {
  if (!text) return false;
  return /(^|\s)@AGENTS\.md(?=\s|$)/m.test(stripCode(text));
}

/**
 * List CLAUDE.md / CLAUDE.local.md in the root and its ancestors (the set that
 * Claude Code checks before falling back to AGENTS.md).
 * @param {string} root
 * @returns {string[]} Repository-relative or absolute labels, root first.
 */
export function ancestorClaudeFiles(root) {
  const found = [];
  let dir = path.resolve(root);
  for (let depth = 0; depth < 64; depth++) {
    for (const name of ['CLAUDE.md', 'CLAUDE.local.md']) {
      const abs = path.join(dir, name);
      if (exists(abs)) found.push(abs === path.join(root, name) ? name : abs);
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return found;
}

/**
 * Parse the `read:` setting from an .aider.conf.yml heuristically.
 * @param {string|null} text
 * @returns {string[]}
 */
export function parseAiderRead(text) {
  if (!text) return [];
  const values = [];
  const lines = text.split(/\r?\n/);
  let inReadBlock = false;
  for (const raw of lines) {
    const line = raw.replace(/#.*$/, '');
    if (/^\s*$/.test(line)) continue;
    const inline = line.match(/^\s*read(?:-only)?\s*:\s*(.*?)\s*$/);
    if (inline) {
      inReadBlock = true;
      const value = inline[1].trim();
      if (value.startsWith('[')) {
        for (const part of value.replace(/^\[|\]$/g, '').split(',')) {
          const v = part.trim().replace(/^['"]|['"]$/g, '');
          if (v) values.push(v);
        }
      } else if (value) {
        values.push(value.replace(/^['"]|['"]$/g, ''));
      }
      continue;
    }
    const item = line.match(/^\s*-\s*(.+?)\s*$/);
    if (item && inReadBlock) {
      values.push(item[1].replace(/^['"]|['"]$/g, ''));
      continue;
    }
    inReadBlock = false;
  }
  return values;
}

/**
 * Recursively collect files with a given extension under a directory.
 * @param {string} dir
 * @param {string} ext
 * @param {number} depth
 * @returns {string[]}
 */
function walkFiles(dir, ext, depth = 3) {
  const out = [];
  if (depth < 0) return out;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(abs, ext, depth - 1));
    else if (entry.isFile() && entry.name.endsWith(ext)) out.push(abs);
  }
  return out;
}

function managedState(abs, tool, agentsText) {
  if (!exists(abs)) return 'absent';
  const text = readText(abs) ?? '';
  const body = extractBlockBody(text);
  if (body == null) return 'unmanaged';
  const expected = renderBody(tool, agentsText).trim();
  return body.trim() === expected ? 'ok' : 'drift';
}

function finding(code, label, message) {
  return { code, label, message };
}

/**
 * Build the full doctor report.
 * @param {Object} ctx Run context from makeContext().
 * @returns {Object}
 */
export function runDoctor(ctx) {
  const root = ctx.root;
  const agentsPresent = ctx.agentsPresent;
  const reports = [];
  const summary = { deadPointers: [], drift: [], unmanaged: [], missing: [], notes: [] };

  for (const tool of TOOLS) {
    const targets = tool.targets.map((t) => {
      const abs = resolveTargetAbs(root, t);
      const rel = relFrom(root, abs);
      const state = tool.strategy === 'source'
        ? (exists(abs) ? 'ok' : 'absent')
        : managedState(abs, tool, ctx.agentsText ?? '');
      return { path: rel, present: exists(abs), state };
    });

    const files = targets.map((t) => ({
      path: t.path,
      present: t.present,
      managed: t.state,
      label: LABEL.VERIFIED,
    }));

    const findings = [];
    const report = {
      id: tool.id,
      name: tool.name,
      strategy: tool.strategy,
      readBehavior: tool.readBehavior,
      readRule: tool.readRule,
      readRuleSource: tool.readRuleSource,
      files,
      effective: {},
      runtime: {
        label: LABEL.UNKNOWN,
        observed: false,
        note: 'Runtime loading is not observed by this tool.',
      },
      findings,
    };

    switch (tool.id) {
      case 'codex': {
        report.effective = {
          reads: ['AGENTS.md'],
          getsSharedStandard: agentsPresent ? 'yes' : 'no',
          label: LABEL.INFERRED,
          note: agentsPresent
            ? 'AGENTS.md is present and is the file this tool reads.'
            : 'AGENTS.md is absent.',
        };
        break;
      }

      case 'claude': {
        const claudeRel = 'CLAUDE.md';
        const claudePresent = exists(path.join(root, claudeRel));
        const claudeText = claudePresent ? readText(path.join(root, claudeRel)) : null;
        const ancestors = ancestorClaudeFiles(root);
        const hasImport = importsAgents(claudeText);
        const blockImports = targets[0].state === 'ok'; // our pointer block contains @AGENTS.md
        if (!claudePresent) {
          const shadowed = ancestors.filter((f) => f !== claudeRel);
          report.effective = {
            reads: shadowed.length ? [shadowed[0], 'AGENTS.md'] : ['AGENTS.md'],
            getsSharedStandard: agentsPresent ? 'yes' : 'no',
            label: LABEL.INFERRED,
            note: shadowed.length
              ? `No CLAUDE.md in the repo, but ${shadowed[0]} exists in a parent directory, so that file is read instead of AGENTS.md.`
              : 'No CLAUDE.md or CLAUDE.local.md in the repo or its parents, so Claude Code reads AGENTS.md directly (documented default).',
          };
          if (shadowed.length) {
            findings.push(
              finding(
                'dead-pointer',
                LABEL.INFERRED,
                `AGENTS.md would not be read by Claude Code: ${shadowed[0]} exists in a parent directory and shadows it.`,
              ),
            );
          }
        } else if (hasImport || blockImports) {
          report.effective = {
            reads: ['CLAUDE.md', 'AGENTS.md'],
            getsSharedStandard: 'yes',
            label: LABEL.INFERRED,
            note: 'CLAUDE.md exists and imports @AGENTS.md, so AGENTS.md is loaded through the import.',
          };
        } else {
          report.effective = {
            reads: ['CLAUDE.md'],
            getsSharedStandard: 'no',
            label: LABEL.INFERRED,
            note: 'CLAUDE.md exists without an @AGENTS.md import, so AGENTS.md is not read by Claude Code.',
          };
          findings.push(
            finding(
              'dead-pointer',
              LABEL.INFERRED,
              'AGENTS.md is not read by Claude Code: CLAUDE.md exists and does not import @AGENTS.md (documented rule: Claude reads AGENTS.md only when CLAUDE.md is absent).',
            ),
          );
        }
        break;
      }

      case 'cursor': {
        const mdcDir = path.join(root, '.cursor', 'rules');
        const mdc = walkFiles(mdcDir, '.mdc').map((p) => relFrom(root, p));
        const legacy = exists(path.join(root, '.cursorrules'));
        const ours = targets[0].state;
        if (ours === 'ok') {
          report.effective = {
            reads: mdc.length ? mdc : ['.cursor/rules/agents.md.mdc'],
            getsSharedStandard: 'yes',
            label: LABEL.INFERRED,
            note: 'The generated .mdc rule is present and can be read by Cursor (frontmatter required).',
          };
        } else if (mdc.length || legacy) {
          report.effective = {
            reads: [...mdc, ...(legacy ? ['.cursorrules'] : [])],
            getsSharedStandard: 'partial',
            label: LABEL.INFERRED,
            note: 'Cursor rule files exist but the AGENTS.md-derived rule is not in sync.',
          };
        } else {
          report.effective = {
            reads: [],
            getsSharedStandard: 'no',
            label: LABEL.INFERRED,
            note: 'No .cursor/rules/*.mdc project rules were found.',
          };
        }
        if (legacy) {
          findings.push(
            finding('legacy-file', LABEL.VERIFIED, '.cursorrules (legacy) is present; Cursor recommends .cursor/rules/*.mdc.'),
          );
        }
        break;
      }

      case 'copilot': {
        const state = targets[0].state;
        report.effective = {
          reads: state === 'absent' ? [] : ['.github/copilot-instructions.md'],
          getsSharedStandard: state === 'ok' ? 'yes' : state === 'absent' ? 'no' : 'partial',
          label: LABEL.INFERRED,
          note:
            state === 'ok'
              ? 'Repository-wide instructions are present and in sync.'
              : state === 'absent'
                ? 'No .github/copilot-instructions.md was found.'
                : 'The repository-wide instructions file exists but is not in sync with AGENTS.md.',
        };
        break;
      }

      case 'gemini': {
        const geminiPresent = exists(path.join(root, 'GEMINI.md'));
        const geminiText = geminiPresent ? readText(path.join(root, 'GEMINI.md')) : null;
        const settings = readText(path.join(root, '.gemini', 'settings.json'));
        let configuredVia = null;
        let settingsUnparsed = false;
        if (settings) {
          try {
            const parsed = JSON.parse(settings);
            const names = parsed?.context?.fileName;
            if (Array.isArray(names) && names.includes('AGENTS.md')) configuredVia = '.gemini/settings.json';
          } catch {
            settingsUnparsed = true;
          }
        }
        const hasImport = importsAgents(geminiText) || targets[0].state === 'ok';
        if (settingsUnparsed) {
          report.effective = {
            reads: geminiPresent ? ['GEMINI.md'] : [],
            getsSharedStandard: 'unknown',
            label: LABEL.UNKNOWN,
            note: '.gemini/settings.json could not be parsed, so whether AGENTS.md is listed in context.fileName cannot be determined from files.',
          };
        } else if (configuredVia) {
          report.effective = {
            reads: ['AGENTS.md'],
            getsSharedStandard: agentsPresent ? 'yes' : 'no',
            label: LABEL.INFERRED,
            note: `${configuredVia} lists AGENTS.md in context.fileName, so Gemini reads AGENTS.md directly.`,
          };
        } else if (geminiPresent && hasImport) {
          report.effective = {
            reads: ['GEMINI.md', 'AGENTS.md'],
            getsSharedStandard: 'yes',
            label: LABEL.INFERRED,
            note: 'GEMINI.md imports @AGENTS.md, so AGENTS.md is expanded through the import.',
          };
        } else if (geminiPresent) {
          report.effective = {
            reads: ['GEMINI.md'],
            getsSharedStandard: 'no',
            label: LABEL.INFERRED,
            note: 'GEMINI.md exists without an @AGENTS.md import and GEMINI.md is the configured context file.',
          };
          findings.push(
            finding(
              'dead-pointer',
              LABEL.INFERRED,
              'AGENTS.md is not read by Gemini CLI: GEMINI.md exists and does not import @AGENTS.md (documented rule: GEMINI.md is the default context file).',
            ),
          );
        } else {
          report.effective = {
            reads: [],
            getsSharedStandard: 'no',
            label: LABEL.INFERRED,
            note: 'No GEMINI.md and no .gemini/settings.json context.fileName entry was found.',
          };
        }
        break;
      }

      case 'windsurf': {
        const rulesDir = path.join(root, '.windsurf', 'rules');
        const rules = walkFiles(rulesDir, '.md').map((p) => relFrom(root, p));
        const legacy = exists(path.join(root, '.windsurfrules'));
        const ours = targets[0].state;
        if (ours === 'ok') {
          report.effective = {
            reads: rules.length ? rules : ['.windsurf/rules/agents.md'],
            getsSharedStandard: 'yes',
            label: LABEL.INFERRED,
            note: 'The generated workspace rule is present and can be read by Windsurf (frontmatter trigger required).',
          };
        } else if (rules.length || legacy) {
          report.effective = {
            reads: [...rules, ...(legacy ? ['.windsurfrules'] : [])],
            getsSharedStandard: 'partial',
            label: LABEL.INFERRED,
            note: 'Windsurf rule files exist but the AGENTS.md-derived rule is not in sync.',
          };
        } else if (agentsPresent) {
          report.effective = {
            reads: [],
            getsSharedStandard: 'unknown',
            label: LABEL.UNKNOWN,
            note: 'No Windsurf rule was generated. Windsurf documents inferring rules from AGENTS.md, but the conditions are unspecified, so whether it reads AGENTS.md here cannot be determined from files.',
          };
        } else {
          report.effective = {
            reads: [],
            getsSharedStandard: 'no',
            label: LABEL.INFERRED,
            note: 'No AGENTS.md and no Windsurf rule were found.',
          };
        }
        if (legacy) {
          findings.push(
            finding('legacy-file', LABEL.VERIFIED, '.windsurfrules (legacy) is present; Windsurf recommends .windsurf/rules/*.md.'),
          );
        }
        break;
      }

      case 'cline': {
        const state = targets[0].state;
        const rel = targets[0].path;
        report.effective = {
          reads: state === 'absent' ? [] : [rel],
          getsSharedStandard: state === 'ok' ? 'yes' : state === 'absent' ? 'no' : 'partial',
          label: LABEL.INFERRED,
          note:
            state === 'ok'
              ? `Project rules are present at ${rel} and in sync.`
              : state === 'absent'
                ? 'No .clinerules file or directory was found.'
                : 'The .clinerules target exists but is not in sync with AGENTS.md.',
        };
        break;
      }

      case 'aider': {
        const confRel = '.aider.conf.yml';
        const conf = readText(path.join(root, confRel));
        const readSetting = parseAiderRead(conf);
        const includesConventions = readSetting.some((v) => v.endsWith('CONVENTIONS.md'));
        const state = targets[0].state;
        if (!conf) {
          report.effective = {
            reads: [],
            getsSharedStandard: 'no',
            label: LABEL.INFERRED,
            note: 'No .aider.conf.yml was found; Aider does not load CONVENTIONS.md by filename alone.',
          };
        } else if (includesConventions) {
          report.effective = {
            reads: ['CONVENTIONS.md'],
            getsSharedStandard: state === 'ok' ? 'yes' : 'partial',
            label: LABEL.INFERRED,
            note: '.aider.conf.yml read setting includes CONVENTIONS.md.',
          };
        } else {
          report.effective = {
            reads: [],
            getsSharedStandard: 'no',
            label: LABEL.INFERRED,
            note: '.aider.conf.yml exists but its read setting does not include CONVENTIONS.md.',
          };
          if (state !== 'absent') {
            findings.push(
              finding(
                'unread',
                LABEL.INFERRED,
                'CONVENTIONS.md exists but is not loaded: Aider reads it only when .aider.conf.yml includes it in the read setting (documented rule).',
              ),
            );
          }
        }
        break;
      }

      default:
        report.effective = {
          reads: [],
          getsSharedStandard: 'unknown',
          label: LABEL.UNKNOWN,
          note: 'No decision logic for this tool.',
        };
    }

    for (const f of findings) {
      if (f.code === 'dead-pointer') summary.deadPointers.push({ tool: tool.name, message: f.message });
      if (f.code === 'legacy-file') summary.notes.push(`${tool.name}: ${f.message}`);
    }
    for (const file of files) {
      if (file.managed === 'drift') summary.drift.push({ tool: tool.name, path: file.path });
      else if (file.managed === 'unmanaged') summary.unmanaged.push({ tool: tool.name, path: file.path });
      else if (!file.present && tool.strategy !== 'source') summary.missing.push({ tool: tool.name, path: file.path });
    }

    reports.push(report);
  }

  return { disclaimer: DISCLAIMER, root, agentsPresent, reports, summary };
}
