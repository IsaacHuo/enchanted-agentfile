import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../lib/cli.mjs';
import { EXIT } from '../lib/engine.mjs';
import { BLOCK_BEGIN, BLOCK_END } from '../lib/markers.mjs';
import { tmpdir, write, read, exists, capture } from './helpers.mjs';

/** Run the CLI against a root and capture streams + exit code. */
function cli(root, argv) {
  const cap = capture();
  const code = run(argv, { cwd: root, stdout: cap.io.stdout, stderr: cap.io.stderr });
  return { code, out: cap.out(), err: cap.err() };
}

function repo(agents = '# Shared Rules\n\nAlways run tests.\n') {
  const root = tmpdir();
  write(root, 'AGENTS.md', agents);
  return root;
}

test('sync creates every in-scope target and check then exits 0', () => {
  const root = repo();
  const sync = cli(root, ['sync', '--all']);
  assert.equal(sync.code, EXIT.OK);
  for (const rel of [
    'CLAUDE.md',
    '.cursor/rules/agents.md.mdc',
    '.github/copilot-instructions.md',
    'GEMINI.md',
    '.windsurf/rules/agents.md',
    '.clinerules',
    'CONVENTIONS.md',
  ]) {
    assert.ok(exists(root, rel), `expected ${rel} to be created`);
  }
  const check = cli(root, ['check', '--all']);
  assert.equal(check.code, EXIT.OK, check.out);
  assert.match(check.out, /in sync/);
});

test('sync is idempotent: a second run changes nothing and rewrites are byte-identical', () => {
  const root = repo();
  cli(root, ['sync', '--all']);
  const snapshot = {};
  for (const rel of ['CLAUDE.md', '.github/copilot-instructions.md', 'GEMINI.md']) {
    snapshot[rel] = read(root, rel);
  }
  const second = cli(root, ['sync', '--all']);
  assert.equal(second.code, EXIT.OK);
  assert.match(second.out, /0 created, 0 updated/);
  for (const rel of Object.keys(snapshot)) {
    assert.equal(read(root, rel), snapshot[rel], `${rel} changed on re-sync`);
  }
});

test('sync preserves hand-written content outside the managed block', () => {
  const root = repo();
  write(root, 'CLAUDE.md', '# My notes\n\nKeep this paragraph.\n');
  cli(root, ['sync', '--all']);
  const text = read(root, 'CLAUDE.md');
  assert.ok(text.includes('# My notes'));
  assert.ok(text.includes('Keep this paragraph.'));
  assert.ok(text.includes(BLOCK_BEGIN));
  assert.ok(text.includes('@AGENTS.md'));

  // Change AGENTS.md and re-sync: the notes survive, the block updates.
  write(root, 'AGENTS.md', '# Shared Rules v2\n');
  cli(root, ['sync', '--all']);
  const updated = read(root, 'CLAUDE.md');
  assert.ok(updated.includes('Keep this paragraph.'), 'notes must survive a re-sync');
  assert.ok(updated.includes(BLOCK_BEGIN) && updated.includes(BLOCK_END));
});

test('check exits 1 (drift) when a managed block no longer matches AGENTS.md', () => {
  const root = repo();
  cli(root, ['sync', '--tools', 'copilot']);
  write(root, 'AGENTS.md', '# Changed\n');
  const check = cli(root, ['check', '--tools', 'copilot']);
  assert.equal(check.code, EXIT.DRIFT);
  assert.match(check.out, /drift/);
});

test('check exits 2 (missing) for an in-scope tool with no target file', () => {
  const root = repo();
  write(root, '.cursor/.keep', '');
  const check = cli(root, ['check', '--tools', 'cursor']);
  assert.equal(check.code, EXIT.MISSING);
  assert.match(check.out, /missing/);
});

test('check exits 4 (unmanaged) when a target exists without a managed block', () => {
  const root = repo();
  write(root, '.github/copilot-instructions.md', '# hand-written, no markers\n');
  const check = cli(root, ['check', '--tools', 'copilot']);
  assert.equal(check.code, EXIT.UNMANAGED);
  assert.match(check.out, /unmanaged/);
});

test('check ORs drift and missing into a combined non-zero code', () => {
  const root = repo();
  cli(root, ['sync', '--tools', 'copilot']);
  write(root, 'AGENTS.md', '# Changed\n');
  const check = cli(root, ['check', '--all', '--require-all']);
  assert.equal(check.code, EXIT.DRIFT | EXIT.MISSING);
});

test('check exits 16 when the source file is missing', () => {
  const root = tmpdir();
  const check = cli(root, ['check', '--all']);
  assert.equal(check.code, EXIT.NO_SOURCE);
  assert.match(check.err, /source file not found/);
});

test('diff reports pending changes without writing and honours --exit-code', () => {
  const root = repo();
  const diff = cli(root, ['diff', '--all', '--exit-code']);
  assert.equal(diff.code, EXIT.DRIFT);
  assert.match(diff.out, /^\+/m);
  assert.ok(!exists(root, '.github/copilot-instructions.md'), 'diff must not write files');

  cli(root, ['sync', '--all']);
  const clean = cli(root, ['diff', '--all', '--exit-code']);
  assert.equal(clean.code, EXIT.OK);
  assert.match(clean.out, /no changes/);
});

test('unknown commands and unknown tools are usage errors (64)', () => {
  const root = repo();
  assert.equal(cli(root, ['frobnicate']).code, EXIT.USAGE);
  assert.equal(cli(root, ['sync', '--tools', 'nope']).code, EXIT.USAGE);
});

test('a config file restricts which tools are generated', () => {
  const root = repo();
  write(root, '.enchanted-agentfile.json', JSON.stringify({ tools: ['copilot'] }));
  const sync = cli(root, ['sync']);
  assert.equal(sync.code, EXIT.OK);
  assert.ok(exists(root, '.github/copilot-instructions.md'));
  assert.ok(!exists(root, 'CLAUDE.md'), 'claude was not configured and is not detected');
});
