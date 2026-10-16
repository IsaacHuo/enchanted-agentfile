/**
 * Shared test helpers. This file contains no tests; it only provides small
 * filesystem utilities used by the test files beside it.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Create a unique temporary directory for a test. */
export function tmpdir(prefix = 'eaf-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** Write a file (and its parents) under a root, returning the absolute path. */
export function write(root, rel, content) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
  return abs;
}

/** Read a file under a root. */
export function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

/** Whether a path exists under a root. */
export function exists(root, rel) {
  return fs.existsSync(path.join(root, rel));
}

/** Capture the stdout/stderr of the CLI's `run` for assertions. */
export function capture() {
  const state = { out: '', err: '' };
  return {
    io: {
      stdout: (s) => {
        state.out += s;
      },
      stderr: (s) => {
        state.err += s;
      },
    },
    out: () => state.out,
    err: () => state.err,
  };
}
