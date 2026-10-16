/**
 * Human- and machine-readable rendering of command results. Formatting is kept
 * separate from the engine so both stay simple to test.
 *
 * @module lib/report
 */

import { EXIT, STATUS } from './engine.mjs';

/**
 * Render a sync plan summary.
 * @param {Array<Object>} plan
 * @returns {string}
 */
export function renderSync(plan) {
  const lines = [];
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  for (const item of plan) {
    if (item.action === 'created') created++;
    else if (item.action === 'updated') updated++;
    else unchanged++;
    lines.push(`${pad(item.action)} ${item.rel}`);
  }
  lines.push('');
  lines.push(`${created} created, ${updated} updated, ${unchanged} unchanged`);
  return `${lines.join('\n')}\n`;
}

/**
 * Render a check result summary.
 * @param {{code: number, statuses: Array<Object>, message?: string}} result
 * @returns {string}
 */
export function renderCheck(result) {
  const lines = [];
  if (result.message) {
    lines.push(result.message);
  }
  if (result.statuses.length === 0) {
    lines.push('no targets in scope (nothing to check)');
  }
  for (const s of result.statuses) {
    lines.push(`${pad(s.status)} ${s.rel} (${s.tool.name})`);
  }
  lines.push('');
  if (result.code === EXIT.OK) {
    lines.push('in sync');
  } else {
    lines.push(`FAIL exit ${result.code}: ${describeCode(result.code)}`);
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Render diff output for a sync plan.
 * @param {Array<Object>} plan
 * @param {(exit: {rel: string, existing: string|null, expected: string}) => string} renderFileDiff
 * @returns {{text: string, changed: number}}
 */
export function renderPlanDiff(plan, renderFileDiff) {
  let text = '';
  let changed = 0;
  for (const item of plan) {
    if (item.action === 'unchanged') continue;
    changed++;
    const before = item.existing ?? '';
    text += renderFileDiff({ rel: item.rel, existing: before, expected: item.expected });
  }
  if (changed === 0) text = 'no changes\n';
  return { text, changed };
}

/**
 * Render a doctor report.
 * @param {Object} report
 * @returns {string}
 */
export function renderDoctor(report) {
  const lines = [];
  lines.push('Effective instruction context');
  lines.push('============================');
  lines.push('');
  for (const t of report.reports) {
    lines.push(`${t.name} (${t.id})`);
    for (const f of t.files) {
      lines.push(`  file          ${f.path} [${f.managed}] (${f.label})`);
    }
    const reads = t.effective.reads.length ? t.effective.reads.join(', ') : '(none)';
    lines.push(`  would read    ${reads} (${t.effective.label})`);
    lines.push(`  loads AGENTS  ${t.effective.getsSharedStandard} (${t.effective.label})`);
    lines.push(`  note          ${t.effective.note}`);
    if (t.runtime) {
      lines.push(`  runtime       not observed (${t.runtime.label})`);
    }
    for (const f of t.findings) {
      lines.push(`  find          [${f.code}] ${f.message} (${f.label})`);
    }
    lines.push('');
  }
  const s = report.summary;
  lines.push('Summary');
  lines.push(`  dead pointers : ${s.deadPointers.length}`);
  lines.push(`  drift         : ${s.drift.length}`);
  lines.push(`  unmanaged     : ${s.unmanaged.length}`);
  lines.push(`  missing       : ${s.missing.length}`);
  lines.push('');
  lines.push(report.disclaimer);
  return `${lines.join('\n')}\n`;
}

function pad(status) {
  return status.padEnd(9);
}

/**
 * Describe an exit code in words.
 * @param {number} code
 * @returns {string}
 */
export function describeCode(code) {
  const parts = [];
  if (code & EXIT.DRIFT) parts.push('drift');
  if (code & EXIT.MISSING) parts.push('missing');
  if (code & EXIT.UNMANAGED) parts.push('unmanaged');
  if (code === EXIT.NO_SOURCE) parts.push('source file missing');
  if (code === EXIT.USAGE) parts.push('usage error');
  return parts.length ? parts.join(' + ') : 'ok';
}

export { STATUS };
