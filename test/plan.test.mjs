import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  renderBody,
  expectedContent,
  resolveTargetAbs,
  GENERATED_NOTE,
} from '../lib/plan.mjs';
import { extractBlockBody } from '../lib/markers.mjs';
import { toolById } from '../lib/tools.mjs';
import { tmpdir, write } from './helpers.mjs';

test('pointer tools render a bare @AGENTS.md directive', () => {
  const body = renderBody(toolById('claude'), '# anything');
  assert.equal(body.trim(), '@AGENTS.md');
});

test('inline tools embed the AGENTS.md content under a generated note', () => {
  const body = renderBody(toolById('copilot'), '# Rules\n\nBe nice.');
  assert.ok(body.includes(GENERATED_NOTE));
  assert.ok(body.includes('# Rules'));
  assert.ok(body.includes('Be nice.'));
});

test('expectedContent for a new file includes the preamble for .mdc targets', () => {
  const tool = toolById('cursor');
  const target = tool.targets[0];
  const content = expectedContent(tool, target, '# Rules', null);
  assert.ok(content.startsWith('---\n'), 'cursor needs frontmatter first');
  assert.ok(content.includes('alwaysApply: true'));
  assert.equal(extractBlockBody(content), renderBody(tool, '# Rules').trim());
});

test('expectedContent replaces only the managed region of an existing file', () => {
  const tool = toolById('copilot');
  const target = tool.targets[0];
  const first = expectedContent(tool, target, '# v1', null);
  const withNotes = `${first}\n## My notes\nkeep\n`;
  const second = expectedContent(tool, target, '# v2', withNotes);
  assert.ok(second.includes('## My notes'));
  assert.ok(second.includes('# v2'));
  assert.ok(!second.includes('# v1'));
});

test('expectedContent is stable when AGENTS.md is unchanged (idempotent)', () => {
  const tool = toolById('gemini');
  const target = tool.targets[0];
  const once = expectedContent(tool, target, '# Stable', null);
  const twice = expectedContent(tool, target, '# Stable', once);
  assert.equal(twice, once);
});

test('resolveTargetAbs honors dirFallback when the primary path is a directory', () => {
  const root = tmpdir();
  const tool = toolById('cline');
  const target = tool.targets[0];
  assert.equal(resolveTargetAbs(root, target), path.join(root, '.clinerules'));
  write(root, '.clinerules/.keep', '');
  assert.equal(resolveTargetAbs(root, target), path.join(root, '.clinerules', 'agents.md'));
});
