/**
 * A tiny, dependency-free line diff used by `enchanted-agentfile diff`.
 *
 * It computes a longest-common-subsequence alignment and renders unified-style
 * hunks. Large inputs fall back to a whole-file replacement so the CLI never
 * allocates an unbounded DP table.
 *
 * @module lib/diff
 */

import { normalizeEol } from './util.mjs';

const DEFAULT_MAX_LINES = 4000;

/**
 * @typedef {{type: 'eq'|'add'|'del', line: string}} Op
 */

/**
 * Compute line operations that turn `aText` into `bText`.
 * @param {string} aText
 * @param {string} bText
 * @param {number} [maxLines]
 * @returns {Op[]}
 */
export function diffLines(aText, bText, maxLines = DEFAULT_MAX_LINES) {
  const aRaw = normalizeEol(aText ?? '');
  const bRaw = normalizeEol(bText ?? '');
  const a = aRaw === '' ? [] : aRaw.split('\n');
  const b = bRaw === '' ? [] : bRaw.split('\n');

  if (a.length > maxLines || b.length > maxLines) {
    const ops = a.map((line) => ({ type: 'del', line }));
    for (const line of b) ops.push({ type: 'add', line });
    return ops;
  }

  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: 'eq', line: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: 'del', line: a[i] });
      i++;
    } else {
      ops.push({ type: 'add', line: b[j] });
      j++;
    }
  }
  while (i < n) ops.push({ type: 'del', line: a[i++] });
  while (j < m) ops.push({ type: 'add', line: b[j++] });
  return ops;
}

/**
 * Render unified-style hunks with a bounded context. Returns "" when equal.
 * @param {string} aText
 * @param {string} bText
 * @param {{fileA?: string, fileB?: string, context?: number}} [opts]
 * @returns {string}
 */
export function unified(aText, bText, opts = {}) {
  const context = opts.context ?? 3;
  const labelA = opts.fileA ?? 'a';
  const labelB = opts.fileB ?? 'b';
  const ops = diffLines(aText, bText);
  const changed = ops.map((o, i) => (o.type !== 'eq' ? i : -1)).filter((i) => i >= 0);
  if (changed.length === 0) return '';

  const ranges = [];
  let start = Math.max(0, changed[0] - context);
  let end = Math.min(ops.length - 1, changed[0] + context);
  for (const idx of changed) {
    if (idx - context <= end + 1) {
      end = Math.min(ops.length - 1, idx + context);
    } else {
      ranges.push([start, end]);
      start = Math.max(0, idx - context);
      end = Math.min(ops.length - 1, idx + context);
    }
  }
  ranges.push([start, end]);

  const { a: aBefore, b: bBefore } = prefixCounts(ops);

  const out = [`--- ${labelA}`, `+++ ${labelB}`];
  for (const [rs, re] of ranges) {
    const slice = ops.slice(rs, re + 1);
    const aCount = slice.filter((o) => o.type !== 'add').length;
    const bCount = slice.filter((o) => o.type !== 'del').length;
    const aStart = aCount === 0 ? aBefore[rs] : aBefore[rs] + 1;
    const bStart = bCount === 0 ? bBefore[rs] : bBefore[rs] + 1;
    out.push(`@@ -${aStart},${aCount} +${bStart},${bCount} @@`);
    for (const op of slice) {
      const prefix = op.type === 'add' ? '+' : op.type === 'del' ? '-' : ' ';
      out.push(`${prefix}${op.line}`);
    }
  }
  return `${out.join('\n')}\n`;
}

function prefixCounts(ops) {
  const a = new Array(ops.length + 1).fill(0);
  const b = new Array(ops.length + 1).fill(0);
  for (let i = 0; i < ops.length; i++) {
    a[i + 1] = a[i] + (ops[i].type === 'add' ? 0 : 1);
    b[i + 1] = b[i] + (ops[i].type === 'del' ? 0 : 1);
  }
  return { a, b };
}
