/**
 * Dependency-free lint.
 *
 * Because this project promises zero third-party runtime dependencies, the lint
 * step enforces that promise: every import specifier must be a Node built-in
 * ("node:") or a relative path. It also parses every source file and checks
 * basic whitespace/EOL hygiene.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const SOURCE_DIRS = ['bin', 'lib', 'scripts', 'test'];
const problems = [];

function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(abs));
    else if (/\.(mjs|js)$/.test(entry.name)) out.push(abs);
  }
  return out;
}

function rel(abs) {
  return path.relative(ROOT, abs).split(path.sep).join('/');
}

const files = SOURCE_DIRS.flatMap((d) => walk(path.join(ROOT, d)));

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const name = rel(file);

  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (err) {
    problems.push(`${name}: parse error: ${String(err.stderr || err.message).trim()}`);
    continue;
  }

  if (text.includes('\r')) problems.push(`${name}: contains CR characters (expected LF)`);
  if (!text.endsWith('\n')) problems.push(`${name}: missing final newline`);

  text.split('\n').forEach((line, i) => {
    if (/[ \t]+$/.test(line)) problems.push(`${name}:${i + 1}: trailing whitespace`);
    if (/^\t/.test(line) || /\t/.test(line)) problems.push(`${name}:${i + 1}: tab character`);
  });

  if (/\brequire\s*\(/.test(text)) {
    problems.push(`${name}: uses CommonJS require in an ES module (only ESM import is allowed)`);
  }

  const specifiers = new Set();
  const fromRe = /\b(?:import|export)\b[^\n]*?from\s*['"]([^'"]+)['"]/g;
  const bareRe = /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;
  const dynamicRe = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const re of [fromRe, bareRe, dynamicRe]) {
    let m;
    while ((m = re.exec(text)) !== null) specifiers.add(m[1]);
  }
  for (const spec of specifiers) {
    const ok = spec.startsWith('node:') || spec.startsWith('./') || spec.startsWith('../');
    if (!ok) {
      problems.push(`${name}: third-party dependency "${spec}" (only node: and relative imports are allowed)`);
    }
  }
}

if (problems.length) {
  process.stderr.write(`lint: ${problems.length} problem(s)\n`);
  for (const p of problems) process.stderr.write(`  ${p}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`lint: ${files.length} files OK (zero third-party dependencies)\n`);
}
