import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  runDoctor,
  LABEL,
  importsAgents,
  parseAiderRead,
  ancestorClaudeFiles,
  stripCode,
} from '../lib/doctor.mjs';
import { makeContext } from '../lib/engine.mjs';
import { tmpdir, write } from './helpers.mjs';

function doctorFor(root) {
  return runDoctor(makeContext({ root, config: { source: 'AGENTS.md', tools: [], path: null }, only: [] }));
}

function byId(report, id) {
  return report.reports.find((r) => r.id === id);
}

test('every label the doctor emits is one of the three documented classifications', () => {
  const root = tmpdir();
  write(root, 'AGENTS.md', '# Rules\n');
  write(root, 'CLAUDE.md', '@AGENTS.md\n');
  const report = doctorFor(root);
  const allowed = new Set([LABEL.VERIFIED, LABEL.INFERRED, LABEL.UNKNOWN]);
  for (const tool of report.reports) {
    for (const file of tool.files) assert.ok(allowed.has(file.label), `${tool.id} file label`);
    assert.ok(allowed.has(tool.effective.label), `${tool.id} effective label`);
  }
});

test('file-presence facts are labelled verified-from-files', () => {
  const root = tmpdir();
  write(root, 'AGENTS.md', '# Rules\n');
  write(root, '.github/copilot-instructions.md', 'x');
  const report = doctorFor(root);
  const copilot = byId(report, 'copilot');
  assert.equal(copilot.files[0].label, LABEL.VERIFIED);
  assert.equal(copilot.files[0].present, true);
});

test('read behaviour is only ever inferred-from-documented-rules or unknown', () => {
  const root = tmpdir();
  write(root, 'AGENTS.md', '# Rules\n');
  const report = doctorFor(root);
  for (const tool of report.reports) {
    assert.ok(
      tool.effective.label === LABEL.INFERRED || tool.effective.label === LABEL.UNKNOWN,
      `${tool.id} effective label must be inferred or unknown`,
    );
  }
});

test('the doctor never claims runtime loading', () => {
  const root = tmpdir();
  write(root, 'AGENTS.md', '# Rules\n');
  const report = doctorFor(root);
  for (const tool of report.reports) {
    assert.equal(tool.runtime.observed, false, `${tool.id} must not claim runtime observation`);
    assert.equal(tool.runtime.label, LABEL.UNKNOWN);
  }
  assert.match(report.disclaimer, /No runtime loading is observed/);
});

test('a CLAUDE.md without an @AGENTS.md import is a dead pointer (documented rule)', () => {
  const root = tmpdir();
  write(root, 'AGENTS.md', '# Rules\n');
  write(root, 'CLAUDE.md', '# I do not import the shared file\n');
  const report = doctorFor(root);
  const claude = byId(report, 'claude');
  assert.equal(claude.effective.getsSharedStandard, 'no');
  assert.ok(claude.findings.some((f) => f.code === 'dead-pointer' && f.label === LABEL.INFERRED));
  assert.equal(report.summary.deadPointers.length, 1);
});

test('a CLAUDE.md that imports @AGENTS.md loads the shared standard', () => {
  const root = tmpdir();
  write(root, 'AGENTS.md', '# Rules\n');
  write(root, 'CLAUDE.md', 'See @AGENTS.md for details.\n');
  const report = doctorFor(root);
  const claude = byId(report, 'claude');
  assert.equal(claude.effective.getsSharedStandard, 'yes');
  assert.equal(report.summary.deadPointers.length, 0);
});

test('importsAgents ignores code fences and inline code (no false positives)', () => {
  assert.equal(importsAgents('```\n@AGENTS.md\n```\n'), false);
  assert.equal(importsAgents('use `@AGENTS.md` here'), false);
  assert.equal(importsAgents('@AGENTS.md'), true);
  assert.equal(importsAgents('prefix @AGENTS.md suffix'), true);
  assert.equal(stripCode('`@AGENTS.md`').includes('@AGENTS.md'), false);
});

test('a CONVENTIONS.md not referenced by .aider.conf.yml is flagged unread', () => {
  const root = tmpdir();
  write(root, 'AGENTS.md', '# Rules\n');
  write(root, 'CONVENTIONS.md', '<!-- enchanted-agentfile:begin v1 -->\n@AGENTS.md\n<!-- enchanted-agentfile:end -->\n');
  write(root, '.aider.conf.yml', 'model: gpt\n');
  const report = doctorFor(root);
  const aider = byId(report, 'aider');
  assert.equal(aider.effective.getsSharedStandard, 'no');
  assert.ok(aider.findings.some((f) => f.code === 'unread'));
});

test('parseAiderRead understands inline lists and list items', () => {
  assert.deepEqual(parseAiderRead('read: [CONVENTIONS.md, OTHER.md]'), ['CONVENTIONS.md', 'OTHER.md']);
  assert.deepEqual(parseAiderRead('read:\n  - CONVENTIONS.md\n'), ['CONVENTIONS.md']);
  assert.deepEqual(parseAiderRead('model: x\n'), []);
});

test('an unparseable .gemini/settings.json yields an unknown-unobservable claim', () => {
  const root = tmpdir();
  write(root, 'AGENTS.md', '# Rules\n');
  write(root, 'GEMINI.md', 'x');
  write(root, '.gemini/settings.json', '{ not json');
  const report = doctorFor(root);
  const gemini = byId(report, 'gemini');
  assert.equal(gemini.effective.label, LABEL.UNKNOWN);
  assert.equal(gemini.effective.getsSharedStandard, 'unknown');
});

test('ancestorClaudeFiles finds CLAUDE.md in a parent directory', () => {
  const root = tmpdir();
  const nested = path.join(root, 'pkg', 'app');
  write(nested, 'AGENTS.md', '# Rules\n');
  write(root, 'CLAUDE.md', '# parent\n');
  const found = ancestorClaudeFiles(nested);
  assert.ok(found.some((f) => f.endsWith('CLAUDE.md')));
});

test('a parent-directory CLAUDE.md shadows AGENTS.md only when the repo has none', () => {
  const root = tmpdir();
  const nested = path.join(root, 'pkg');
  write(nested, 'AGENTS.md', '# Rules\n');
  write(root, 'CLAUDE.md', '# parent import? no @AGENTS.md\n');
  const report = doctorFor(nested);
  const claude = byId(report, 'claude');
  assert.ok(claude.findings.some((f) => f.code === 'dead-pointer'));
});
