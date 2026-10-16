import test from 'node:test';
import assert from 'node:assert/strict';
import {
  renderBlock,
  findBlock,
  extractBlockBody,
  upsertBlock,
  hasBlock,
} from '../lib/markers.mjs';

test('renderBlock wraps the body in begin/end markers and ends with a newline', () => {
  const block = renderBlock('hello\nworld');
  assert.match(block, /^<!-- enchanted-agentfile:begin v1 -->\n/);
  assert.match(block, /\n<!-- enchanted-agentfile:end -->\n$/);
  assert.equal(extractBlockBody(block), 'hello\nworld');
});

test('renderBlock trims surrounding blank lines from the body', () => {
  assert.equal(extractBlockBody(renderBlock('\n\nbody\n\n')), 'body');
});

test('findBlock returns null when the region is incomplete', () => {
  assert.equal(findBlock('no markers here'), null);
  assert.equal(findBlock('<!-- enchanted-agentfile:begin v1 -->\nopen only'), null);
  assert.equal(hasBlock('<!-- enchanted-agentfile:end -->'), false);
});

test('upsertBlock appends a region to existing text and preserves the text', () => {
  const block = renderBlock('generated');
  const result = upsertBlock('# Mine\n\nkeep me', block);
  assert.ok(result.startsWith('# Mine\n\nkeep me'));
  assert.ok(result.includes('generated'));
  assert.equal(extractBlockBody(result), 'generated');
});

test('upsertBlock is idempotent across repeated calls (no blank-line growth)', () => {
  const block = renderBlock('body');
  const once = upsertBlock('# Mine\n', block);
  const twice = upsertBlock(once, block);
  const thrice = upsertBlock(twice, block);
  assert.equal(twice, once);
  assert.equal(thrice, once);
});

test('upsertBlock replaces only the region and keeps surrounding content', () => {
  const before = '# Before\n\n';
  const after = '\n\n# After';
  const original = before + renderBlock('old') + after;
  const updated = upsertBlock(original, renderBlock('new body'));
  assert.ok(updated.startsWith('# Before'));
  assert.ok(updated.endsWith('# After'));
  assert.equal(extractBlockBody(updated), 'new body');
  assert.ok(!updated.includes('old'));
});

test('upsertBlock normalizes CRLF input', () => {
  const result = upsertBlock('line\r\n\r\n', renderBlock('x'));
  assert.ok(!result.includes('\r'));
});

test('body content containing an end-marker lookalike in text is not confused', () => {
  const body = 'text mentioning enchant';
  const result = upsertBlock('prefix', renderBlock(body));
  assert.equal(extractBlockBody(result), body);
});
