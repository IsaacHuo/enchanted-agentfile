/**
 * Dependency-free "typecheck".
 *
 * With no TypeScript dependency available, this step validates the things a
 * type checker would catch first in a plain-ESM project: every source file
 * parses, every relative import resolves to a real file, and every named import
 * exists as an export in the target module. It is a static link check, not a
 * full type system, and the README says so.
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

const rel = (abs) => path.relative(ROOT, abs).split(path.sep).join('/');

/** Collect exported names from a module's source (tolerant regex pass). */
function collectExports(text) {
  const names = new Set();
  const patterns = [
    /\bexport\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
    /\bexport\s+class\s+([A-Za-z_$][\w$]*)/g,
    /\bexport\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(text)) !== null) names.add(m[1]);
  }
  const listRe = /\bexport\s*\{([^}]*)\}/g;
  let m;
  while ((m = listRe.exec(text)) !== null) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (name) names.add(name);
    }
  }
  if (/\bexport\s*\*/.test(text)) names.add('*');
  return names;
}

const files = SOURCE_DIRS.flatMap((d) => walk(path.join(ROOT, d)));

for (const file of files) {
  const name = rel(file);
  const text = fs.readFileSync(file, 'utf8');

  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (err) {
    problems.push(`${name}: parse error: ${String(err.stderr || err.message).trim()}`);
    continue;
  }

  const importRe = /\bimport\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
  let m;
  while ((m = importRe.exec(text)) !== null) {
    const clause = m[1];
    const spec = m[2];
    if (!spec.startsWith('./') && !spec.startsWith('../')) continue;
    const target = path.resolve(path.dirname(file), spec);
    if (!fs.existsSync(target)) {
      problems.push(`${name}: import "${spec}" does not resolve to a file`);
      continue;
    }
    const named = clause.match(/\{([^}]*)\}/);
    if (!named) continue;
    const exported = collectExports(fs.readFileSync(target, 'utf8'));
    if (exported.has('*')) continue;
    for (const part of named[1].split(',')) {
      const imported = part.trim().split(/\s+as\s+/)[0]?.trim();
      if (imported && !exported.has(imported)) {
        problems.push(`${name}: "${imported}" is not exported by ${rel(target)}`);
      }
    }
  }
}

if (problems.length) {
  process.stderr.write(`typecheck: ${problems.length} problem(s)\n`);
  for (const p of problems) process.stderr.write(`  ${p}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`typecheck: ${files.length} files OK (imports resolve, exports exist)\n`);
}
