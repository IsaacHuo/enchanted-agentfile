/**
 * The reconciliation engine: decide which targets are in scope, what each
 * should contain, and whether the working tree matches. No command-specific
 * output formatting lives here so the logic stays unit-testable.
 *
 * @module lib/engine
 */

import path from 'node:path';
import { exists, readText, relFrom, canon } from './util.mjs';
import { extractBlockBody } from './markers.mjs';
import { generationTools, targetsOf } from './tools.mjs';
import { resolveTargetAbs, expectedContent, renderBody } from './plan.mjs';

/** Exit-code bits. Combinations are the bitwise OR of the individual bits. */
export const EXIT = {
  OK: 0,
  DRIFT: 1,
  MISSING: 2,
  UNMANAGED: 4,
  NO_SOURCE: 16,
  USAGE: 64,
};

/** Diagnostic status for a single target. */
export const STATUS = {
  OK: 'ok',
  DRIFT: 'drift',
  MISSING: 'missing',
  UNMANAGED: 'unmanaged',
};

/**
 * Build the run context shared by every command.
 * @param {Object} opts
 * @param {string} opts.root Repository root (absolute).
 * @param {import('./config.mjs').Config|null} opts.config
 * @param {string[]} opts.only Extra tool ids requested on the command line.
 * @returns {Object}
 */
export function makeContext({ root, config, only = [] }) {
  const sourceRel = config?.source ?? 'AGENTS.md';
  const sourceAbs = path.join(root, sourceRel);
  const agentsText = readText(sourceAbs);
  return {
    root,
    config,
    only,
    sourceRel,
    sourceAbs,
    agentsText,
    agentsPresent: agentsText != null,
  };
}

/**
 * Determine the in-scope targets.
 * @param {Object} ctx
 * @param {boolean} all Include every supported tool regardless of detection.
 * @returns {Array<Object>}
 */
export function collectEntries(ctx, all) {
  const requested = new Set([...(ctx.config?.tools ?? []), ...ctx.only]);
  const entries = [];
  for (const tool of generationTools()) {
    for (const target of targetsOf(tool)) {
      const abs = resolveTargetAbs(ctx.root, target);
      const rel = relFrom(ctx.root, abs);
      const present = exists(abs);
      const detected = tool.detect.some((d) => exists(path.join(ctx.root, d)));
      const configured = requested.has(tool.id);
      const active = all || configured || detected;
      entries.push({ tool, target, abs, rel, present, detected, configured, active });
    }
  }
  return entries;
}

/**
 * Diagnose one present target's managed block.
 * @param {Object} entry
 * @param {string} agentsText
 * @returns {'ok'|'drift'|'unmanaged'}
 */
export function diagnoseEntry(entry, agentsText) {
  const text = readText(entry.abs) ?? '';
  const body = extractBlockBody(text);
  if (body == null) return STATUS.UNMANAGED;
  const expected = renderBody(entry.tool, agentsText);
  return canon(body) === canon(expected) ? STATUS.OK : STATUS.DRIFT;
}

/**
 * Because AGENTS.md is the source of truth, sync is the only command that
 * should be called when it is missing (to create downstream files you still
 * need the source, so it is an error everywhere).
 * @param {Object} ctx
 * @returns {{ok: true}|{ok: false, message: string}}
 */
export function requireSource(ctx) {
  if (ctx.agentsPresent) return { ok: true };
  return { ok: false, message: `source file not found: ${ctx.sourceRel}` };
}

/**
 * Compute the sync plan without writing.
 * @param {Object} ctx
 * @param {{all: boolean}} opts
 * @returns {Array<Object>} One entry per in-scope target with `action` set.
 */
export function planSync(ctx, { all = false } = {}) {
  const entries = collectEntries(ctx, all).filter((e) => e.active);
  const results = [];
  for (const entry of entries) {
    const existing = entry.present ? readText(entry.abs) : null;
    const expected = expectedContent(entry.tool, entry.target, ctx.agentsText, existing);
    let action;
    if (existing == null) action = 'created';
    else if (existing === expected) action = 'unchanged';
    else action = 'updated';
    results.push({ ...entry, existing, expected, action });
  }
  return results;
}

/**
 * Apply the sync plan to disk.
 * @param {Object} ctx
 * @param {{all: boolean}} opts
 * @param {(abs: string, content: string) => void} writer
 * @returns {Array<Object>}
 */
export function applySync(ctx, { all = false } = {}, writer) {
  const plan = planSync(ctx, { all });
  for (const item of plan) {
    if (item.action !== 'unchanged') writer(item.abs, item.expected);
  }
  return plan;
}

/**
 * Check the working tree for drift.
 * @param {Object} ctx
 * @param {{all: boolean, requireAll: boolean}} opts
 * @returns {{code: number, statuses: Array<Object>}}
 */
export function runCheck(ctx, { requireAll = false } = {}) {
  if (!ctx.agentsPresent) {
    return { code: EXIT.NO_SOURCE, statuses: [], message: `source file not found: ${ctx.sourceRel}` };
  }
  const entries = collectEntries(ctx, requireAll).filter((e) => e.active);
  const statuses = [];
  let code = EXIT.OK;
  for (const entry of entries) {
    let status;
    if (!entry.present) {
      status = STATUS.MISSING;
      code |= EXIT.MISSING;
    } else {
      status = diagnoseEntry(entry, ctx.agentsText);
      if (status === STATUS.DRIFT) code |= EXIT.DRIFT;
      else if (status === STATUS.UNMANAGED) code |= EXIT.UNMANAGED;
    }
    statuses.push({ ...entry, status });
  }
  return { code, statuses };
}
