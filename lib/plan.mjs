/**
 * Planning: turn AGENTS.md plus a tool's strategy into the exact text a target
 * file should contain. This module is pure (no disk writes) so sync, check and
 * diff all share one source of truth for "what should be there".
 *
 * @module lib/plan
 */

import path from 'node:path';
import { isDirectory, normalizeEol } from './util.mjs';
import { renderBlock, upsertBlock } from './markers.mjs';
import { DEFAULT_SOURCE } from './tools.mjs';

/** The comment placed at the top of an inlined managed block. */
export const GENERATED_NOTE =
  '<!-- Generated from AGENTS.md by enchanted-agentfile. Edit AGENTS.md, then run: npx enchanted-agentfile sync -->';

/**
 * Resolve the absolute path of a target, honoring a directory fallback.
 * @param {string} root
 * @param {import('./tools.mjs').Target} target
 * @returns {string}
 */
export function resolveTargetAbs(root, target) {
  const primary = path.join(root, target.path);
  if (target.dirFallback && isDirectory(primary)) {
    return path.join(root, target.dirFallback);
  }
  return primary;
}

/**
 * Render the managed body for a tool.
 * @param {import('./tools.mjs').Tool} tool
 * @param {string} agentsText Raw AGENTS.md content.
 * @returns {string}
 */
export function renderBody(tool, agentsText) {
  if (tool.strategy === 'pointer') {
    return `${tool.pointer}\n`;
  }
  const body = normalizeEol(agentsText).replace(/\n+$/, '');
  return `${GENERATED_NOTE}\n\n${body}\n`;
}

/**
 * Compute the full expected file content for a target.
 * @param {import('./tools.mjs').Tool} tool
 * @param {import('./tools.mjs').Target} target
 * @param {string} agentsText Raw AGENTS.md content.
 * @param {string|null} existingText Current file content, or null when absent.
 * @returns {string}
 */
export function expectedContent(tool, target, agentsText, existingText) {
  const block = renderBlock(renderBody(tool, agentsText));
  if (existingText == null) {
    const preamble = target.preamble ? normalizeEol(target.preamble) : '';
    return `${preamble}${block}`;
  }
  return upsertBlock(existingText, block);
}

/**
 * The source file name for this tool family.
 * @returns {string}
 */
export function sourceName() {
  return DEFAULT_SOURCE;
}
