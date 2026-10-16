/**
 * Managed-block markers.
 *
 * Every generated file contains exactly one managed region delimited by a begin
 * and an end marker. Content outside the region is user-owned and is preserved
 * verbatim by {@link upsertBlock}. Operations are idempotent: replacing an
 * already-correct region yields byte-identical output.
 *
 * @module lib/markers
 */

import { normalizeEol } from './util.mjs';

/** Exact begin marker (includes the format version). */
export const BLOCK_BEGIN = '<!-- enchanted-agentfile:begin v1 -->';
/** Exact end marker. */
export const BLOCK_END = '<!-- enchanted-agentfile:end -->';

const BEGIN_TOKEN = '<!-- enchanted-agentfile:begin';
const END_TOKEN = BLOCK_END;

/**
 * Render a managed block for the supplied body. The returned string always ends
 * with a single trailing newline.
 * @param {string} body
 * @returns {string}
 */
export function renderBlock(body) {
  const inner = normalizeEol(body).replace(/^\n+/, '').replace(/\n+$/, '');
  return `${BLOCK_BEGIN}\n${inner}\n${BLOCK_END}\n`;
}

/**
 * Locate the managed region in text.
 * @param {string} text
 * @returns {{start: number, end: number}|null} Character offsets of the region
 *   (end is exclusive), or null when no complete region is present.
 */
export function findBlock(text) {
  const t = normalizeEol(text);
  const start = t.indexOf(BEGIN_TOKEN);
  if (start === -1) return null;
  const openEnd = t.indexOf('-->', start);
  if (openEnd === -1) return null;
  const endStart = t.indexOf(END_TOKEN, openEnd + 3);
  if (endStart === -1) return null;
  const endPos = endStart + END_TOKEN.length;
  // Include a single trailing newline so replacing a region does not accumulate
  // blank lines and repeated syncs stay byte-identical.
  const end = t[endPos] === '\n' ? endPos + 1 : endPos;
  return { start, end };
}

/**
 * Extract the body inside the managed region.
 * @param {string} text
 * @returns {string|null} Normalized body without the surrounding newlines, or
 *   null when the text has no complete managed region.
 */
export function extractBlockBody(text) {
  const r = findBlock(text);
  if (!r) return null;
  const t = normalizeEol(text);
  const open = t.indexOf('-->', r.start);
  const close = t.indexOf(END_TOKEN, open + 3);
  return t.slice(open + 3, close).replace(/^\n+/, '').replace(/\n+$/, '');
}

/**
 * Replace the managed region with a fresh block, or append one when the text
 * has no managed region yet. Existing text outside the region is preserved.
 * @param {string} text
 * @param {string} block Result of {@link renderBlock}.
 * @returns {string}
 */
export function upsertBlock(text, block) {
  const t = normalizeEol(text);
  const r = findBlock(t);
  if (!r) {
    if (t.length === 0) return block;
    const separator = t.endsWith('\n\n') ? '' : t.endsWith('\n') ? '\n' : '\n\n';
    return `${t}${separator}${block}`;
  }
  return t.slice(0, r.start) + block + t.slice(r.end);
}

/**
 * Whether the text contains a complete managed region.
 * @param {string} text
 * @returns {boolean}
 */
export function hasBlock(text) {
  return findBlock(text) !== null;
}
