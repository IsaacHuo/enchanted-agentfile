import test from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS, STRATEGIES, toolById, generationTools, targetsOf } from '../lib/tools.mjs';

test('tool ids are unique', () => {
  const ids = TOOLS.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('the matrix covers the documented 2026 tools', () => {
  const ids = new Set(TOOLS.map((t) => t.id));
  for (const expected of ['codex', 'claude', 'cursor', 'copilot', 'gemini', 'windsurf', 'cline', 'aider']) {
    assert.ok(ids.has(expected), `missing tool ${expected}`);
  }
});

test('every tool uses a valid strategy and has a documented read rule', () => {
  for (const tool of TOOLS) {
    assert.ok(STRATEGIES.has(tool.strategy), `${tool.id}: bad strategy`);
    assert.ok(tool.readRule.length > 20, `${tool.id}: readRule too short`);
    assert.match(tool.readRuleSource, /^https:\/\//, `${tool.id}: missing read rule source`);
    assert.ok(['documented', 'inferred'].includes(tool.readBehavior), `${tool.id}: bad readBehavior`);
  }
});

test('exactly one source tool exists and it is AGENTS.md', () => {
  const sources = TOOLS.filter((t) => t.strategy === 'source');
  assert.equal(sources.length, 1);
  assert.equal(sources[0].id, 'codex');
  assert.equal(sources[0].targets[0].path, 'AGENTS.md');
});

test('every generation target path is repository-relative and safe', () => {
  for (const tool of TOOLS) {
    for (const target of targetsOf(tool)) {
      assert.ok(!target.path.startsWith('/'), `${tool.id}: absolute path`);
      assert.ok(!target.path.includes('\\'), `${tool.id}: backslash path`);
      assert.ok(!target.path.split('/').includes('..'), `${tool.id}: parent traversal`);
    }
  }
});

test('generationTools excludes the source tool', () => {
  const ids = generationTools().map((t) => t.id);
  assert.ok(!ids.includes('codex'));
  assert.equal(ids.length, TOOLS.length - 1);
});

test('pointer tools declare a pointer directive', () => {
  for (const tool of TOOLS.filter((t) => t.strategy === 'pointer')) {
    assert.equal(tool.pointer, '@AGENTS.md', `${tool.id}: pointer must reference AGENTS.md`);
  }
});

test('toolById resolves known ids and returns undefined otherwise', () => {
  assert.equal(toolById('cursor').name, 'Cursor');
  assert.equal(toolById('nope'), undefined);
});
