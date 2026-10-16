/**
 * Small filesystem and string helpers shared across the CLI.
 * Zero third-party dependencies: only Node built-ins are used.
 * @module lib/util
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Whether a path exists (file, directory, or symlink).
 * @param {string} p
 * @returns {boolean}
 */
export function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether a path exists and is a directory.
 * @param {string} p
 * @returns {boolean}
 */
export function isDirectory(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Read UTF-8 text, or null when the path cannot be read.
 * @param {string} p
 * @returns {string|null}
 */
export function readText(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Write UTF-8 text, creating parent directories as needed.
 * @param {string} p
 * @param {string} content
 */
export function writeText(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
}

/**
 * Normalize line endings to "\n" so Windows checkouts do not look drifted.
 * @param {string|null|undefined} s
 * @returns {string|null}
 */
export function normalizeEol(s) {
  if (s == null) return null;
  return String(s).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * Canonical form used when comparing generated bodies: normalized and trimmed.
 * @param {string|null|undefined} s
 * @returns {string}
 */
export function canon(s) {
  return normalizeEol(s ?? '').trim();
}

/**
 * Convert a native path to forward slashes for stable, portable output.
 * @param {string} p
 * @returns {string}
 */
export function toPosix(p) {
  return p.split(path.sep).join('/');
}

/**
 * Compute a path relative to a root, using forward slashes.
 * @param {string} root
 * @param {string} abs
 * @returns {string}
 */
export function relFrom(root, abs) {
  const rel = path.relative(root, abs);
  return toPosix(rel || '.');
}
